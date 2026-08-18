import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  AudioWaveform,
  Braces,
  Check,
  ChevronDown,
  CircleAlert,
  Contrast,
  Copy,
  Download,
  Eraser,
  Files,
  FolderOpen,
  FolderOutput,
  Globe2,
  Headphones,
  History,
  House,
  Languages,
  LayoutDashboard,
  LibraryBig,
  LoaderCircle,
  Menu,
  Minus,
  MonitorCog,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  ScanText,
  Search,
  SearchX,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  TriangleAlert,
  Volume2,
  X,
  createIcons,
} from "lucide";

const iconSet = {
  AudioWaveform,
  Braces,
  Check,
  ChevronDown,
  CircleAlert,
  Contrast,
  Copy,
  Download,
  Eraser,
  Files,
  FolderOpen,
  FolderOutput,
  Globe2,
  Headphones,
  History,
  House,
  Languages,
  LayoutDashboard,
  LibraryBig,
  LoaderCircle,
  Menu,
  Minus,
  MonitorCog,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  ScanText,
  Search,
  SearchX,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  TriangleAlert,
  Volume2,
  X,
};

const elements = {
  textInput: document.querySelector("#textInput"),
  characterCount: document.querySelector("#characterCount"),
  localeSelect: document.querySelector("#localeSelect"),
  voiceSelect: document.querySelector("#voiceSelect"),
  voiceAvatar: document.querySelector("#voiceAvatar"),
  voiceDisplayName: document.querySelector("#voiceDisplayName"),
  voiceDescription: document.querySelector("#voiceDescription"),
  voiceCode: document.querySelector("#voiceCode"),
  selectVoiceAvatar: document.querySelector("#selectVoiceAvatar"),
  voicePresets: document.querySelector("#voicePresets"),
  generateButton: document.querySelector("#generateButton"),
  errorFeedback: document.querySelector("#errorFeedback"),
  errorMessage: document.querySelector("#errorMessage"),
  errorDetailControl: document.querySelector("#errorDetailControl"),
  errorDetailButton: document.querySelector("#errorDetailButton"),
  errorDetailTooltip: document.querySelector("#errorDetailTooltip"),
  emptyState: document.querySelector("#emptyState"),
  generationState: document.querySelector("#generationState"),
  generationSeconds: document.querySelector("#generationSeconds"),
  audioResult: document.querySelector("#audioResult"),
  audioPlayer: document.querySelector("#audioPlayer"),
  resultTitle: document.querySelector("#resultTitle"),
  resultMeta: document.querySelector("#resultMeta"),
  downloadButton: document.querySelector("#downloadButton"),
  topDownloadButton: document.querySelector("#topDownloadButton"),
  bottomGenerateButton: document.querySelector("#bottomGenerateButton"),
  playerToggle: document.querySelector("#playerToggle"),
  progressSlider: document.querySelector("#progressSlider"),
  playerVolume: document.querySelector("#playerVolume"),
  currentTime: document.querySelector("#currentTime"),
  durationTime: document.querySelector("#durationTime"),
  waveformBars: document.querySelector("#waveformBars"),
  resultAvatar: document.querySelector("#resultAvatar"),
  draftStatus: document.querySelector("#draftStatus"),
  historyList: document.querySelector("#historyList"),
  historyEmpty: document.querySelector("#historyEmpty"),
  historyCount: document.querySelector("#historyCount"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
  importFilesButton: document.querySelector("#importFilesButton"),
  batchPanel: document.querySelector("#batchPanel"),
  batchCount: document.querySelector("#batchCount"),
  batchList: document.querySelector("#batchList"),
  batchProgress: document.querySelector("#batchProgress"),
  batchProgressText: document.querySelector("#batchProgressText"),
  batchProgressBar: document.querySelector("#batchProgressBar"),
  clearBatchButton: document.querySelector("#clearBatchButton"),
  stopBatchButton: document.querySelector("#stopBatchButton"),
  startBatchButton: document.querySelector("#startBatchButton"),
  apiDialog: document.querySelector("#apiDialog"),
  confirmDialog: document.querySelector("#confirmDialog"),
  advancedDialog: document.querySelector("#advancedDialog"),
  interfaceZoomInput: document.querySelector("#interfaceZoomInput"),
  interfaceZoomOutput: document.querySelector("#interfaceZoomOutput"),
  zoomOutButton: document.querySelector("#zoomOutButton"),
  zoomInButton: document.querySelector("#zoomInButton"),
  highContrastInput: document.querySelector("#highContrastInput"),
  reduceMotionInput: document.querySelector("#reduceMotionInput"),
  advancedSaveStatus: document.querySelector("#advancedSaveStatus"),
  workspaceView: document.querySelector("#workspaceTop"),
  voiceCatalogView: document.querySelector("#voiceCatalogView"),
  projectSummaryLabel: document.querySelector("#projectSummaryLabel"),
  projectSummaryTitle: document.querySelector("#projectSummaryTitle"),
  catalogSearchInput: document.querySelector("#catalogSearchInput"),
  catalogLanguageSelect: document.querySelector("#catalogLanguageSelect"),
  catalogTotalCount: document.querySelector("#catalogTotalCount"),
  catalogResultCount: document.querySelector("#catalogResultCount"),
  catalogLoading: document.querySelector("#catalogLoading"),
  catalogError: document.querySelector("#catalogError"),
  catalogErrorMessage: document.querySelector("#catalogErrorMessage"),
  catalogEmpty: document.querySelector("#catalogEmpty"),
  catalogList: document.querySelector("#catalogList"),
  systemVersion: document.querySelector("#systemVersion"),
  applicationVersion: document.querySelector("#applicationVersion"),
  desktopExportSection: document.querySelector("#desktopExportSection"),
  exportDirectoryPath: document.querySelector("#exportDirectoryPath"),
  chooseExportDirectoryButton: document.querySelector("#chooseExportDirectoryButton"),
  clearExportDirectoryButton: document.querySelector("#clearExportDirectoryButton"),
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
const contentCategoryNames = {
  General: "通用",
  Novel: "小说",
  News: "新闻",
  Conversation: "对话",
  Copilot: "智能助手",
  Cartoon: "动画角色",
  Dialect: "方言",
  Sports: "体育",
};
const personalityNames = {
  Friendly: "友好",
  Positive: "积极",
  Warm: "温暖",
  Lively: "活泼",
  Pleasant: "悦耳",
  Confident: "自信",
  Passion: "热情",
  Cute: "可爱",
  Reliable: "可靠",
  Expressive: "有表现力",
  Caring: "关怀",
  Authentic: "自然",
  Honest: "真诚",
  Cheerful: "开朗",
  Clear: "清晰",
  Conversational: "对话感",
  Approachable: "亲切",
  Casual: "轻松",
  Sincere: "诚恳",
  Rational: "理性",
  Sunshine: "阳光",
  Professional: "专业",
  Humorous: "幽默",
  Bright: "明快",
  Authority: "权威",
  Considerate: "体贴",
  Comfort: "舒缓",
};
let catalogLanguageDisplayNames = null;
let catalogRegionDisplayNames = null;
try {
  catalogLanguageDisplayNames = new Intl.DisplayNames(["zh-CN"], { type: "language" });
  catalogRegionDisplayNames = new Intl.DisplayNames(["zh-CN"], { type: "region" });
} catch (_) {
  catalogLanguageDisplayNames = null;
  catalogRegionDisplayNames = null;
}
const catalogLocaleNameCache = new Map();
const voicesByName = new Map();
const avatarIndexes = {
  female: [0, 2, 4, 6, 8],
  male: [1, 3, 5, 7],
  neutral: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};
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
let catalogLanguageControl = null;
let catalogVoices = [];
let catalogGender = "";
let catalogRenderTimer = null;
let audioContext = null;
let audioAnalyser = null;
let audioSource = null;
let frequencyData = null;
let spectrumFrame = null;
let advancedSaveTimer = null;
let batchItems = [];
let batchRunning = false;
let batchRunId = "";
let batchCancellationRequested = false;
let singleGenerationBusy = false;
let exportDirectory = "";
let isDesktopApp = false;
let batchItemSequence = 0;
let historyReloadTimer = null;
let historyRequestSequence = 0;

const draftStorageKey = "voice-studio-draft-v1";
const accessibilityStorageKey = "voice-studio-accessibility-v1";
const exportDirectoryStorageKey = "voice-studio-export-directory-v1";
const accessibilityDefaults = { zoom: 100, highContrast: false, reduceMotion: false };
const maxTextLength = Number(document.body.dataset.maxText) || 10_000;
const maxBatchFiles = 50;
const batchConcurrency = 3;

function signedValue(value, suffix) {
  const number = Number(value);
  return `${number >= 0 ? "+" : ""}${number}${suffix}`;
}

function refreshIcons() {
  createIcons({ icons: iconSet });
}

function hashVoiceName(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function avatarIndexForVoice(voiceOrName, gender = "") {
  const voice = typeof voiceOrName === "object" ? voiceOrName : voicesByName.get(voiceOrName);
  const shortName = voice?.shortName || String(voiceOrName || "voice");
  const normalizedGender = String(voice?.gender || gender).toLocaleLowerCase("en-US");
  const group = normalizedGender === "female"
    ? avatarIndexes.female
    : normalizedGender === "male" ? avatarIndexes.male : avatarIndexes.neutral;
  return group[hashVoiceName(shortName) % group.length];
}

function applyVoiceAvatar(element, voiceOrName, gender = "") {
  const index = avatarIndexForVoice(voiceOrName, gender);
  element.classList.add("voice-avatar-image");
  element.style.setProperty("--voice-avatar-x", `${(index % 3) * 50}%`);
  element.style.setProperty("--voice-avatar-y", `${Math.floor(index / 3) * 50}%`);
  element.textContent = "";
  element.setAttribute("aria-hidden", "true");
  return element;
}

function showError(message = "", detail = "") {
  elements.errorMessage.textContent = message;
  elements.errorFeedback.hidden = !message;
  elements.errorDetailControl.hidden = !detail;
  elements.errorDetailTooltip.textContent = detail;
  if (!detail) {
    elements.errorDetailControl.classList.remove("is-open");
    elements.errorDetailButton.setAttribute("aria-expanded", "false");
  }
}

function normalizedNativeError(error, fallbackMessage = "操作失败") {
  const detail = error instanceof Error ? error.message : String(error || fallbackMessage);
  const isOnlineFailure = /在线语音服务|WebSocket|connection|connect|timed out|timeout/i.test(detail);
  return {
    message: isOnlineFailure ? "请求异常，请检查输入内容和音色是否正确" : detail || fallbackMessage,
    detail,
  };
}

function blobFromBase64(value, type = "audio/mpeg") {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
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
  singleGenerationBusy = busy;
  elements.generateButton.disabled = busy || batchRunning || !voiceControl.value;
  elements.bottomGenerateButton.disabled = busy || batchRunning || !voiceControl.value;
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
  renderBatch();
}

function selectedVoice() {
  return voicesByName.get(voiceControl.value);
}

function updateVoiceSummary() {
  const voice = selectedVoice();
  if (!voice) return;
  applyVoiceAvatar(elements.voiceAvatar, voice);
  applyVoiceAvatar(elements.selectVoiceAvatar, voice);
  elements.voiceDisplayName.textContent = voice.displayName;
  elements.voiceDescription.textContent = `${voice.genderName} · ${voice.localeName}`;
  elements.voiceCode.textContent = voice.shortName;
  for (const preset of elements.voicePresets.querySelectorAll(".voice-preset")) {
    preset.classList.toggle("is-selected", preset.dataset.voice === voice.shortName);
  }
}

function renderVoicePresets(voices) {
  elements.voicePresets.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const voice of voices.slice(0, 4)) {
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
    const meta = document.createElement("small");
    meta.textContent = voice.genderName;
    button.append(avatar, name, meta);
    button.addEventListener("click", () => voiceControl.setValue(voice.shortName, true));
    fragment.append(button);
  }
  elements.voicePresets.append(fragment);
}

function updateLanguageOptionCounts(localeCounts = {}, totalVoiceCount = 0) {
  const countedOptions = languageOptions.map((option) => {
    const localePrefix = option.value.toLocaleLowerCase("en-US");
    const count = localePrefix
      ? Object.entries(localeCounts).reduce((sum, [locale, amount]) => (
        locale.toLocaleLowerCase("en-US").startsWith(localePrefix) ? sum + Number(amount) : sum
      ), 0)
      : Number(totalVoiceCount);
    return { ...option, label: `${option.label}（${count}）` };
  });
  localeControl.setOptions(countedOptions);
}

function catalogLanguageName(languageCode) {
  return catalogLanguageDisplayNames?.of(languageCode) || languageCode.toUpperCase();
}

function catalogLocaleName(voice) {
  if (catalogLocaleNameCache.has(voice.locale)) return catalogLocaleNameCache.get(voice.locale);
  try {
    const locale = new Intl.Locale(voice.locale);
    const languageName = catalogLanguageName(locale.language);
    const regionName = locale.region ? catalogRegionDisplayNames?.of(locale.region) : "";
    const displayName = regionName ? `${languageName}（${regionName}）` : languageName;
    catalogLocaleNameCache.set(voice.locale, displayName);
    return displayName;
  } catch (_) {
    return voice.localeName || voice.locale;
  }
}

function translatedVoiceCategories(voice) {
  const categories = voice.contentCategories?.length ? voice.contentCategories : ["General"];
  return categories.map((item) => contentCategoryNames[item] || item);
}

function translatedVoicePersonalities(voice) {
  return (voice.personalities || []).map((item) => personalityNames[item] || item);
}

function recommendedVoiceUses(voice) {
  const categories = new Set(voice.contentCategories || []);
  const personalities = new Set(voice.personalities || []);
  const uses = [];
  const add = (...items) => {
    for (const item of items) if (!uses.includes(item)) uses.push(item);
  };

  if (categories.has("News")) add("新闻", "解说");
  if (categories.has("Novel")) add("有声书", "故事");
  if (categories.has("Conversation")) add("对话", "播客");
  if (categories.has("Cartoon")) add("动画", "角色配音");
  if (categories.has("Sports")) add("体育内容");
  if (categories.has("Dialect")) add("方言内容");
  if (categories.has("Copilot")) add("助手交互");
  if (["Professional", "Authority", "Clear", "Rational", "Confident"].some((item) => personalities.has(item))) add("知识解说");
  if (["Conversational"].some((item) => personalities.has(item))) add("播客");
  if (["Lively", "Casual", "Cheerful", "Humorous", "Bright"].some((item) => personalities.has(item))) add("Vlog");
  if (["Warm", "Caring", "Comfort"].some((item) => personalities.has(item))) add("情感内容");
  if (uses.length === 0) add("通用内容");
  return uses.slice(0, 3);
}

function createCatalogTags(items, extraClass = "") {
  const container = document.createElement("span");
  container.className = "catalog-tags";
  for (const item of items) {
    const tag = document.createElement("span");
    tag.className = `catalog-tag${extraClass ? ` ${extraClass}` : ""}`;
    tag.textContent = item;
    container.append(tag);
  }
  return container;
}

function catalogLanguageOptions(voices) {
  const counts = new Map();
  for (const voice of voices) {
    const languageCode = voice.locale.split("-")[0].toLocaleLowerCase("en-US");
    counts.set(languageCode, (counts.get(languageCode) || 0) + 1);
  }
  const options = [...counts.entries()].map(([value, count]) => ({
    value,
    label: `${catalogLanguageName(value)}（${count}）`,
    description: `${count} 个音色`,
  }));
  options.sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
  return [
    { value: "", label: `全部语言（${voices.length}）`, description: `${options.length} 种语言` },
    ...options,
  ];
}

function renderVoiceCatalog() {
  if (!catalogVoices.length) return;
  const query = elements.catalogSearchInput.value.trim().toLocaleLowerCase("zh-CN");
  const language = catalogLanguageControl.value;
  const filteredVoices = catalogVoices.filter((voice) => {
    const voiceLanguage = voice.locale.split("-")[0].toLocaleLowerCase("en-US");
    if (language && voiceLanguage !== language) return false;
    if (catalogGender && voice.gender !== catalogGender) return false;
    if (!query) return true;
    const searchable = [
      voice.displayName,
      voice.shortName,
      voice.locale,
      voice.localeName,
      catalogLocaleName(voice),
      ...translatedVoiceCategories(voice),
      ...translatedVoicePersonalities(voice),
      ...recommendedVoiceUses(voice),
    ].join(" ").toLocaleLowerCase("zh-CN");
    return searchable.includes(query);
  });

  elements.catalogResultCount.textContent = filteredVoices.length;
  elements.catalogEmpty.hidden = filteredVoices.length > 0;
  const fragment = document.createDocumentFragment();

  for (const voice of filteredVoices) {
    const row = document.createElement("li");
    row.className = "catalog-item";

    const voiceCell = document.createElement("div");
    voiceCell.className = "catalog-voice-cell";
    const avatar = document.createElement("span");
    avatar.className = "catalog-avatar";
    applyVoiceAvatar(avatar, voice);
    const voiceCopy = document.createElement("span");
    voiceCopy.className = "catalog-voice-copy";
    const voiceName = document.createElement("strong");
    voiceName.textContent = voice.displayName;
    const voiceCode = document.createElement("code");
    voiceCode.textContent = voice.shortName;
    voiceCopy.append(voiceName, voiceCode);
    voiceCell.append(avatar, voiceCopy);

    const localeCell = document.createElement("div");
    localeCell.className = "catalog-cell catalog-language";
    localeCell.dataset.label = "语言";
    const localeName = document.createElement("strong");
    localeName.textContent = catalogLocaleName(voice);
    const localeCode = document.createElement("code");
    localeCode.textContent = voice.locale;
    localeCell.append(localeName, localeCode);

    const genderCell = document.createElement("div");
    genderCell.className = "catalog-cell";
    genderCell.dataset.label = "性别";
    genderCell.textContent = voice.genderName || voice.gender;

    const categoryCell = document.createElement("div");
    categoryCell.className = "catalog-cell";
    categoryCell.dataset.label = "内容类型";
    categoryCell.append(createCatalogTags(translatedVoiceCategories(voice)));

    const personalityCell = document.createElement("div");
    personalityCell.className = "catalog-cell";
    personalityCell.dataset.label = "声音风格";
    personalityCell.append(createCatalogTags(translatedVoicePersonalities(voice).slice(0, 3), "style-tag"));

    const usageCell = document.createElement("div");
    usageCell.className = "catalog-cell";
    usageCell.dataset.label = "推荐场景";
    usageCell.title = "根据官方内容类别和声音风格推荐";
    usageCell.append(createCatalogTags(recommendedVoiceUses(voice), "usage-tag"));

    const useButton = document.createElement("button");
    useButton.type = "button";
    useButton.className = "catalog-use-button";
    useButton.textContent = "使用";
    useButton.title = `使用${voice.displayName}音色`;
    useButton.addEventListener("click", () => useCatalogVoice(voice));

    row.append(voiceCell, localeCell, genderCell, categoryCell, personalityCell, usageCell, useButton);
    fragment.append(row);
  }
  elements.catalogList.replaceChildren(fragment);
}

function scheduleVoiceCatalogRender() {
  clearTimeout(catalogRenderTimer);
  catalogRenderTimer = setTimeout(renderVoiceCatalog, 80);
}

async function loadVoiceCatalog() {
  if (catalogVoices.length) {
    renderVoiceCatalog();
    return;
  }
  elements.catalogLoading.hidden = false;
  elements.catalogError.hidden = true;
  elements.catalogEmpty.hidden = true;
  elements.catalogList.replaceChildren();
  try {
    const payload = await invoke("list_voices", { locale: null });
    catalogVoices = payload.voices;
    elements.catalogTotalCount.textContent = catalogVoices.length;
    elements.projectSummaryTitle.textContent = `${catalogVoices.length} 个在线音色`;
    catalogLanguageControl.setOptions(catalogLanguageOptions(catalogVoices));
    catalogLanguageControl.setValue("");
    updateLanguageOptionCounts(payload.localeCounts, payload.totalVoiceCount);
    elements.catalogLoading.hidden = true;
    renderVoiceCatalog();
  } catch (error) {
    const normalized = normalizedNativeError(error, "全部音色载入失败");
    elements.catalogLoading.hidden = true;
    elements.catalogError.hidden = false;
    elements.catalogErrorMessage.textContent = normalized.message;
    elements.catalogError.title = normalized.detail;
  }
}

function showAppView(view) {
  const showCatalog = view === "catalog";
  elements.workspaceView.hidden = showCatalog;
  elements.voiceCatalogView.hidden = !showCatalog;
  document.body.classList.toggle("catalog-view", showCatalog);
  document.querySelector("#sidebarWorkspaceButton").classList.toggle("is-active", !showCatalog);
  document.querySelector("#sidebarVoiceCatalogButton").classList.toggle("is-active", showCatalog);
  elements.projectSummaryLabel.textContent = showCatalog ? "音色目录" : "当前项目";
  elements.projectSummaryTitle.textContent = showCatalog
    ? catalogVoices.length ? `${catalogVoices.length} 个在线音色` : "全部在线音色"
    : "默认语音项目";
  closeSidebar();
  window.scrollTo({ top: 0, behavior: document.body.classList.contains("reduce-motion") ? "auto" : "smooth" });
}

async function useCatalogVoice(voice) {
  showAppView("workspace");
  const matchingLocale = languageOptions.find((option) => (
    option.value && voice.locale.toLocaleLowerCase("en-US").startsWith(option.value.toLocaleLowerCase("en-US"))
  ));
  const targetLocale = matchingLocale?.value || "";
  if (localeControl.value !== targetLocale || !voicesByName.has(voice.shortName)) {
    localeControl.setValue(targetLocale);
    await loadVoices();
  }
  if (voicesByName.has(voice.shortName)) {
    voiceControl.setValue(voice.shortName, true);
    activateMobilePanel("settingsPanel");
    document.querySelector("#voiceLibrary").scrollIntoView({ behavior: "smooth", block: "center" });
  } else {
    showError("无法选择该音色，请重新载入音色列表");
  }
}

async function loadVoices() {
  const requestSequence = ++voiceRequestSequence;
  voiceControl.setLoading("正在载入音色", "正在连接在线语音服务");
  elements.voicePresets.replaceChildren();
  elements.generateButton.disabled = true;
  elements.bottomGenerateButton.disabled = true;
  showError();
  try {
    const locale = localeControl.value;
    const payload = await invoke("list_voices", { locale: locale || null });
    if (requestSequence !== voiceRequestSequence) return;
    updateLanguageOptionCounts(payload.localeCounts, payload.totalVoiceCount);

    voicesByName.clear();
    for (const voice of payload.voices) {
      voicesByName.set(voice.shortName, voice);
    }
    renderVoicePresets(payload.voices);
    voiceControl.setOptions(payload.voices.map((voice) => ({
      value: voice.shortName,
      label: voice.displayName,
      description: `${voice.genderName} · ${voice.localeName}`,
      code: voice.shortName,
      avatarIndex: avatarIndexForVoice(voice),
    })));
    const preferredVoice = voicesByName.has(defaultVoice) ? defaultVoice : payload.voices[0]?.shortName;
    if (preferredVoice) voiceControl.setValue(preferredVoice);
    voiceControl.setDisabled(payload.voices.length === 0);
    elements.generateButton.disabled = payload.voices.length === 0 || batchRunning;
    elements.bottomGenerateButton.disabled = payload.voices.length === 0 || batchRunning;
    if (payload.voices.length === 0) showError("该语言暂时没有可用音色");
    updateVoiceSummary();
    renderBatch();
  } catch (error) {
    if (requestSequence !== voiceRequestSequence) return;
    const normalized = normalizedNativeError(error, "获取音色失败");
    voiceControl.setError("音色载入失败", "请检查网络后重试");
    elements.voiceDisplayName.textContent = "音色载入失败";
    elements.voiceDescription.textContent = "请检查网络后重试";
    elements.voiceCode.textContent = "";
    showError(normalized.message, normalized.detail);
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

function formatDownloadTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function truncateText(text, length = 34) {
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function createWaveform() {
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 20; index += 1) {
    const bar = document.createElement("span");
    bar.style.height = "5px";
    bar.style.setProperty("--bar-index", index);
    fragment.append(bar);
  }
  elements.waveformBars.replaceChildren(fragment);
}

function ensureAudioAnalyser() {
  if (audioAnalyser) return true;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;
  try {
    audioContext = new AudioContextClass();
    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 256;
    audioAnalyser.smoothingTimeConstant = 0.82;
    audioAnalyser.minDecibels = -88;
    audioAnalyser.maxDecibels = -18;
    audioSource = audioContext.createMediaElementSource(elements.audioPlayer);
    audioSource.connect(audioAnalyser);
    audioAnalyser.connect(audioContext.destination);
    frequencyData = new Uint8Array(audioAnalyser.frequencyBinCount);
    return true;
  } catch (_) {
    audioAnalyser = null;
    return false;
  }
}

function resumeAudioAnalysis() {
  if (!ensureAudioAnalyser()) return;
  if (audioContext.state !== "running") audioContext.resume().catch(() => {});
}

function stopSpectrum() {
  if (spectrumFrame !== null) cancelAnimationFrame(spectrumFrame);
  spectrumFrame = null;
}

function drawSpectrum() {
  if (!audioAnalyser || elements.audioPlayer.paused) {
    stopSpectrum();
    return;
  }
  audioAnalyser.getByteFrequencyData(frequencyData);
  const bars = elements.waveformBars.children;
  const usefulBins = Math.max(1, Math.floor(frequencyData.length * 0.78));
  for (let index = 0; index < bars.length; index += 1) {
    const progress = bars.length === 1 ? 0 : index / (bars.length - 1);
    const bin = Math.min(usefulBins - 1, Math.floor((progress ** 1.55) * usefulBins));
    const energy = frequencyData[bin] / 255;
    bars[index].style.height = `${5 + energy * 49}px`;
    bars[index].style.opacity = String(0.26 + energy * 0.74);
  }
  spectrumFrame = requestAnimationFrame(drawSpectrum);
}

function startSpectrum() {
  stopSpectrum();
  spectrumFrame = requestAnimationFrame(drawSpectrum);
}

function setCurrentAudio({ id = null, url, text, voiceName, voice, voiceGender = "", size, elapsed = null, autoplay = true }) {
  currentHistoryId = id;
  stopSpectrum();
  elements.audioPlayer.src = url;
  elements.resultTitle.textContent = truncateText(text, 38);
  const details = [voiceName || voice, formatBytes(size)];
  if (elapsed !== null) details.push(`${elapsed.toFixed(1)} 秒生成`);
  elements.resultMeta.textContent = details.join(" · ");
  applyVoiceAvatar(elements.resultAvatar, voice || voiceName, voiceGender);
  elements.downloadButton.disabled = false;
  elements.topDownloadButton.disabled = false;
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

  resumeAudioAnalysis();
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
    const result = await invoke("synthesize", { options });
    const blob = blobFromBase64(result.audioBase64);
    revokeGeneratedBlob();
    generatedBlobUrl = URL.createObjectURL(blob);
    const voice = selectedVoice();
    setCurrentAudio({
      id: result.record.id,
      url: generatedBlobUrl,
      text,
      voiceName: voice?.displayName,
      voice: options.voice,
      voiceGender: voice?.gender,
      size: blob.size,
      elapsed: (performance.now() - startedAt) / 1000,
    });
    await loadHistory();
  } catch (error) {
    const normalized = normalizedNativeError(error, "语音生成失败");
    showError(normalized.message, normalized.detail);
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

    const textButton = document.createElement("button");
    textButton.type = "button";
    textButton.className = "history-text";
    textButton.title = "再次使用这段文字";
    textButton.textContent = truncateText(record.text, 42);
    textButton.addEventListener("click", () => reuseHistory(record));

    const voiceCell = document.createElement("span");
    voiceCell.className = "history-voice";
    const avatar = document.createElement("span");
    avatar.className = "history-voice-avatar";
    applyVoiceAvatar(avatar, record.voice || record.voiceName, record.voiceGender);
    const voiceName = document.createElement("span");
    voiceName.textContent = record.voiceName || record.voice;
    voiceCell.append(avatar, voiceName);

    const params = document.createElement("span");
    params.className = "history-params";
    params.textContent = `${record.rate} / ${record.pitch}`;

    const date = document.createElement("span");
    date.className = "history-date";
    date.textContent = formatDate(record.createdAt);

    const actions = document.createElement("div");
    actions.className = "history-actions";
    actions.append(
      iconButton("play", "试听", playHistory, record.id),
      iconButton("download", "下载", downloadHistory, record.id),
      iconButton("trash-2", "删除", deleteHistory, record.id),
    );
    row.append(textButton, voiceCell, params, date, actions);
    fragment.append(row);
  }
  elements.historyList.append(fragment);
  refreshIcons();
}

async function loadHistory() {
  const requestSequence = ++historyRequestSequence;
  try {
    const payload = await invoke("list_history");
    if (requestSequence !== historyRequestSequence) return;
    historyItems = payload.history;
    renderHistory(historyItems);
  } catch (error) {
    if (requestSequence !== historyRequestSequence) return;
    const normalized = normalizedNativeError(error, "转换记录载入失败");
    showError(normalized.message, normalized.detail);
  }
}

function scheduleHistoryReload() {
  clearTimeout(historyReloadTimer);
  historyReloadTimer = setTimeout(() => {
    historyReloadTimer = null;
    loadHistory();
  }, 150);
}

async function playHistory(id) {
  const record = historyItems.find((item) => item.id === id);
  if (!record) return;
  try {
    resumeAudioAnalysis();
    const payload = await invoke("read_history_audio", { id });
    revokeGeneratedBlob();
    generatedBlobUrl = URL.createObjectURL(blobFromBase64(payload.audioBase64));
    setCurrentAudio({
      id,
      url: generatedBlobUrl,
      text: record.text,
      voiceName: record.voiceName,
      voice: record.voice,
      voiceGender: record.voiceGender,
      size: record.size,
    });
    renderHistory(historyItems);
  } catch (error) {
    const normalized = normalizedNativeError(error, "音频读取失败");
    showError(normalized.message, normalized.detail);
  }
}

async function downloadHistory(id) {
  const record = historyItems.find((item) => item.id === id);
  if (!record) return;
  const voiceName = (record.voiceName || "audio").replace(/[\\/:*?"<>|]/g, "-");
  const timestamp = formatDownloadTimestamp(new Date(record.createdAt));
  try {
    if (isDesktopApp && exportDirectory) {
      await exportRecordToConfiguredDirectory(id);
      return;
    }
    const destination = await save({
      defaultPath: `voice-studio-${voiceName}-${timestamp}.mp3`,
      filters: [{ name: "MP3 音频", extensions: ["mp3"] }],
    });
    if (!destination) return;
    await invoke("export_history_audio", { id, destination });
  } catch (error) {
    const normalized = normalizedNativeError(error, "导出音频失败");
    showError(normalized.message, normalized.detail);
  }
}

function updateExportDirectoryControl() {
  elements.exportDirectoryPath.textContent = exportDirectory || "尚未设置";
  elements.exportDirectoryPath.title = exportDirectory;
  elements.clearExportDirectoryButton.disabled = !exportDirectory;
}

function persistExportDirectory(directory) {
  exportDirectory = directory || "";
  try {
    if (exportDirectory) localStorage.setItem(exportDirectoryStorageKey, exportDirectory);
    else localStorage.removeItem(exportDirectoryStorageKey);
  } catch (_) {
    // The current value still works for this session when storage is unavailable.
  }
  updateExportDirectoryControl();
}

function restoreExportDirectory() {
  try {
    exportDirectory = localStorage.getItem(exportDirectoryStorageKey) || "";
  } catch (_) {
    exportDirectory = "";
  }
  updateExportDirectoryControl();
}

async function exportRecordToConfiguredDirectory(id) {
  if (!exportDirectory) return "";
  try {
    return await invoke("export_history_to_directory", { id, directory: exportDirectory });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error || "导出目录不可用");
    if (/不存在|不是文件夹|not found|directory/i.test(detail)) persistExportDirectory("");
    throw error;
  }
}

async function chooseExportDirectory() {
  try {
    const selected = await open({ directory: true, multiple: false, title: "选择默认导出文件夹" });
    if (!selected || Array.isArray(selected)) return;
    const canonicalPath = await invoke("validate_export_directory", { directory: selected });
    persistExportDirectory(canonicalPath);
    elements.advancedSaveStatus.textContent = "导出文件夹已保存";
  } catch (error) {
    const normalized = normalizedNativeError(error, "无法使用该导出文件夹");
    showError(normalized.message, normalized.detail);
    elements.advancedSaveStatus.textContent = "导出文件夹设置失败";
  }
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

function askForConfirmation(title, message, options = {}) {
  document.querySelector("#confirmTitle").textContent = title;
  document.querySelector("#confirmMessage").textContent = message;
  const acceptButton = document.querySelector("#acceptConfirmButton");
  const cancelButton = document.querySelector("#cancelConfirmButton");
  acceptButton.textContent = options.acceptLabel || "确认";
  cancelButton.textContent = options.cancelLabel || "取消";
  acceptButton.classList.toggle("button-danger", options.danger !== false);
  acceptButton.classList.toggle("button-primary", options.danger === false);
  document.querySelector(".confirm-icon").classList.toggle("is-neutral", options.danger === false);
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
  try {
    await invoke("delete_history", { id });
  } catch (error) {
    const normalized = normalizedNativeError(error, "删除失败");
    showError(normalized.message, normalized.detail);
    return;
  }
  if (currentHistoryId === id) clearCurrentAudio();
  await loadHistory();
}

async function clearHistory() {
  const accepted = await askForConfirmation("清空全部转换记录？", "最近生成的本地 MP3 文件将全部删除，此操作无法撤销。");
  if (!accepted) return;
  try {
    await invoke("clear_history");
  } catch (error) {
    const normalized = normalizedNativeError(error, "清空失败");
    showError(normalized.message, normalized.detail);
    return;
  }
  clearCurrentAudio();
  await loadHistory();
}

function clearCurrentAudio() {
  elements.audioPlayer.pause();
  elements.audioPlayer.removeAttribute("src");
  elements.audioPlayer.load();
  stopSpectrum();
  currentHistoryId = null;
  revokeGeneratedBlob();
  elements.audioResult.classList.remove("is-playing");
  elements.progressSlider.value = "0";
  elements.currentTime.textContent = "00:00";
  elements.durationTime.textContent = "00:00";
  elements.downloadButton.disabled = true;
  elements.topDownloadButton.disabled = true;
  elements.audioResult.hidden = true;
  elements.emptyState.hidden = false;
}

function downloadCurrentAudio() {
  if (currentHistoryId) {
    downloadHistory(currentHistoryId);
    return;
  }
}

async function loadAppInformation() {
  try {
    const information = await invoke("app_information");
    elements.systemVersion.textContent = information.systemVersion;
    elements.applicationVersion.textContent = information.appVersion;
    isDesktopApp = information.desktop === true;
    elements.desktopExportSection.hidden = !isDesktopApp;
    if (isDesktopApp && exportDirectory) {
      try {
        persistExportDirectory(await invoke("validate_export_directory", { directory: exportDirectory }));
      } catch (error) {
        persistExportDirectory("");
        const normalized = normalizedNativeError(error, "默认导出文件夹已失效，请重新选择");
        showError("默认导出文件夹已失效，请在高级设置中重新选择", normalized.detail);
      }
    }
  } catch (_) {
    elements.systemVersion.textContent = navigator.platform || "当前设备";
    elements.applicationVersion.textContent = "v1.2.0";
  }
}

function batchStatusLabel(item) {
  return {
    pending: "等待生成",
    running: "生成中",
    success: item.exportedPath ? "已生成并导出" : "生成成功",
    warning: "已生成，导出失败",
    error: "生成失败",
    skipped: "已跳过",
    cancelled: "已取消",
  }[item.status] || "等待生成";
}

function renderBatch() {
  elements.batchPanel.hidden = batchItems.length === 0;
  elements.batchCount.textContent = batchItems.length;
  elements.batchList.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const item of batchItems) {
    const row = document.createElement("li");
    row.className = "batch-item";
    const copy = document.createElement("div");
    copy.className = "batch-file-copy";
    const name = document.createElement("strong");
    name.textContent = item.name;
    const detail = document.createElement("small");
    detail.textContent = item.detail || (item.status === "pending" ? "使用当前音色与参数" : "");
    detail.title = item.detail || item.exportedPath || "";
    copy.append(name, detail);

    const count = document.createElement("span");
    count.className = "batch-character-count";
    count.textContent = `${item.characterCount.toLocaleString("zh-CN")} 字`;
    const status = document.createElement("span");
    status.className = `batch-status is-${item.status}`;
    status.textContent = batchStatusLabel(item);
    status.title = item.detail || item.exportedPath || "";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button batch-remove";
    remove.title = "移除文件";
    remove.setAttribute("aria-label", `移除 ${item.name}`);
    remove.disabled = batchRunning || item.status === "running";
    const removeIcon = document.createElement("i");
    removeIcon.dataset.lucide = "x";
    remove.append(removeIcon);
    remove.addEventListener("click", () => {
      batchItems = batchItems.filter((candidate) => candidate.id !== item.id);
      renderBatch();
    });
    row.append(copy, count, status, remove);
    fragment.append(row);
  }
  elements.batchList.append(fragment);

  const completed = batchItems.filter((item) => ["success", "warning", "error", "skipped", "cancelled"].includes(item.status)).length;
  elements.batchProgressBar.max = Math.max(1, batchItems.length);
  elements.batchProgressBar.value = completed;
  if (batchRunning || completed > 0) {
    elements.batchProgress.hidden = false;
    const success = batchItems.filter((item) => item.status === "success").length;
    const failed = batchItems.filter((item) => ["warning", "error"].includes(item.status)).length;
    const skipped = batchItems.filter((item) => item.status === "skipped").length;
    const cancelled = batchItems.filter((item) => item.status === "cancelled").length;
    elements.batchProgressText.textContent = batchRunning
      ? batchCancellationRequested
        ? `正在停止 · 已结束 ${completed}/${batchItems.length}`
        : `处理中 ${completed}/${batchItems.length} · 并发 ${batchConcurrency}`
      : `完成 ${success} · 异常 ${failed} · 跳过 ${skipped} · 取消 ${cancelled}`;
  } else {
    elements.batchProgress.hidden = true;
  }
  const hasRunnable = batchItems.some((item) => ["pending", "error", "cancelled"].includes(item.status));
  elements.startBatchButton.hidden = batchRunning;
  elements.stopBatchButton.hidden = !batchRunning;
  elements.stopBatchButton.disabled = !batchRunning || batchCancellationRequested;
  elements.stopBatchButton.querySelector("span").textContent = batchCancellationRequested ? "正在停止" : "停止生成";
  elements.startBatchButton.disabled = batchRunning || singleGenerationBusy || !hasRunnable || !voiceControl.value;
  elements.clearBatchButton.disabled = batchRunning;
  elements.importFilesButton.disabled = batchRunning;
  refreshIcons();
}

async function importBatchFiles() {
  showError();
  try {
    const selected = await open({
      multiple: true,
      directory: false,
      title: "导入文本文件",
      filters: [{ name: "文本文件", extensions: ["txt", "text", "md", "markdown"] }],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    if (batchItems.length + paths.length > maxBatchFiles) {
      showError(`批量列表最多保留 ${maxBatchFiles} 个文件`);
      return;
    }
    const files = await invoke("read_batch_text_files", { paths });
    const oversized = files.filter((file) => file.characterCount > maxTextLength);
    if (oversized.length > 0) {
      const accepted = await askForConfirmation(
        `有 ${oversized.length} 个文件超过字数限制`,
        `单个文件最多 ${maxTextLength.toLocaleString("zh-CN")} 字。是否跳过这些文件并继续导入其余文件？`,
        { acceptLabel: "跳过并继续", danger: false },
      );
      if (!accepted) return;
    }
    for (const file of files) {
      const empty = !file.text.trim();
      const overLimit = file.characterCount > maxTextLength;
      batchItems.push({
        id: `batch-${Date.now()}-${batchItemSequence += 1}`,
        name: file.name,
        text: file.text,
        characterCount: file.characterCount,
        status: empty || overLimit ? "skipped" : "pending",
        detail: empty ? "文件内容为空" : overLimit ? `超过 ${maxTextLength.toLocaleString("zh-CN")} 字限制` : "",
        recordId: "",
        exportedPath: "",
      });
    }
    renderBatch();
    elements.batchPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    const normalized = normalizedNativeError(error, "文本文件导入失败");
    showError(normalized.message, normalized.detail);
  }
}

function currentSynthesisOptions(text) {
  return {
    text,
    voice: voiceControl.value,
    rate: signedValue(document.querySelector("#rateInput").value, "%"),
    volume: signedValue(document.querySelector("#volumeInput").value, "%"),
    pitch: signedValue(document.querySelector("#pitchInput").value, "Hz"),
  };
}

async function runBatchItem(item, options, batchId) {
  item.status = "running";
  item.detail = "正在生成语音";
  renderBatch();
  try {
    const record = await invoke("synthesize_batch_item", {
      batchId,
      options: { ...options, text: item.text },
    });
    item.recordId = record.id;
    item.status = "success";
    item.detail = "语音已保存到转换记录";
    scheduleHistoryReload();
    if (isDesktopApp && exportDirectory) {
      try {
        item.exportedPath = await exportRecordToConfiguredDirectory(record.id);
        item.detail = item.exportedPath;
      } catch (error) {
        item.status = "warning";
        item.detail = `音频已生成，但导出失败：${String(error)}`;
      }
    }
  } catch (error) {
    const normalized = normalizedNativeError(error, "语音生成失败");
    const cancelled = batchCancellationRequested || /任务已取消|cancelled|canceled/i.test(normalized.detail);
    item.status = cancelled ? "cancelled" : "error";
    item.detail = cancelled ? "任务已取消，可重新生成" : normalized.detail || normalized.message;
  }
  renderBatch();
}

async function stopBatch() {
  if (!batchRunning || !batchRunId || batchCancellationRequested) return;
  batchCancellationRequested = true;
  for (const item of batchItems) {
    if (item.status === "pending") {
      item.status = "cancelled";
      item.detail = "任务已取消，可重新生成";
    } else if (item.status === "running") {
      item.detail = "正在取消";
    }
  }
  renderBatch();
  try {
    await invoke("cancel_batch", { batchId: batchRunId });
  } catch (error) {
    const normalized = normalizedNativeError(error, "停止批量任务失败");
    showError(normalized.message, normalized.detail);
  }
}

async function startBatch() {
  if (batchRunning || !voiceControl.value) return;
  const queue = batchItems.filter((item) => ["pending", "error", "cancelled"].includes(item.status));
  if (queue.length === 0) return;
  batchRunning = true;
  batchCancellationRequested = false;
  batchRunId = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().replaceAll("-", "")
    : `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  showError();
  elements.generateButton.disabled = true;
  elements.bottomGenerateButton.disabled = true;
  for (const item of queue) {
    item.status = "pending";
    item.detail = "等待生成";
    item.recordId = "";
    item.exportedPath = "";
  }
  renderBatch();
  const options = currentSynthesisOptions("");
  const currentBatchRunId = batchRunId;
  let nextIndex = 0;
  async function worker() {
    while (!batchCancellationRequested && nextIndex < queue.length) {
      const item = queue[nextIndex];
      nextIndex += 1;
      await runBatchItem(item, options, currentBatchRunId);
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(batchConcurrency, queue.length) }, () => worker()));
  } finally {
    try {
      await invoke("finish_batch", { batchId: currentBatchRunId });
    } catch (error) {
      const normalized = normalizedNativeError(error, "批量任务清理失败");
      showError(normalized.message, normalized.detail);
    }
    clearTimeout(historyReloadTimer);
    historyReloadTimer = null;
    await loadHistory();
    batchRunning = false;
    batchRunId = "";
    batchCancellationRequested = false;
    elements.generateButton.disabled = singleGenerationBusy || !voiceControl.value;
    elements.bottomGenerateButton.disabled = singleGenerationBusy || !voiceControl.value;
    renderBatch();
  }
}

function saveDraft() {
  const draft = {
    text: elements.textInput.value,
    rate: document.querySelector("#rateInput").value,
    pitch: document.querySelector("#pitchInput").value,
    volume: document.querySelector("#volumeInput").value,
  };
  localStorage.setItem(draftStorageKey, JSON.stringify(draft));
  elements.draftStatus.textContent = "草稿已保存";
  setTimeout(() => { elements.draftStatus.textContent = ""; }, 1800);
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(draftStorageKey));
    if (!draft || typeof draft !== "object") return;
    if (typeof draft.text === "string") elements.textInput.value = draft.text;
    for (const key of ["rate", "pitch", "volume"]) {
      const input = document.querySelector(`#${key}Input`);
      if (input && Number.isFinite(Number(draft[key]))) input.value = draft[key];
    }
  } catch (_) {
    localStorage.removeItem(draftStorageKey);
  }
}

function activateMobilePanel(panelId) {
  const inputActive = panelId === "inputPanel";
  document.querySelector("#inputPanel").classList.toggle("is-mobile-active", inputActive);
  document.querySelector("#settingsPanel").classList.toggle("is-mobile-active", !inputActive);
  document.querySelector("#inputTab").classList.toggle("is-active", inputActive);
  document.querySelector("#settingsTab").classList.toggle("is-active", !inputActive);
  document.querySelector("#inputTab").setAttribute("aria-selected", String(inputActive));
  document.querySelector("#settingsTab").setAttribute("aria-selected", String(!inputActive));
}

function closeSidebar() {
  document.body.classList.remove("sidebar-open");
  document.querySelector("#sidebarBackdrop").hidden = true;
  document.querySelector("#menuButton").setAttribute("aria-expanded", "false");
}

function updateRangeOutputs() {
  for (const [inputId, outputId, displaySuffix] of [
    ["rateInput", "rateOutput", "%"],
    ["pitchInput", "pitchOutput", " Hz"],
    ["volumeInput", "volumeOutput", "%"],
  ]) {
    const value = Number(document.querySelector(`#${inputId}`).value);
    document.querySelector(`#${outputId}`).textContent = `${value > 0 ? "+" : ""}${value}${displaySuffix}`;
  }
}

function normalizeAccessibilitySettings(settings = {}) {
  const zoom = Math.min(150, Math.max(100, Math.round(Number(settings.zoom) / 5) * 5 || 100));
  return {
    zoom,
    highContrast: settings.highContrast === true,
    reduceMotion: settings.reduceMotion === true,
  };
}

function accessibilitySettingsFromControls() {
  return normalizeAccessibilitySettings({
    zoom: elements.interfaceZoomInput.value,
    highContrast: elements.highContrastInput.checked,
    reduceMotion: elements.reduceMotionInput.checked,
  });
}

function applyAccessibilitySettings(settings) {
  const normalized = normalizeAccessibilitySettings(settings);
  document.documentElement.style.zoom = "";
  getCurrentWebview().setZoom(normalized.zoom / 100).catch(() => {
    document.documentElement.style.zoom = normalized.zoom === 100 ? "" : `${normalized.zoom}%`;
  });
  document.body.classList.toggle("high-contrast", normalized.highContrast);
  document.body.classList.toggle("reduce-motion", normalized.reduceMotion);
  elements.interfaceZoomInput.value = String(normalized.zoom);
  elements.interfaceZoomInput.setAttribute("aria-valuetext", `${normalized.zoom}%`);
  elements.interfaceZoomOutput.textContent = `${normalized.zoom}%`;
  elements.zoomOutButton.disabled = normalized.zoom <= 100;
  elements.zoomInButton.disabled = normalized.zoom >= 150;
  elements.highContrastInput.checked = normalized.highContrast;
  elements.reduceMotionInput.checked = normalized.reduceMotion;
  return normalized;
}

function persistAccessibilitySettings(settings, message = "已保存到本机") {
  const normalized = applyAccessibilitySettings(settings);
  try {
    localStorage.setItem(accessibilityStorageKey, JSON.stringify(normalized));
    elements.advancedSaveStatus.textContent = message;
    clearTimeout(advancedSaveTimer);
    advancedSaveTimer = setTimeout(() => {
      elements.advancedSaveStatus.textContent = "设置自动保存在本机";
    }, 1800);
  } catch (_) {
    elements.advancedSaveStatus.textContent = "浏览器无法保存设置";
  }
}

function restoreAccessibilitySettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(accessibilityStorageKey));
    applyAccessibilitySettings(saved || accessibilityDefaults);
  } catch (_) {
    localStorage.removeItem(accessibilityStorageKey);
    applyAccessibilitySettings(accessibilityDefaults);
  }
}

function adjustInterfaceZoom(amount) {
  elements.interfaceZoomInput.value = String(Number(elements.interfaceZoomInput.value) + amount);
  persistAccessibilitySettings(accessibilitySettingsFromControls());
}

function openAdvancedDialog() {
  elements.advancedDialog.showModal();
  closeSidebar();
  elements.interfaceZoomInput.focus();
}

function openApiDialog() {
  elements.apiDialog.showModal();
  closeSidebar();
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
elements.importFilesButton.addEventListener("click", importBatchFiles);
elements.startBatchButton.addEventListener("click", startBatch);
elements.stopBatchButton.addEventListener("click", stopBatch);
elements.clearBatchButton.addEventListener("click", () => {
  if (!batchRunning) {
    batchItems = [];
    renderBatch();
  }
});
elements.generateButton.addEventListener("click", synthesize);
elements.downloadButton.addEventListener("click", downloadCurrentAudio);
elements.topDownloadButton.addEventListener("click", downloadCurrentAudio);
elements.bottomGenerateButton.addEventListener("click", () => {
  activateMobilePanel("settingsPanel");
  synthesize();
});
elements.clearHistoryButton.addEventListener("click", clearHistory);
elements.errorDetailButton.addEventListener("click", () => {
  const isOpen = elements.errorDetailControl.classList.toggle("is-open");
  elements.errorDetailButton.setAttribute("aria-expanded", String(isOpen));
});
document.querySelector("#saveDraftButton").addEventListener("click", saveDraft);
document.querySelector("#clearTextButton").addEventListener("click", () => {
  elements.textInput.value = "";
  updateCharacterCount();
  elements.textInput.focus();
});
document.querySelector("#sidebarApiButton").addEventListener("click", openApiDialog);
document.querySelector("#sidebarAdvancedButton").addEventListener("click", openAdvancedDialog);
document.querySelector("#sidebarVoiceCatalogButton").addEventListener("click", () => {
  showAppView("catalog");
  loadVoiceCatalog();
});
document.querySelector("#bottomApiButton").addEventListener("click", openApiDialog);
document.querySelector("#catalogRetryButton").addEventListener("click", loadVoiceCatalog);
elements.catalogSearchInput.addEventListener("input", scheduleVoiceCatalogRender);
for (const button of document.querySelectorAll("[data-catalog-gender]")) {
  button.addEventListener("click", () => {
    catalogGender = button.dataset.catalogGender;
    for (const option of document.querySelectorAll("[data-catalog-gender]")) {
      option.classList.toggle("is-selected", option === button);
    }
    renderVoiceCatalog();
  });
}
document.querySelector("#closeApiButton").addEventListener("click", () => elements.apiDialog.close());
document.querySelector("#closeAdvancedButton").addEventListener("click", () => elements.advancedDialog.close());
document.querySelector("#doneAdvancedButton").addEventListener("click", () => elements.advancedDialog.close());
elements.chooseExportDirectoryButton.addEventListener("click", chooseExportDirectory);
elements.clearExportDirectoryButton.addEventListener("click", () => persistExportDirectory(""));
elements.interfaceZoomInput.addEventListener("input", () => persistAccessibilitySettings(accessibilitySettingsFromControls()));
elements.zoomOutButton.addEventListener("click", () => adjustInterfaceZoom(-5));
elements.zoomInButton.addEventListener("click", () => adjustInterfaceZoom(5));
elements.highContrastInput.addEventListener("change", () => persistAccessibilitySettings(accessibilitySettingsFromControls()));
elements.reduceMotionInput.addEventListener("change", () => persistAccessibilitySettings(accessibilitySettingsFromControls()));
document.querySelector("#resetAdvancedButton").addEventListener("click", () => {
  localStorage.removeItem(accessibilityStorageKey);
  persistAccessibilitySettings(accessibilityDefaults, "已恢复默认设置");
});
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
elements.advancedDialog.addEventListener("click", (event) => {
  if (event.target === elements.advancedDialog) elements.advancedDialog.close();
});
elements.confirmDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeConfirmation(false);
});

