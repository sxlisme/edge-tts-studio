import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { renderTimelineToWav } from "./audio-utils.js";

const MAX_LINES = 500;
const MAX_LINE_CHARACTERS = 100;
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

function bytesFromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function exportName() {
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join("");
  return `单词循环-${stamp}.wav`;
}

export function initializeWordLoop(refreshIcons) {
  const elements = {
    input: document.querySelector("#wordLoopInput"),
    lineCount: document.querySelector("#wordLoopLineCount"),
    inputHint: document.querySelector("#wordLoopInputHint"),
    clearButton: document.querySelector("#wordLoopClearButton"),
    importButton: document.querySelector("#wordLoopImportButton"),
    exportButton: document.querySelector("#wordLoopExportButton"),
    voicePicker: document.querySelector("#wordLoopVoicePicker"),
    voiceSearch: document.querySelector("#wordLoopVoiceSearch"),
    voiceResults: document.querySelector("#wordLoopVoiceResults"),
    selectedVoice: document.querySelector("#wordLoopSelectedVoice"),
    repeatCount: document.querySelector("#wordLoopRepeatCount"),
    repeatGap: document.querySelector("#wordLoopRepeatGap"),
    nextGap: document.querySelector("#wordLoopNextGap"),
    rate: document.querySelector("#wordLoopRate"),
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
    resultMeta: document.querySelector("#wordLoopResultMeta"),
    error: document.querySelector("#wordLoopError"),
    taskList: document.querySelector("#wordLoopTaskList"),
  };

  let voices = [];
  let selectedVoiceName = "";
  let loadingVoices = false;
  let running = false;
  let cancelled = false;
  let tasks = [];
  let wavBytes = null;
  let resultUrl = "";
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

  function revokeResult() {
    elements.audio.pause();
    elements.audio.removeAttribute("src");
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = "";
    wavBytes = null;
    elements.result.hidden = true;
    elements.exportButton.disabled = true;
  }

  function updateInputState() {
    const validation = inputValidation();
    elements.lineCount.textContent = validation.lines.length.toLocaleString("zh-CN");
    elements.inputHint.textContent = validation.message || "空行会自动忽略，每行最多 100 字";
    elements.inputHint.classList.toggle("has-error", Boolean(validation.message));
    elements.generateButton.disabled = running || loadingVoices || !selectedVoiceName || Boolean(validation.message);
    elements.importButton.disabled = running;
    elements.clearButton.disabled = running;
  }

  function voiceSearchContent(voice) {
    return `${voice.displayName} ${voice.friendlyName} ${voice.shortName} ${voice.locale} ${voice.localeName} ${voice.genderName}`.toLocaleLowerCase("zh-CN");
  }

  function closeVoiceResults() {
    elements.voiceResults.hidden = true;
    elements.voicePicker.classList.remove("is-open");
  }

  function renderSelectedVoice() {
    const voice = voices.find((item) => item.shortName === selectedVoiceName);
    const avatar = document.createElement("span");
    avatar.className = "voice-prefix";
    avatar.textContent = voice?.gender === "Female" ? "女" : voice?.gender === "Male" ? "男" : "声";
    const copy = document.createElement("div");
    const name = document.createElement("strong");
    const detail = document.createElement("small");
    name.textContent = voice?.displayName || (loadingVoices ? "正在载入音色" : "请选择朗读音色");
    detail.textContent = voice ? `${voice.genderName} · ${voice.localeName} · ${voice.shortName}` : loadingVoices ? "请稍候" : "在上方搜索并选择";
    copy.append(name, detail);
    elements.selectedVoice.replaceChildren(avatar, copy);
  }

  function selectVoice(shortName) {
    selectedVoiceName = shortName;
    const voice = voices.find((item) => item.shortName === shortName);
    elements.voiceSearch.value = voice?.displayName || "";
    renderSelectedVoice();
    closeVoiceResults();
    updateInputState();
  }

  function renderVoiceResults() {
    const query = elements.voiceSearch.value.trim().toLocaleLowerCase("zh-CN");
    const matches = voices.filter((voice) => !query || voiceSearchContent(voice).includes(query)).slice(0, 100);
    elements.voiceResults.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "word-loop-voice-empty";
      empty.textContent = loadingVoices ? "正在载入音色" : "没有匹配的音色";
      elements.voiceResults.append(empty);
    }
    for (const voice of matches) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "word-loop-voice-option";
      button.classList.toggle("is-selected", voice.shortName === selectedVoiceName);
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(voice.shortName === selectedVoiceName));
      const copy = document.createElement("span");
      const name = document.createElement("strong");
      const detail = document.createElement("small");
      name.textContent = voice.displayName;
      detail.textContent = `${voice.genderName} · ${voice.localeName} · ${voice.shortName}`;
      copy.append(name, detail);
      const check = document.createElement("i");
      check.dataset.lucide = "check";
      button.append(copy, check);
      button.addEventListener("click", () => selectVoice(voice.shortName));
      elements.voiceResults.append(button);
    }
    elements.voiceResults.hidden = false;
    elements.voicePicker.classList.add("is-open");
    refreshIcons();
  }

  async function loadVoices() {
    if (voices.length || loadingVoices) return;
    loadingVoices = true;
    renderSelectedVoice();
    updateInputState();
    try {
      const payload = await invoke("list_voices", { locale: null });
      voices = payload.voices;
      const preferred = voices.find((voice) => voice.shortName === DEFAULT_VOICE) || voices[0];
      if (preferred) selectVoice(preferred.shortName);
      else setError("没有找到可用音色，请检查网络后重试");
    } catch (error) {
      setError(`音色载入失败：${error?.message || error}`);
      renderSelectedVoice();
    } finally {
      loadingVoices = false;
      updateInputState();
    }
  }

  function taskCounts() {
    return {
      success: tasks.filter((task) => task.status === "success").length,
      failed: tasks.filter((task) => task.status === "error").length,
    };
  }

  function renderTasks() {
    const fragment = document.createDocumentFragment();
    tasks.forEach((task, index) => {
      const row = document.createElement("li");
      row.className = `word-loop-task-item is-${task.status}`;
      const number = document.createElement("span");
      number.className = "word-loop-task-number";
      number.textContent = String(index + 1).padStart(3, "0");
      const copy = document.createElement("span");
      copy.className = "word-loop-task-copy";
      const text = document.createElement("strong");
      const detail = document.createElement("small");
      text.textContent = task.text;
      detail.textContent = task.detail || `播放 ${clampNumber(elements.repeatCount, 1, 20)} 次`;
      copy.append(text, detail);
      const status = document.createElement("span");
      status.className = "word-loop-task-status";
      status.textContent = {
        pending: "等待中",
        running: "生成中",
        retrying: "重试中",
        success: "已完成",
        error: "生成失败",
        cancelled: "已停止",
      }[task.status] || "等待中";
      row.append(number, copy, status);
      fragment.append(row);
    });
    elements.taskList.replaceChildren(fragment);

    const counts = taskCounts();
    const total = tasks.length;
    const percent = total ? counts.success / total * 100 : 0;
    elements.totalCount.textContent = total.toLocaleString("zh-CN");
    elements.successCount.textContent = counts.success.toLocaleString("zh-CN");
    elements.failedCount.textContent = counts.failed.toLocaleString("zh-CN");
    elements.progressBar.max = Math.max(1, total);
    elements.progressBar.value = counts.success;
    elements.percent.textContent = `${percent.toFixed(2)}%`;
    if (running) elements.progressText.textContent = `正在生成 ${counts.success} / ${total} · 并发 ${CONCURRENCY}`;
    refreshIcons();
  }

  function updateTasksForText(text, status, detail = "") {
    for (const task of tasks) {
      if (task.text === text) {
        task.status = status;
        task.detail = detail;
      }
    }
    renderTasks();
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
    elements.repeatCount.value = repeatCount;
    elements.repeatGap.value = Math.round(repeatGapSeconds * 1000);
    elements.nextGap.value = Math.round(nextGapSeconds * 1000);
    elements.rate.value = rate;

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
    renderTasks();
    updateInputState();

    const uniqueTexts = [...new Set(validation.lines)];
    const options = { voice: selectedVoiceName, rate: signedPercent(rate), volume: "+0%", pitch: "+0Hz" };
    const results = new Map();
    let workIndex = 0;
    const worker = async () => {
      while (!cancelled) {
        const index = workIndex;
        workIndex += 1;
        if (index >= uniqueTexts.length) return;
        const text = uniqueTexts[index];
        const cacheKey = `${selectedVoiceName}\u0000${rate}\u0000${text}`;
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
        for (const task of tasks) if (["pending", "running", "retrying"].includes(task.status)) task.status = "cancelled";
        elements.progressText.textContent = "任务已停止";
        renderTasks();
        return;
      }
      const failedTasks = tasks.filter((task) => task.status === "error");
      if (failedTasks.length) {
        elements.progressText.textContent = `生成失败 ${failedTasks.length} 项，请检查失败详情后重试`;
        setError(`有 ${failedTasks.length} 个内容重试 3 次后仍生成失败，未合成最终音频。再次点击生成可重新尝试。`);
        return;
      }

      elements.progressText.textContent = "语音生成完成，正在合并音频";
      await new Promise((resolve) => setTimeout(resolve, 20));
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("当前系统不支持音频合成");
      const context = new AudioContextClass();
      const decoded = new Map();
      try {
        await Promise.all(uniqueTexts.map(async (text) => decoded.set(text, await decodeAudio(results.get(text), context))));
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
      elements.exportButton.disabled = false;
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

  async function exportAudio() {
    if (!wavBytes) return;
    elements.exportButton.disabled = true;
    try {
      const destination = await save({ defaultPath: exportName(), filters: [{ name: "WAV 音频", extensions: ["wav"] }] });
      if (!destination) return;
      await writeFile(destination, wavBytes);
      elements.resultMeta.textContent = `已导出：${destination}`;
    } catch (error) {
      setError(`导出失败：${error?.message || error}`);
    } finally {
      elements.exportButton.disabled = !wavBytes;
    }
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
  elements.exportButton.addEventListener("click", exportAudio);
  elements.generateButton.addEventListener("click", generate);
  elements.stopButton.addEventListener("click", () => {
    cancelled = true;
    elements.stopButton.disabled = true;
    elements.progressText.textContent = "正在停止当前任务";
  });
  elements.voiceSearch.addEventListener("focus", renderVoiceResults);
  elements.voiceSearch.addEventListener("input", renderVoiceResults);
  for (const input of [elements.repeatCount, elements.repeatGap, elements.nextGap, elements.rate]) {
    input.addEventListener("change", () => {
      revokeResult();
      updateInputState();
    });
  }
  document.addEventListener("pointerdown", (event) => {
    if (!elements.voicePicker.contains(event.target)) closeVoiceResults();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeVoiceResults();
  });
  window.addEventListener("beforeunload", revokeResult);

  updateInputState();
  renderSelectedVoice();

  return {
    prepare: loadVoices,
    pause() {
      elements.audio.pause();
      closeVoiceResults();
    },
  };
}
