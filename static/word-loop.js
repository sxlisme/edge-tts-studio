import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { encodeWavToMp3 } from "./audio-export.js";
import { renderTimelineToWav } from "./audio-utils.js";

const MAX_LINES = 10_000;
const MAX_LINE_CHARACTERS = 100;
const MAX_VISIBLE_TASKS = 300;
const MAX_VISIBLE_FAILURES = 300;
const CONCURRENCY = 3;
const RETRIES = 3;
const DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural";

function clampNumber(input, minimum, maximum) {
  const value = Number(input.value);
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : minimum;
}

function signedPercent(value) {
  return `${value >= 0 ? "+" : ""}${value}%`;
}

function signedPitch(value) {
  return `${value >= 0 ? "+" : ""}${value}Hz`;
}

function hashVoiceName(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function avatarIndexForVoice(voice) {
  const gender = String(voice?.gender || "").toLocaleLowerCase("en-US");
  const indexes = gender === "female" ? [0, 2, 4, 6, 8] : gender === "male" ? [1, 3, 5, 7] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
  return indexes[hashVoiceName(voice?.shortName || "voice") % indexes.length];
}

function applyVoiceAvatar(element, voice) {
  const index = avatarIndexForVoice(voice);
  element.classList.add("voice-avatar-image");
  element.style.setProperty("--voice-avatar-x", `${(index % 3) * 50}%`);
  element.style.setProperty("--voice-avatar-y", `${Math.floor(index / 3) * 50}%`);
  element.textContent = "";
  element.setAttribute("aria-hidden", "true");
}

function bytesFromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function exportName(format) {
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join("");
  return `单词配音-${stamp}.${format}`;
}

export function initializeWordLoop(refreshIcons) {
  const elements = {
    input: document.querySelector("#wordLoopInput"),
    lineCount: document.querySelector("#wordLoopLineCount"),
    inputHint: document.querySelector("#wordLoopInputHint"),
    clearButton: document.querySelector("#wordLoopClearButton"),
    importButton: document.querySelector("#wordLoopImportButton"),
    exportMenu: document.querySelector("#wordLoopExportMenu"),
    exportPopover: document.querySelector("#wordLoopExportPopover"),
    exportButton: document.querySelector("#wordLoopExportButton"),
    exportOptions: [...document.querySelectorAll("[data-word-loop-export-format]")],
    voicePresets: document.querySelector("#wordLoopVoicePresets"),
    localeSelect: document.querySelector("#wordLoopLocaleSelect"),
    voiceSelect: document.querySelector("#wordLoopVoiceSelect"),
    selectVoiceAvatar: document.querySelector("#wordLoopSelectVoiceAvatar"),
    repeatCount: document.querySelector("#wordLoopRepeatCount"),
    repeatGap: document.querySelector("#wordLoopRepeatGap"),
    nextGap: document.querySelector("#wordLoopNextGap"),
    rate: document.querySelector("#wordLoopRate"),
    rateOutput: document.querySelector("#wordLoopRateOutput"),
    pitch: document.querySelector("#wordLoopPitch"),
    pitchOutput: document.querySelector("#wordLoopPitchOutput"),
    volume: document.querySelector("#wordLoopVolume"),
    volumeOutput: document.querySelector("#wordLoopVolumeOutput"),
    generateButton: document.querySelector("#wordLoopGenerateButton"),
    stopButton: document.querySelector("#wordLoopStopButton"),
    progressBar: document.querySelector("#wordLoopProgressBar"),
    percent: document.querySelector("#wordLoopPercent"),
    progressText: document.querySelector("#wordLoopProgressText"),
    totalCount: document.querySelector("#wordLoopTotalCount"),
    successCount: document.querySelector("#wordLoopSuccessCount"),
    failedCount: document.querySelector("#wordLoopFailedCount"),
    duration: document.querySelector("#wordLoopDuration"),
    result: document.querySelector("#wordLoopResult"),
    audio: document.querySelector("#wordLoopAudio"),
    playerToggle: document.querySelector("#wordLoopPlayerToggle"),
    currentTime: document.querySelector("#wordLoopCurrentTime"),
    durationTime: document.querySelector("#wordLoopDurationTime"),
    progressSlider: document.querySelector("#wordLoopProgressSlider"),
    playerVolume: document.querySelector("#wordLoopPlayerVolume"),
    resultMeta: document.querySelector("#wordLoopResultMeta"),
    error: document.querySelector("#wordLoopError"),
    taskList: document.querySelector("#wordLoopTaskList"),
  };

  let voices = [];
  let selectedVoiceName = "";
  let selectedLanguage = "";
  let loadingVoices = false;
  let running = false;
  let cancelled = false;
  let tasks = [];
  let taskIndexesByText = new Map();
  let taskRows = new Map();
  let taskListSummary = null;
  let successCount = 0;
  let failedCount = 0;
  let wavBytes = null;
  let mp3Bytes = null;
  let resultUrl = "";
  let exportMenuOpen = false;
  let exporting = false;
  let activeSelectControl = null;
  let localeControl = null;
  let voiceControl = null;
  const audioCache = new Map();

  function parseLines() {
    return elements.input.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function inputValidation() {
    const lines = parseLines();
    if (!lines.length) return { lines, message: "请先输入至少一个单词或短句" };
    if (lines.length > MAX_LINES) return { lines, message: `内容共有 ${lines.length} 行，最多支持 ${MAX_LINES} 行` };
    const oversizedIndex = lines.findIndex((line) => [...line].length > MAX_LINE_CHARACTERS);
    if (oversizedIndex >= 0) return { lines, message: `第 ${oversizedIndex + 1} 行超过 ${MAX_LINE_CHARACTERS} 字，请缩短后再生成` };
    return { lines, message: "" };
  }

  function setError(message = "") {
    elements.error.textContent = message;
    elements.error.hidden = !message;
  }

  function closeExportMenu() {
    exportMenuOpen = false;
    elements.exportPopover.hidden = true;
    elements.exportMenu.classList.remove("is-open");
    elements.exportButton.setAttribute("aria-expanded", "false");
  }

  function openExportMenu() {
    if (elements.exportButton.disabled || exporting) return;
    activeSelectControl?.close();
    exportMenuOpen = true;
    elements.exportPopover.hidden = false;
    elements.exportMenu.classList.add("is-open");
    elements.exportButton.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => elements.exportOptions[0]?.focus());
  }

  function setExportDisabled(disabled) {
    elements.exportButton.disabled = disabled;
    for (const option of elements.exportOptions) option.disabled = disabled;
    if (disabled) closeExportMenu();
  }

  function revokeResult() {
    elements.audio.pause();
    elements.audio.removeAttribute("src");
    elements.result.classList.remove("is-playing");
    elements.playerToggle.setAttribute("aria-label", "播放");
    elements.progressSlider.value = 0;
    elements.currentTime.textContent = "00:00";
    elements.durationTime.textContent = "00:00";
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = "";
    wavBytes = null;
    mp3Bytes = null;
    elements.result.hidden = true;
    setExportDisabled(true);
  }

  function updateInputState() {
    const validation = inputValidation();
    const availableVoiceCount = selectedLanguage ? filteredVoices().length : voices.length;
    elements.lineCount.textContent = validation.lines.length.toLocaleString("zh-CN");
    elements.inputHint.textContent = validation.message || "空行会自动忽略，每行最多 100 字，最多 10,000 行";
    elements.inputHint.classList.toggle("has-error", Boolean(validation.message));
    elements.generateButton.disabled = running || loadingVoices || !selectedVoiceName || Boolean(validation.message);
    elements.importButton.disabled = running;
    elements.clearButton.disabled = running;
    localeControl?.setDisabled(running || loadingVoices || !voices.length);
    voiceControl?.setDisabled(running || loadingVoices || !availableVoiceCount);
    for (const input of [elements.repeatCount, elements.repeatGap, elements.nextGap, elements.rate, elements.pitch, elements.volume]) {
      input.disabled = running;
    }
  }

  function createUiSelect(root, onChange) {
    const trigger = root.querySelector(".ui-select-trigger");
    const valueElement = root.querySelector(".ui-select-value");
    const popover = root.querySelector(".ui-select-popover");
    const optionsElement = root.querySelector(".ui-select-options");
    const searchInput = root.querySelector("input[type='search']");
    let options = [];
    let selectedValue = null;
    let disabled = trigger.disabled;

    function updateTrigger(fallbackLabel = "请选择", fallbackDescription = "") {
      const option = options.find((item) => item.value === selectedValue);
      const label = document.createElement("strong");
      const description = document.createElement("small");
      label.textContent = option?.label || fallbackLabel;
      description.textContent = option?.description || fallbackDescription;
      valueElement.replaceChildren(label, description);
    }

    function renderOptions(filter = "") {
      const query = filter.trim().toLocaleLowerCase("zh-CN");
      const visibleOptions = options.filter((option) => {
        const content = `${option.label} ${option.description || ""} ${option.code || ""} ${option.keywords || ""} ${option.value}`;
        return !query || content.toLocaleLowerCase("zh-CN").includes(query);
      });
      optionsElement.replaceChildren();
      if (!visibleOptions.length) {
        const empty = document.createElement("div");
        empty.className = "ui-select-empty";
        empty.textContent = "没有匹配的选项";
        optionsElement.append(empty);
        return;
      }
      for (const option of visibleOptions) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "ui-select-option";
        item.setAttribute("role", "option");
        const isSelected = option.value === selectedValue;
        item.classList.toggle("is-selected", isSelected);
        item.setAttribute("aria-selected", String(isSelected));
        const copy = document.createElement("span");
        copy.className = "ui-select-option-copy";
        const label = document.createElement("strong");
        label.textContent = option.label;
        const description = document.createElement("small");
        description.textContent = option.description || "";
        copy.append(label, description);
        if (option.code) {
          const code = document.createElement("code");
          code.textContent = option.code;
          copy.append(code);
        }
        const check = document.createElement("i");
        check.dataset.lucide = "check";
        if (Number.isInteger(option.avatarIndex)) {
          const avatar = document.createElement("span");
          avatar.className = "ui-select-option-avatar voice-avatar-image";
          avatar.style.setProperty("--voice-avatar-x", `${(option.avatarIndex % 3) * 50}%`);
          avatar.style.setProperty("--voice-avatar-y", `${Math.floor(option.avatarIndex / 3) * 50}%`);
          avatar.setAttribute("aria-hidden", "true");
          item.classList.add("has-avatar");
          item.append(avatar, copy, check);
        } else {
          item.append(copy, check);
        }
        item.addEventListener("click", () => selectValue(option.value, true));
        optionsElement.append(item);
      }
      refreshIcons();
    }

    function openSelect() {
      if (disabled) return;
      if (activeSelectControl && activeSelectControl !== control) activeSelectControl.close();
      activeSelectControl = control;
      popover.hidden = false;
      root.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      document.body.classList.add("select-open");
      renderOptions(searchInput?.value || "");
      requestAnimationFrame(() => (searchInput || optionsElement.querySelector(".is-selected") || optionsElement.querySelector("button"))?.focus());
    }

    function close() {
      popover.hidden = true;
      root.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
      if (activeSelectControl === control) activeSelectControl = null;
      document.body.classList.toggle("select-open", Boolean(activeSelectControl));
      if (searchInput) {
        searchInput.value = "";
        renderOptions();
      }
    }

    function selectValue(nextValue, notify = false) {
      if (!options.some((option) => option.value === nextValue)) return false;
      selectedValue = nextValue;
      updateTrigger();
      renderOptions(searchInput?.value || "");
      close();
      if (notify) onChange?.(selectedValue);
      return true;
    }

    const control = {
      close,
      get value() { return selectedValue ?? ""; },
      setOptions(nextOptions) {
        options = nextOptions;
        if (!options.some((option) => option.value === selectedValue)) selectedValue = null;
        updateTrigger();
        renderOptions();
      },
      setValue: selectValue,
      setDisabled(nextDisabled) {
        disabled = nextDisabled;
        trigger.disabled = nextDisabled;
        root.classList.toggle("is-disabled", nextDisabled);
        if (nextDisabled) close();
      },
      setLoading(label, description) {
        options = [];
        selectedValue = null;
        disabled = true;
        trigger.disabled = true;
        root.classList.add("is-disabled");
        updateTrigger(label, description);
        renderOptions();
        close();
      },
      setError(label, description) {
        this.setLoading(label, description);
      },
    };
    trigger.addEventListener("click", () => popover.hidden ? openSelect() : close());
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        openSelect();
      }
    });
    searchInput?.addEventListener("input", () => renderOptions(searchInput.value));
    popover.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        trigger.focus();
      }
    });
    return control;
  }

  function filteredVoices() {
    if (!selectedLanguage) return voices;
    return voices.filter((voice) => voice.locale.toLocaleLowerCase("en-US").startsWith(`${selectedLanguage}-`));
  }

  function languageOptions() {
    const counts = new Map();
    for (const voice of voices) {
      const language = voice.locale.split("-")[0].toLocaleLowerCase("en-US");
      counts.set(language, (counts.get(language) || 0) + 1);
    }
    const preferredLabels = new Map([
      ["zh", "中文"], ["en", "英文"], ["ja", "日文"], ["ko", "韩文"],
    ]);
    let displayNames = null;
    try {
      displayNames = new Intl.DisplayNames(["zh-CN"], { type: "language" });
    } catch (_) {
      displayNames = null;
    }
    const priority = ["zh", "en", "ja", "ko"];
    const languages = [...counts.keys()].sort((left, right) => {
      const leftPriority = priority.indexOf(left);
      const rightPriority = priority.indexOf(right);
      if (leftPriority >= 0 || rightPriority >= 0) return (leftPriority < 0 ? 99 : leftPriority) - (rightPriority < 0 ? 99 : rightPriority);
      return (displayNames?.of(left) || left).localeCompare(displayNames?.of(right) || right, "zh-CN");
    });
    return [
      { value: "", label: "全部语言", description: `${voices.length} 个音色`, keywords: "所有 全部" },
      ...languages.map((language) => ({
        value: language,
        label: preferredLabels.get(language) || displayNames?.of(language) || language.toUpperCase(),
        description: `${counts.get(language)} 个音色`,
        keywords: language,
      })),
    ];
  }

  function updateVoiceSelection() {
    const voice = voices.find((item) => item.shortName === selectedVoiceName);
    if (!voice) return;
    applyVoiceAvatar(elements.selectVoiceAvatar, voice);
    for (const preset of elements.voicePresets.querySelectorAll(".voice-preset")) {
      preset.classList.toggle("is-selected", preset.dataset.voice === voice.shortName);
    }
  }

  function renderVoicePresets(availableVoices) {
    const fragment = document.createDocumentFragment();
    for (const voice of availableVoices.slice(0, 4)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "voice-preset";
      button.dataset.voice = voice.shortName;
      button.title = `${voice.displayName} · ${voice.genderName} · ${voice.localeName}`;
      const avatar = document.createElement("span");
      avatar.className = "preset-avatar";
      applyVoiceAvatar(avatar, voice);
      const name = document.createElement("strong");
      name.textContent = voice.displayName;
      const detail = document.createElement("small");
      detail.textContent = voice.genderName;
      button.append(avatar, name, detail);
      button.addEventListener("click", () => voiceControl.setValue(voice.shortName, true));
      fragment.append(button);
    }
    elements.voicePresets.replaceChildren(fragment);
    updateVoiceSelection();
  }

  function selectVoice(shortName) {
    if (selectedVoiceName !== shortName) revokeResult();
    selectedVoiceName = shortName;
    updateVoiceSelection();
    updateInputState();
  }

  function updateFilteredVoices() {
    const availableVoices = filteredVoices();
    const previousVoiceName = selectedVoiceName;
    renderVoicePresets(availableVoices);
    voiceControl.setOptions(availableVoices.map((voice) => ({
      value: voice.shortName,
      label: voice.displayName,
      description: `${voice.genderName} · ${voice.localeName}`,
      code: voice.shortName,
      avatarIndex: avatarIndexForVoice(voice),
      keywords: `${voice.friendlyName || ""} ${voice.locale}`,
    })));
    const selectedIsAvailable = availableVoices.some((voice) => voice.shortName === selectedVoiceName);
    const preferred = selectedIsAvailable
      ? selectedVoiceName
      : availableVoices.find((voice) => voice.shortName === DEFAULT_VOICE)?.shortName || availableVoices[0]?.shortName;
    selectedVoiceName = preferred || "";
    if (selectedVoiceName !== previousVoiceName) revokeResult();
    if (preferred) voiceControl.setValue(preferred);
    voiceControl.setDisabled(!availableVoices.length);
    updateVoiceSelection();
    updateInputState();
  }

  function selectLanguage(language) {
    selectedLanguage = language;
    updateFilteredVoices();
  }

  async function loadVoices() {
    if (voices.length || loadingVoices) return;
    loadingVoices = true;
    localeControl.setLoading("正在载入语言", "请稍候");
    voiceControl.setLoading("正在载入音色", "请稍候");
    updateInputState();
    try {
      const payload = await invoke("list_voices", { locale: null });
      voices = payload.voices;
      localeControl.setOptions(languageOptions());
      localeControl.setValue("");
      localeControl.setDisabled(!voices.length);
      selectedLanguage = "";
      updateFilteredVoices();
      if (!voices.length) setError("没有找到可用音色，请检查网络后重试");
    } catch (error) {
      localeControl.setError("语言载入失败", "请检查网络后重试");
      voiceControl.setError("音色载入失败", "请检查网络后重试");
      setError(`音色载入失败：${error?.message || error}`);
    } finally {
      loadingVoices = false;
      updateInputState();
    }
  }

  function taskStatusLabel(status) {
    return {
      pending: "等待中",
      running: "生成中",
      retrying: "重试中",
      success: "已完成",
      error: "生成失败",
      cancelled: "已停止",
    }[status] || "等待中";
  }

  function createTaskRow(task, index) {
    const row = document.createElement("li");
    const number = document.createElement("span");
    number.className = "word-loop-task-number";
    number.textContent = String(index + 1).padStart(4, "0");
    const copy = document.createElement("span");
    copy.className = "word-loop-task-copy";
    const text = document.createElement("strong");
    const detail = document.createElement("small");
    text.textContent = task.text;
    copy.append(text, detail);
    const status = document.createElement("span");
    status.className = "word-loop-task-status";
    row.append(number, copy, status);
    taskRows.set(index, { row, detail, status });
    updateTaskRow(index);
    return row;
  }

  function updateTaskRow(index) {
    const task = tasks[index];
    const parts = taskRows.get(index);
    if (!task || !parts) return;
    parts.row.className = `word-loop-task-item is-${task.status}`;
    parts.detail.textContent = task.detail || `播放 ${clampNumber(elements.repeatCount, 1, 20)} 次`;
    parts.status.textContent = taskStatusLabel(task.status);
  }

  function renderTaskList() {
    taskRows = new Map();
    const fragment = document.createDocumentFragment();
    const visibleCount = Math.min(tasks.length, MAX_VISIBLE_TASKS);
    for (let index = 0; index < visibleCount; index += 1) fragment.append(createTaskRow(tasks[index], index));
    taskListSummary = null;
    if (tasks.length > visibleCount) {
      taskListSummary = document.createElement("li");
      taskListSummary.className = "word-loop-task-summary";
      taskListSummary.textContent = `为保持界面流畅，列表展示前 ${MAX_VISIBLE_TASKS} 条；全部 ${tasks.length.toLocaleString("zh-CN")} 条仍会生成`;
      fragment.append(taskListSummary);
    }
    elements.taskList.replaceChildren(fragment);
  }

  function renderProgress() {
    const total = tasks.length;
    const percent = total ? successCount / total * 100 : 0;
    elements.totalCount.textContent = total.toLocaleString("zh-CN");
    elements.successCount.textContent = successCount.toLocaleString("zh-CN");
    elements.failedCount.textContent = failedCount.toLocaleString("zh-CN");
    elements.progressBar.max = Math.max(1, total);
    elements.progressBar.value = successCount;
    elements.percent.textContent = `${percent.toFixed(2)}%`;
    if (running) elements.progressText.textContent = `正在生成 ${successCount} / ${total} · 并发 ${CONCURRENCY}`;
  }

  function updateTasksForText(text, status, detail = "") {
    const indexes = taskIndexesByText.get(text) || [];
    for (const index of indexes) {
      const task = tasks[index];
      if (task.status === "success") successCount -= 1;
      if (task.status === "error") failedCount -= 1;
      task.status = status;
      task.detail = detail;
      if (status === "success") successCount += 1;
      if (status === "error") failedCount += 1;
      if (status === "error" && !taskRows.has(index) && failedCount <= MAX_VISIBLE_FAILURES) {
        elements.taskList.insertBefore(createTaskRow(task, index), taskListSummary);
      } else {
        updateTaskRow(index);
      }
    }
    renderProgress();
  }

  async function synthesizeWithRetries(text, options, cacheKey) {
    if (audioCache.has(cacheKey)) return audioCache.get(cacheKey);
    let lastError;
    for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
      if (cancelled) throw new Error("任务已停止");
      updateTasksForText(text, attempt === 0 ? "running" : "retrying", attempt === 0 ? "正在请求语音" : `第 ${attempt} / ${RETRIES} 次重试`);
      try {
        const result = await invoke("synthesize_word_loop_item", { options: { ...options, text } });
        const bytes = bytesFromBase64(result.audioBase64);
        audioCache.set(cacheKey, bytes);
        return bytes;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  async function decodeAudio(bytes, context) {
    const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return context.decodeAudioData(source);
  }

  async function generate() {
    const validation = inputValidation();
    if (validation.message || !selectedVoiceName || running) {
      updateInputState();
      return;
    }
    const repeatCount = clampNumber(elements.repeatCount, 1, 20);
    const repeatGapSeconds = clampNumber(elements.repeatGap, 0, 10000) / 1000;
    const nextGapSeconds = clampNumber(elements.nextGap, 0, 10000) / 1000;
    const rate = clampNumber(elements.rate, -100, 100);
    const pitch = clampNumber(elements.pitch, -100, 100);
    const volume = clampNumber(elements.volume, -100, 100);
    const voiceName = selectedVoiceName;
    elements.repeatCount.value = repeatCount;
    elements.repeatGap.value = Math.round(repeatGapSeconds * 1000);
    elements.nextGap.value = Math.round(nextGapSeconds * 1000);
    elements.rate.value = rate;
    elements.pitch.value = pitch;
    elements.volume.value = volume;

    running = true;
    cancelled = false;
    revokeResult();
    setError();
    elements.duration.textContent = "--";
    elements.generateButton.classList.add("is-loading");
    elements.generateButton.querySelector("span").textContent = "正在生成";
    elements.stopButton.hidden = false;
    elements.stopButton.disabled = false;
    tasks = validation.lines.map((text) => ({ text, status: "pending", detail: "" }));
    taskIndexesByText = new Map();
    tasks.forEach((task, index) => {
      const indexes = taskIndexesByText.get(task.text) || [];
      indexes.push(index);
      taskIndexesByText.set(task.text, indexes);
    });
    successCount = 0;
    failedCount = 0;
    renderTaskList();
    renderProgress();
    updateInputState();

    const uniqueTexts = [...new Set(validation.lines)];
    const options = {
      voice: voiceName,
      rate: signedPercent(rate),
      pitch: signedPitch(pitch),
      volume: signedPercent(volume),
    };
    const results = new Map();
    let workIndex = 0;
    const worker = async () => {
      while (!cancelled) {
        const index = workIndex;
        workIndex += 1;
        if (index >= uniqueTexts.length) return;
        const text = uniqueTexts[index];
        const cacheKey = `${voiceName}\u0000${rate}\u0000${pitch}\u0000${volume}\u0000${text}`;
        try {
          const bytes = await synthesizeWithRetries(text, options, cacheKey);
          if (cancelled) return;
          results.set(text, bytes);
          updateTasksForText(text, "success", "语音素材生成成功");
        } catch (error) {
          if (cancelled) return;
          updateTasksForText(text, "error", String(error?.message || error || "未知错误"));
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, uniqueTexts.length) }, worker));
      if (cancelled) {
        tasks.forEach((task, index) => {
          if (["pending", "running", "retrying"].includes(task.status)) {
            task.status = "cancelled";
            updateTaskRow(index);
          }
        });
        elements.progressText.textContent = "任务已停止";
        renderProgress();
        return;
      }
      if (failedCount) {
        elements.progressText.textContent = `生成失败 ${failedCount} 项，请检查失败详情后重试`;
        setError(`有 ${failedCount} 个内容重试 3 次后仍生成失败，未合成最终音频。再次点击生成可重新尝试。`);
        return;
      }

      elements.progressText.textContent = "语音生成完成，正在合并音频";
      await new Promise((resolve) => setTimeout(resolve, 20));
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("当前系统不支持音频合成");
      const context = new AudioContextClass();
      const decoded = new Map();
      try {
        let decodeIndex = 0;
        const decodeWorker = async () => {
          while (decodeIndex < uniqueTexts.length) {
            const text = uniqueTexts[decodeIndex];
            decodeIndex += 1;
            decoded.set(text, await decodeAudio(results.get(text), context));
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, uniqueTexts.length) }, decodeWorker));
      } finally {
        await context.close();
      }
      const timeline = [];
      validation.lines.forEach((text, lineIndex) => {
        for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
          timeline.push({ buffer: decoded.get(text) });
          if (repeatIndex < repeatCount - 1 && repeatGapSeconds > 0) timeline.push({ silenceSeconds: repeatGapSeconds });
        }
        if (lineIndex < validation.lines.length - 1 && nextGapSeconds > 0) timeline.push({ silenceSeconds: nextGapSeconds });
      });
      wavBytes = renderTimelineToWav(timeline);
      const totalSeconds = timeline.reduce((sum, item) => sum + (item.buffer?.duration || item.silenceSeconds || 0), 0);
      elements.duration.textContent = formatDuration(totalSeconds);
      const blob = new Blob([wavBytes], { type: "audio/wav" });
      resultUrl = URL.createObjectURL(blob);
      elements.audio.src = resultUrl;
      elements.resultMeta.textContent = `${validation.lines.length} 项 · 每项 ${repeatCount} 次 · ${formatDuration(totalSeconds)}`;
      elements.result.hidden = false;
      elements.durationTime.textContent = formatDuration(totalSeconds);
      setExportDisabled(false);
      elements.progressText.textContent = `合成完成 ${validation.lines.length} / ${validation.lines.length}`;
      elements.audio.play().catch(() => {});
    } catch (error) {
      elements.progressText.textContent = "合成失败";
      setError(`音频合成失败：${error?.message || error}`);
    } finally {
      running = false;
      elements.stopButton.hidden = true;
      elements.stopButton.disabled = false;
      elements.generateButton.classList.remove("is-loading");
      elements.generateButton.querySelector("span").textContent = "生成循环音频";
      updateInputState();
    }
  }

  async function importText() {
    if (running) return;
    setError();
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: "导入单词文本",
        filters: [{ name: "文本文件", extensions: ["txt", "text"] }],
      });
      if (!selected) return;
      const [file] = await invoke("read_batch_text_files", { paths: [selected] });
      elements.input.value = file.text;
      revokeResult();
      updateInputState();
      elements.inputHint.textContent = file.encoding === "UTF-8"
        ? `已导入 ${file.name}`
        : `已导入 ${file.name}，并自动转换 ${file.encoding} 编码`;
    } catch (error) {
      setError(`导入失败：${error?.message || error}`);
    }
  }

  async function exportAudio(requestedFormat) {
    if (!wavBytes || exporting) return;
    const format = requestedFormat === "wav" ? "wav" : "mp3";
    exporting = true;
    closeExportMenu();
    setExportDisabled(true);
    elements.exportButton.querySelector("span").textContent = `正在导出 ${format.toUpperCase()}`;
    try {
      const destination = await save({
        defaultPath: exportName(format),
        filters: [{ name: `${format.toUpperCase()} 音频`, extensions: [format] }],
      });
      if (!destination) return;
      let outputBytes = format === "mp3" ? mp3Bytes : wavBytes;
      if (format === "mp3" && !outputBytes) {
        elements.progressText.textContent = "正在编码 MP3 0%";
        outputBytes = await encodeWavToMp3(wavBytes, {
          onProgress(progress) {
            elements.progressText.textContent = `正在编码 MP3 ${(progress * 100).toFixed(0)}%`;
          },
        });
        mp3Bytes = outputBytes;
      }
      await writeFile(destination, outputBytes);
      elements.resultMeta.textContent = `已导出：${destination}`;
      elements.progressText.textContent = `已导出 ${format.toUpperCase()} 音频`;
    } catch (error) {
      setError(`导出失败：${error?.message || error}`);
    } finally {
      exporting = false;
      elements.exportButton.querySelector("span").textContent = "导出音频";
      setExportDisabled(!wavBytes);
    }
  }

  localeControl = createUiSelect(elements.localeSelect, selectLanguage);
  voiceControl = createUiSelect(elements.voiceSelect, selectVoice);

  function updateRangeOutputs() {
    const rate = Number(elements.rate.value);
    const pitch = Number(elements.pitch.value);
    const volume = Number(elements.volume.value);
    elements.rateOutput.textContent = `${rate > 0 ? "+" : ""}${rate}%`;
    elements.pitchOutput.textContent = `${pitch > 0 ? "+" : ""}${pitch} Hz`;
    elements.volumeOutput.textContent = `${volume > 0 ? "+" : ""}${volume}%`;
  }

  elements.input.addEventListener("input", () => {
    revokeResult();
    updateInputState();
  });
  elements.clearButton.addEventListener("click", () => {
    elements.input.value = "";
    revokeResult();
    updateInputState();
    elements.input.focus();
  });
  elements.importButton.addEventListener("click", importText);
  elements.exportButton.addEventListener("click", () => exportMenuOpen ? closeExportMenu() : openExportMenu());
  for (const option of elements.exportOptions) {
    option.addEventListener("click", () => exportAudio(option.dataset.wordLoopExportFormat));
  }
  elements.generateButton.addEventListener("click", generate);
  elements.stopButton.addEventListener("click", () => {
    cancelled = true;
    elements.stopButton.disabled = true;
    elements.progressText.textContent = "正在停止当前任务";
  });
  for (const input of [elements.repeatCount, elements.repeatGap, elements.nextGap]) {
    input.addEventListener("change", () => {
      revokeResult();
      updateInputState();
    });
  }
  for (const input of [elements.rate, elements.pitch, elements.volume]) {
    input.addEventListener("input", () => {
      updateRangeOutputs();
      revokeResult();
      updateInputState();
    });
  }
  document.addEventListener("pointerdown", (event) => {
    if (exportMenuOpen && !elements.exportMenu.contains(event.target)) closeExportMenu();
    if (activeSelectControl && !elements.localeSelect.contains(event.target) && !elements.voiceSelect.contains(event.target)) {
      activeSelectControl.close();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && exportMenuOpen) {
      closeExportMenu();
      elements.exportButton.focus();
    }
    if (event.key === "Escape" && activeSelectControl) activeSelectControl.close();
  });
  window.addEventListener("beforeunload", revokeResult);
  elements.playerToggle.addEventListener("click", () => {
    if (!elements.audio.getAttribute("src")) return;
    if (elements.audio.paused) elements.audio.play().catch(() => {});
    else elements.audio.pause();
  });
  elements.audio.addEventListener("play", () => {
    elements.result.classList.add("is-playing");
    elements.playerToggle.setAttribute("aria-label", "暂停");
  });
  elements.audio.addEventListener("pause", () => {
    elements.result.classList.remove("is-playing");
    elements.playerToggle.setAttribute("aria-label", "播放");
  });
  elements.audio.addEventListener("timeupdate", () => {
    elements.currentTime.textContent = formatDuration(elements.audio.currentTime);
    elements.progressSlider.value = elements.audio.duration ? Math.round(elements.audio.currentTime / elements.audio.duration * 1000) : 0;
  });
  elements.audio.addEventListener("loadedmetadata", () => {
    elements.durationTime.textContent = formatDuration(elements.audio.duration);
  });
  elements.progressSlider.addEventListener("input", () => {
    if (elements.audio.duration) elements.audio.currentTime = Number(elements.progressSlider.value) / 1000 * elements.audio.duration;
  });
  elements.playerVolume.addEventListener("input", () => {
    elements.audio.volume = Number(elements.playerVolume.value);
  });

  updateInputState();
  updateRangeOutputs();

  return {
    prepare: loadVoices,
    pause() {
      elements.audio.pause();
      activeSelectControl?.close();
      closeExportMenu();
    },
  };
}