elements.playerToggle.addEventListener("click", () => {
  if (!elements.audioPlayer.src) return;
  if (elements.audioPlayer.paused) {
    resumeAudioAnalysis();
    elements.audioPlayer.play().catch(() => {});
  }
  else elements.audioPlayer.pause();
});
elements.audioPlayer.addEventListener("loadedmetadata", () => {
  elements.durationTime.textContent = formatTime(elements.audioPlayer.duration);
});
elements.audioPlayer.addEventListener("timeupdate", () => {
  elements.currentTime.textContent = formatTime(elements.audioPlayer.currentTime);
  const duration = elements.audioPlayer.duration || 0;
  elements.progressSlider.value = duration ? String(Math.round((elements.audioPlayer.currentTime / duration) * 1000)) : "0";
});
elements.audioPlayer.addEventListener("play", () => {
  resumeAudioAnalysis();
  startSpectrum();
  elements.audioResult.classList.add("is-playing");
  elements.playerToggle.setAttribute("aria-label", "暂停");
});
elements.audioPlayer.addEventListener("pause", () => {
  stopSpectrum();
  elements.audioResult.classList.remove("is-playing");
  elements.playerToggle.setAttribute("aria-label", "播放");
});
elements.progressSlider.addEventListener("input", () => {
  if (!Number.isFinite(elements.audioPlayer.duration)) return;
  elements.audioPlayer.currentTime = (Number(elements.progressSlider.value) / 1000) * elements.audioPlayer.duration;
});
elements.playerVolume.addEventListener("input", () => {
  elements.audioPlayer.volume = Number(elements.playerVolume.value);
});

