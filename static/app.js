const elements = {
  textInput: document.querySelector("#textInput"),
  characterCount: document.querySelector("#characterCount"),
  localeSelect: document.querySelector("#localeSelect"),
  voiceSelect: document.querySelector("#voiceSelect"),
  voiceAvatar: document.querySelector("#voiceAvatar"),
  voiceDisplayName: document.querySelector("#voiceDisplayName"),
  voiceDescription: document.querySelector("#voiceDescription"),
  voiceCode: document.querySelector("#voiceCode"),
  generateButton: document.querySelector("#generateButton"),
  errorMessage: document.querySelector("#errorMessage"),
  emptyState: document.querySelector("#emptyState"),
  generationState: document.querySelector("#generationState"),
  generationSeconds: document.querySelector("#generationSeconds"),
  audioResult: document.querySelector("#audioResult"),
  audioPlayer: document.querySelector("#audioPlayer"),
  resultTitle: document.querySelector("#resultTitle"),
  resultMeta: document.querySelector("#resultMeta"),
  downloadButton: document.querySelector("#downloadButton"),
  historyList: document.querySelector("#historyList"),
  historyEmpty: document.querySelector("#historyEmpty"),
  historyCount: document.querySelector("#historyCount"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
  apiDialog: document.querySelector("#apiDialog"),
  confirmDialog: document.querySelector("#confirmDialog"),
};

const defaultVoice = document.body.dataset.defaultVoice;
const languageOptions = [
  { value: "zh-CN", label: "普通话", description: "中国大陆" },
  { value: "zh-HK", label: "粤语", description: "中国香港" },
  { value: "zh-TW", label: "中文（台湾）", description: "中国台湾" },
  { value: "en-US", label: "英语", description: "美国" },
  { value: "en-GB", label: "英语", description: "英国" },
  { value: "ja-JP", label: "日语", description: "日本" },
  { value: "ko-KR", label: "韩语", description: "韩国" },
  { value: "", label: "全部语言", description: "显示所有可用音色" },
];
const voicesByName = new Map();
let generatedBlobUrl = null;
let currentHistoryId = null;
let historyItems = [];
let generationTimer = null;
let generationStartedAt = 0;
let confirmResolver = null;
let voiceRequestSequence = 0;
let activeSelectControl = null;
let localeControl = null;
let voiceControl = null;

function signedValue(value, suffix) {
  const number = Number(value);
  return `${number >= 0 ? "+" : ""}${number}${suffix}`;
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function showError(message = "") {
  elements.errorMessage.textContent = message;
}

function updateCharacterCount() {
  elements.characterCount.textContent = elements.textInput.value.length.toLocaleString("zh-CN");
}

function revokeGeneratedBlob() {
  if (generatedBlobUrl) URL.revokeObjectURL(generatedBlobUrl);
  generatedBlobUrl = null;
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

  function currentOption() {
    return options.find((option) => option.value === selectedValue);
  }

  function updateTrigger(fallbackLabel = "请选择", fallbackDescription = "") {
    const option = currentOption();
    const label = document.createElement("strong");
    const description = document.createElement("small");
    label.textContent = option?.label || fallbackLabel;
    description.textContent = option?.description || fallbackDescription;
    valueElement.replaceChildren(label, description);
  }

  function renderOptions(filter = "") {
    optionsElement.replaceChildren();
    const query = filter.trim().toLocaleLowerCase("zh-CN");
    const visibleOptions = options.filter((option) => {
      const content = `${option.label} ${option.description || ""} ${option.code || ""}`;
      return !query || content.toLocaleLowerCase("zh-CN").includes(query);
    });

    if (visibleOptions.length === 0) {
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
      item.dataset.value = option.value;
      item.setAttribute("role", "option");
      const isSelected = option.value === selectedValue;
      item.setAttribute("aria-selected", String(isSelected));
      item.classList.toggle("is-selected", isSelected);

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
      item.append(copy, check);
      item.addEventListener("click", () => selectValue(option.value, true));
      optionsElement.append(item);
    }
    refreshIcons();
  }

  function open() {
    if (disabled) return;
    if (activeSelectControl && activeSelectControl !== control) activeSelectControl.close();
    activeSelectControl = control;
    popover.hidden = false;
    root.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    document.body.classList.add("select-open");
    renderOptions(searchInput?.value || "");
    requestAnimationFrame(() => {
      const target = searchInput || optionsElement.querySelector(".is-selected") || optionsElement.querySelector("button");
      target?.focus();
    });
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
    root,
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
      options = [];
      selectedValue = null;
      disabled = true;
      trigger.disabled = true;
      root.classList.add("is-disabled");
      updateTrigger(label, description);
      renderOptions();
      close();
    },
  };

  trigger.addEventListener("click", () => popover.hidden ? open() : close());
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      open();
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

function setBusy(busy) {
  elements.generateButton.disabled = busy || !voiceControl.value;
  elements.generateButton.classList.toggle("is-loading", busy);
  elements.generateButton.querySelector("span").textContent = busy ? "正在生成" : "生成并试听";

  clearInterval(generationTimer);
  generationTimer = null;
  if (busy) {
    generationStartedAt = Date.now();
    elements.generationSeconds.textContent = "0";
    elements.emptyState.hidden = true;
    elements.audioResult.hidden = true;
    elements.generationState.hidden = false;
    generationTimer = setInterval(() => {
      elements.generationSeconds.textContent = Math.floor((Date.now() - generationStartedAt) / 1000);
    }, 1000);
  } else {
    elements.generationState.hidden = true;
    elements.audioResult.hidden = !elements.audioPlayer.src;
    elements.emptyState.hidden = Boolean(elements.audioPlayer.src);
  }
}

function selectedVoice() {
  return voicesByName.get(voiceControl.value);
}

function updateVoiceSummary() {
  const voice = selectedVoice();
  if (!voice) return;
  elements.voiceAvatar.textContent = voice.displayName.slice(0, 1);
  elements.voiceDisplayName.textContent = voice.displayName;
  elements.voiceDescription.textContent = `${voice.genderName} · ${voice.localeName}`;
  elements.voiceCode.textContent = voice.shortName;
}

async function loadVoices() {
  const requestSequence = ++voiceRequestSequence;
  voiceControl.setLoading("正在载入音色", "正在连接微软语音服务");
  elements.generateButton.disabled = true;
  showError();
  try {
    const locale = localeControl.value;
    const query = locale ? `?locale=${encodeURIComponent(locale)}` : "";
    const response = await fetch(`/api/voices${query}`);
    const payload = await response.json();
    if (requestSequence !== voiceRequestSequence) return;
    if (!response.ok) throw new Error(payload.error || "获取音色失败");

    voicesByName.clear();
    for (const voice of payload.voices) {
      voicesByName.set(voice.shortName, voice);
    }
    voiceControl.setOptions(payload.voices.map((voice) => ({
      value: voice.shortName,
      label: voice.displayName,
      description: `${voice.genderName} · ${voice.localeName}`,
      code: voice.shortName,
    })));
    const preferredVoice = voicesByName.has(defaultVoice) ? defaultVoice : payload.voices[0]?.shortName;
    if (preferredVoice) voiceControl.setValue(preferredVoice);
    voiceControl.setDisabled(payload.voices.length === 0);
    elements.generateButton.disabled = payload.voices.length === 0;
    if (payload.voices.length === 0) showError("该语言暂时没有可用音色");
    updateVoiceSummary();
  } catch (error) {
    if (requestSequence !== voiceRequestSequence) return;
    voiceControl.setError("音色载入失败", "请检查网络后重试");
    elements.voiceDisplayName.textContent = "音色载入失败";
    elements.voiceDescription.textContent = "请检查网络后重试";
    elements.voiceCode.textContent = "";
    showError(error.message);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDate(dateText) {
  const date = new Date(dateText);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function truncateText(text, length = 34) {
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

function setCurrentAudio({ id = null, url, text, voiceName, voice, size, elapsed = null, autoplay = true }) {
  currentHistoryId = id;
  elements.audioPlayer.src = url;
  elements.resultTitle.textContent = truncateText(text, 38);
  const details = [voiceName || voice, formatBytes(size)];
  if (elapsed !== null) details.push(`${elapsed.toFixed(1)} 秒生成`);
  elements.resultMeta.textContent = details.join(" · ");
  elements.emptyState.hidden = true;
  elements.generationState.hidden = true;
  elements.audioResult.hidden = false;
  if (autoplay) elements.audioPlayer.play().catch(() => {});
}

async function synthesize() {
  const text = elements.textInput.value.trim();
  if (!text) {
    showError("请输入需要转换的文字");
    elements.textInput.focus();
    return;
  }

  setBusy(true);
  showError();
  const startedAt = performance.now();
  const options = {
    text,
    voice: voiceControl.value,
    rate: signedValue(document.querySelector("#rateInput").value, "%"),
    volume: signedValue(document.querySelector("#volumeInput").value, "%"),
    pitch: signedValue(document.querySelector("#pitchInput").value, "Hz"),
  };

  try {
    const response = await fetch("/api/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `生成失败（HTTP ${response.status}）`);
    }

    const blob = await response.blob();
    revokeGeneratedBlob();
    generatedBlobUrl = URL.createObjectURL(blob);
    const voice = selectedVoice();
    setCurrentAudio({
      id: response.headers.get("X-History-Id"),
      url: generatedBlobUrl,
      text,
      voiceName: voice?.displayName,
      voice: options.voice,
      size: blob.size,
      elapsed: (performance.now() - startedAt) / 1000,
    });
    await loadHistory();
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(false);
  }
}

function iconButton(icon, label, action, id) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button history-action";
  button.title = label;
  button.setAttribute("aria-label", label);
  const iconElement = document.createElement("i");
  iconElement.dataset.lucide = icon;
  button.append(iconElement);
  button.addEventListener("click", () => action(id));
  return button;
}

function renderHistory(items) {
  elements.historyList.replaceChildren();
  elements.historyCount.textContent = items.length;
  elements.historyEmpty.hidden = items.length > 0;
  elements.clearHistoryButton.disabled = items.length === 0;
  const fragment = document.createDocumentFragment();

  for (const record of items) {
    const row = document.createElement("li");
    row.className = "history-item";
    if (record.id === currentHistoryId) row.classList.add("is-current");

    const playButton = iconButton("play", "试听", playHistory, record.id);
    playButton.classList.add("history-play");

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "history-copy";
    copy.title = "再次使用这段文字";
    const title = document.createElement("strong");
    title.textContent = truncateText(record.text);
    const meta = document.createElement("span");
    meta.textContent = `${record.voiceName || record.voice} · ${formatDate(record.createdAt)} · ${formatBytes(record.size)}`;
    copy.append(title, meta);
    copy.addEventListener("click", () => reuseHistory(record));

    const actions = document.createElement("div");
    actions.className = "history-actions";
    actions.append(
      iconButton("download", "下载", downloadHistory, record.id),
      iconButton("trash-2", "删除", deleteHistory, record.id),
    );
    row.append(playButton, copy, actions);
    fragment.append(row);
  }
  elements.historyList.append(fragment);
  refreshIcons();
}

async function loadHistory() {
  try {
    const response = await fetch("/api/history");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "转换记录载入失败");
    historyItems = payload.history;
    renderHistory(historyItems);
  } catch (error) {
    showError(error.message);
  }
}

async function playHistory(id) {
  const record = historyItems.find((item) => item.id === id);
  if (!record) return;
  revokeGeneratedBlob();
  setCurrentAudio({
    id,
    url: `/api/history/${id}/audio`,
    text: record.text,
    voiceName: record.voiceName,
    voice: record.voice,
    size: record.size,
  });
  renderHistory(historyItems);
}

function downloadHistory(id) {
  const link = document.createElement("a");
  link.href = `/api/history/${id}/audio?download=1`;
  link.click();
}

async function reuseHistory(record) {
  elements.textInput.value = record.text;
  updateCharacterCount();
  const recordLocale = record.voice.split("-").slice(0, 2).join("-");
  if (languageOptions.some((option) => option.value === recordLocale) && localeControl.value !== recordLocale) {
    localeControl.setValue(recordLocale);
    await loadVoices();
  }
  if (voicesByName.has(record.voice)) {
    voiceControl.setValue(record.voice);
    updateVoiceSummary();
  }
  elements.textInput.focus();
  elements.textInput.scrollIntoView({ behavior: "smooth", block: "center" });
}

function askForConfirmation(title, message) {
  document.querySelector("#confirmTitle").textContent = title;
  document.querySelector("#confirmMessage").textContent = message;
  elements.confirmDialog.showModal();
  return new Promise((resolve) => { confirmResolver = resolve; });
}

function closeConfirmation(accepted) {
  elements.confirmDialog.close();
  if (confirmResolver) confirmResolver(accepted);
  confirmResolver = null;
}

async function deleteHistory(id) {
  const accepted = await askForConfirmation("删除这条记录？", "对应的本地 MP3 文件也会被删除，此操作无法撤销。");
  if (!accepted) return;
  const response = await fetch(`/api/history/${id}`, { method: "DELETE" });
  const payload = await response.json();
  if (!response.ok) {
    showError(payload.error || "删除失败");
    return;
  }
  if (currentHistoryId === id) clearCurrentAudio();
  await loadHistory();
}

async function clearHistory() {
  const accepted = await askForConfirmation("清空全部转换记录？", "最近生成的本地 MP3 文件将全部删除，此操作无法撤销。");
  if (!accepted) return;
  const response = await fetch("/api/history", { method: "DELETE" });
  const payload = await response.json();
  if (!response.ok) {
    showError(payload.error || "清空失败");
    return;
  }
  clearCurrentAudio();
  await loadHistory();
}

function clearCurrentAudio() {
  elements.audioPlayer.pause();
  elements.audioPlayer.removeAttribute("src");
  elements.audioPlayer.load();
  currentHistoryId = null;
  revokeGeneratedBlob();
  elements.audioResult.hidden = true;
  elements.emptyState.hidden = false;
}

function downloadCurrentAudio() {
  if (currentHistoryId) {
    downloadHistory(currentHistoryId);
    return;
  }
  if (!generatedBlobUrl) return;
  const link = document.createElement("a");
  link.href = generatedBlobUrl;
  link.download = `edge-tts-${new Date().toISOString().replace(/[:.]/g, "-")}.mp3`;
  link.click();
}

for (const [inputId, outputId, suffix, displaySuffix] of [
  ["rateInput", "rateOutput", "%", "%"],
  ["pitchInput", "pitchOutput", "Hz", " Hz"],
  ["volumeInput", "volumeOutput", "%", "%"],
]) {
  const input = document.querySelector(`#${inputId}`);
  const output = document.querySelector(`#${outputId}`);
  input.addEventListener("input", () => {
    const value = Number(input.value);
    output.textContent = `${value > 0 ? "+" : ""}${value}${displaySuffix}`;
    output.dataset.apiValue = signedValue(value, suffix);
  });
}

elements.textInput.addEventListener("input", updateCharacterCount);
elements.generateButton.addEventListener("click", synthesize);
elements.downloadButton.addEventListener("click", downloadCurrentAudio);
elements.clearHistoryButton.addEventListener("click", clearHistory);
document.querySelector("#clearTextButton").addEventListener("click", () => {
  elements.textInput.value = "";
  updateCharacterCount();
  elements.textInput.focus();
});
document.querySelector("#apiButton").addEventListener("click", () => elements.apiDialog.showModal());
document.querySelector("#closeApiButton").addEventListener("click", () => elements.apiDialog.close());
document.querySelector("#cancelConfirmButton").addEventListener("click", () => closeConfirmation(false));
document.querySelector("#acceptConfirmButton").addEventListener("click", () => closeConfirmation(true));
document.querySelector("#copyApiButton").addEventListener("click", async (event) => {
  await navigator.clipboard.writeText(document.querySelector("#curlExample").textContent);
  event.currentTarget.querySelector("span").textContent = "已复制";
  setTimeout(() => { event.currentTarget.querySelector("span").textContent = "复制命令"; }, 1400);
});
elements.apiDialog.addEventListener("click", (event) => {
  if (event.target === elements.apiDialog) elements.apiDialog.close();
});
elements.confirmDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeConfirmation(false);
});

window.addEventListener("beforeunload", revokeGeneratedBlob);
document.addEventListener("pointerdown", (event) => {
  if (activeSelectControl && !activeSelectControl.root.contains(event.target)) activeSelectControl.close();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeSelectControl) activeSelectControl.close();
});
localeControl = createUiSelect(elements.localeSelect, loadVoices);
voiceControl = createUiSelect(elements.voiceSelect, updateVoiceSummary);
localeControl.setOptions(languageOptions);
localeControl.setValue("zh-CN");
updateCharacterCount();
refreshIcons();
Promise.all([loadVoices(), loadHistory()]);