document.querySelector("#inputTab").addEventListener("click", () => activateMobilePanel("inputPanel"));
document.querySelector("#settingsTab").addEventListener("click", () => activateMobilePanel("settingsPanel"));
document.querySelector("#menuButton").addEventListener("click", () => {
  document.body.classList.add("sidebar-open");
  document.querySelector("#sidebarBackdrop").hidden = false;
  document.querySelector("#menuButton").setAttribute("aria-expanded", "true");
  document.querySelector("#sidebarCloseButton").focus();
});
document.querySelector("#sidebarCloseButton").addEventListener("click", closeSidebar);
document.querySelector("#sidebarBackdrop").addEventListener("click", closeSidebar);
for (const navigationButton of document.querySelectorAll("[data-scroll-target]")) {
  navigationButton.addEventListener("click", () => {
    const targetId = navigationButton.dataset.scrollTarget;
    if (targetId === "workspaceTop") showAppView("workspace");
    if (targetId === "voiceLibrary") activateMobilePanel("settingsPanel");
    document.querySelector(`#${targetId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    closeSidebar();
  });
}
window.addEventListener("resize", () => {
  if (window.innerWidth > 1240) closeSidebar();
});

window.addEventListener("beforeunload", revokeGeneratedBlob);
document.addEventListener("pointerdown", (event) => {
  if (activeSelectControl && !activeSelectControl.root.contains(event.target)) activeSelectControl.close();
  if (!elements.errorDetailControl.contains(event.target)) {
    elements.errorDetailControl.classList.remove("is-open");
    elements.errorDetailButton.setAttribute("aria-expanded", "false");
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeSelectControl) activeSelectControl.close();
  if (event.key === "Escape" && document.body.classList.contains("sidebar-open")) closeSidebar();
});
localeControl = createUiSelect(elements.localeSelect, loadVoices);
voiceControl = createUiSelect(elements.voiceSelect, updateVoiceSummary);
catalogLanguageControl = createUiSelect(elements.catalogLanguageSelect, renderVoiceCatalog);
localeControl.setOptions(languageOptions);
localeControl.setValue("zh-CN");
restoreAccessibilitySettings();
restoreExportDirectory();
restoreDraft();
updateRangeOutputs();
updateCharacterCount();
createWaveform();
refreshIcons();
renderBatch();
loadAppInformation();
loadVoices().then(loadHistory);
