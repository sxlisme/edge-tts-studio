import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import SpectrogramPlugin from "wavesurfer.js/dist/plugins/spectrogram.esm.js";
import { writeFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";
import { formatPreciseTime, inspectAudioBuffer, renderClipsToWav } from "./audio-utils.js";

const $ = (selector) => document.querySelector(selector);

function compactDb(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} dBFS` : "-∞ dBFS";
}

function exportFileName() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `音频拼接-${stamp}.wav`;
}

async function decodeSourceFile(file) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("当前系统不支持音频解码");
  const audioContext = new AudioContextClass();
  try {
    return await audioContext.decodeAudioData(await file.arrayBuffer());
  } finally {
    if (audioContext.state !== "closed") await audioContext.close().catch(() => undefined);
  }
}

export function initializeAudioInspection(refreshIcons) {
  const elements = {
    fileInput: $("#audioFileInput"),
    importButton: $("#importAudioButton"),
    exportButton: $("#exportCompositionButton"),
    sourceCount: $("#inspectionSourceCount"),
    sourceEmpty: $("#inspectionSourceEmpty"),
    sourceList: $("#inspectionSourceList"),
    anomalyCount: $("#anomalyCount"),
    anomalyEmpty: $("#anomalyEmpty"),
    anomalyList: $("#anomalyList"),
    health: $("#inspectionHealth"),
    loading: $("#inspectionLoading"),
    analysisEmpty: $("#analysisEmpty"),
    workspace: $("#analysisWorkspace"),
    fileMeta: $("#analysisFileMeta"),
    timeLabel: $("#waveformTimeLabel"),
    playButton: $("#inspectionPlayButton"),
    previewButton: $("#previewSelectionButton"),
    selectAllButton: $("#selectAllAudioButton"),
    selectionStart: $("#selectionStartInput"),
    selectionEnd: $("#selectionEndInput"),
    zoomInput: $("#inspectionZoomInput"),
    zoomOutput: $("#inspectionZoomOutput"),
    addSelectionButton: $("#addSelectionButton"),
    compositionCount: $("#compositionCount"),
    compositionDuration: $("#compositionDuration"),
    compositionEmpty: $("#compositionEmpty"),
    compositionList: $("#compositionList"),
    clearCompositionButton: $("#clearCompositionButton"),
    compositionStatus: $("#compositionStatus"),
  };

  const sources = [];
  const clips = [];
  let waveSurfer = null;
  let regions = null;
  let activeSourceId = null;
  let selectionRegion = null;
  let loadSequence = 0;
  let clipSequence = 0;
  let sourceSequence = 0;

  function sourceById(id) {
    return sources.find((source) => source.id === id);
  }

  function setStatus(message, isError = false) {
    elements.compositionStatus.textContent = message;
    elements.compositionStatus.classList.toggle("is-error", isError);
  }

  function updatePlaybackState() {
    elements.playButton.classList.toggle("is-playing", Boolean(waveSurfer?.isPlaying()));
  }

  function updateSelectionControls() {
    const hasSelection = Boolean(selectionRegion && activeSourceId);
    elements.previewButton.disabled = !hasSelection;
    elements.addSelectionButton.disabled = !hasSelection;
    elements.selectionStart.disabled = !hasSelection;
    elements.selectionEnd.disabled = !hasSelection;
    if (!hasSelection) {
      elements.selectionStart.value = "0.000";
      elements.selectionEnd.value = "0.000";
      return;
    }
    elements.selectionStart.value = selectionRegion.start.toFixed(3);
    elements.selectionEnd.value = selectionRegion.end.toFixed(3);
  }

  function setSelection(start, end) {
    const duration = waveSurfer?.getDuration() || 0;
    const safeStart = Math.max(0, Math.min(duration, Number(start) || 0));
    const safeEnd = Math.max(safeStart + 0.01, Math.min(duration, Number(end) || duration));
    if (selectionRegion) {
      selectionRegion.setOptions({ start: safeStart, end: safeEnd });
    } else if (regions && duration) {
      selectionRegion = regions.addRegion({
        start: safeStart,
        end: safeEnd,
        color: "rgba(82, 103, 247, 0.18)",
        drag: true,
        resize: true,
        minLength: 0.01,
      });
    }
    updateSelectionControls();
  }

  function ensureWaveSurfer() {
    if (waveSurfer) return;
    regions = RegionsPlugin.create();
    const spectrogram = SpectrogramPlugin.create({
      container: elements.workspace.querySelector("#inspectionSpectrogram"),
      height: 150,
      labels: true,
      fftSamples: 1024,
      scale: "mel",
      frequencyMax: 20000,
      colorMap: "roseus",
      autoGain: true,
      useWebWorker: true,
      fallbackToMainThread: false,
    });
    waveSurfer = WaveSurfer.create({
      container: "#inspectionWaveform",
      sampleRate: 44100,
      height: 112,
      waveColor: "#9ca8bb",
      progressColor: "#5267f7",
      cursorColor: "#d04659",
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      normalize: false,
      minPxPerSec: Number(elements.zoomInput.value),
      plugins: [regions, spectrogram],
    });
    regions.enableDragSelection({ color: "rgba(82, 103, 247, 0.18)", minLength: 0.01 });
    regions.on("region-created", (region) => {
      if (selectionRegion && selectionRegion !== region) selectionRegion.remove();
      selectionRegion = region;
      updateSelectionControls();
    });
    regions.on("region-updated", (region) => {
      selectionRegion = region;
      updateSelectionControls();
    });
    regions.on("region-removed", (region) => {
      if (selectionRegion === region) {
        selectionRegion = null;
        updateSelectionControls();
      }
    });
    waveSurfer.on("timeupdate", (time) => {
      elements.timeLabel.textContent = `${formatPreciseTime(time)} / ${formatPreciseTime(waveSurfer.getDuration())}`;
    });
    waveSurfer.on("play", updatePlaybackState);
    waveSurfer.on("pause", updatePlaybackState);
    waveSurfer.on("finish", updatePlaybackState);
    waveSurfer.on("error", (error) => {
      elements.loading.hidden = true;
      elements.analysisEmpty.hidden = false;
      elements.analysisEmpty.querySelector("p").textContent = `无法解析音频：${error.message || error}`;
      elements.fileMeta.textContent = "音频载入失败";
    });
  }

  function renderSources() {
    elements.sourceCount.textContent = String(sources.length);
    elements.sourceEmpty.hidden = sources.length > 0;
    elements.sourceList.replaceChildren();
    for (const source of sources) {
      const item = document.createElement("li");
      item.className = "inspection-source-item";
      item.classList.toggle("is-active", source.id === activeSourceId);
      const selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.className = "inspection-source-select";
      selectButton.innerHTML = `<span class="source-file-icon"><i data-lucide="music-2"></i></span><span><strong></strong><small></small></span>`;
      selectButton.querySelector("strong").textContent = source.file.name;
      selectButton.querySelector("small").textContent = source.buffer
        ? `${formatPreciseTime(source.buffer.duration)} · ${Math.round(source.buffer.sampleRate / 1000)} kHz · ${source.buffer.numberOfChannels} 声道`
        : `${(source.file.size / 1024 / 1024).toFixed(2)} MB · 等待分析`;
      selectButton.addEventListener("click", () => loadSource(source.id));
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "icon-button source-remove-button";
      removeButton.title = "移除音频";
      removeButton.setAttribute("aria-label", `移除 ${source.file.name}`);
      removeButton.innerHTML = '<i data-lucide="x"></i>';
      removeButton.addEventListener("click", () => removeSource(source.id));
      item.append(selectButton, removeButton);
      elements.sourceList.append(item);
    }
    refreshIcons();
  }

  function anomaliesFor(source) {
    if (!source.analysis) return [];
    const anomalies = source.analysis.silences.map((silence) => ({
      type: "silence",
      title: `检测到 ${silence.duration.toFixed(2)} 秒无声`,
      detail: `${formatPreciseTime(silence.start)} - ${formatPreciseTime(silence.end)}`,
      start: silence.start,
      end: silence.end,
    }));
    if (source.analysis.rmsDb < -42) {
      anomalies.push({ type: "volume", title: "整体音量可能过低", detail: `平均响度 ${compactDb(source.analysis.rmsDb)}`, start: 0 });
    }
    if (source.analysis.clippedRatio >= 0.0005) {
      anomalies.push({ type: "clipping", title: "检测到疑似削波失真", detail: `${source.analysis.clippedFrames} 个采样帧触顶`, start: 0 });
    }
    return anomalies;
  }

  function renderAnomalies() {
    const source = sourceById(activeSourceId);
    const anomalies = source ? anomaliesFor(source) : [];
    elements.anomalyCount.textContent = String(anomalies.length);
    elements.anomalyList.replaceChildren();
    elements.anomalyEmpty.hidden = anomalies.length > 0;
    elements.health.className = "inspection-badge";
    if (!source?.analysis) {
      elements.health.textContent = source ? "检测中" : "等待检测";
      elements.anomalyEmpty.querySelector("span").textContent = "尚未检测音频";
    } else if (!anomalies.length) {
      elements.health.textContent = "未见异常";
      elements.health.classList.add("is-healthy");
      elements.anomalyEmpty.querySelector("span").textContent = "未发现明显音频异常";
    } else {
      elements.health.textContent = `${anomalies.length} 项需检查`;
      elements.health.classList.add("has-warning");
    }
    for (const anomaly of anomalies) {
      const item = document.createElement("li");
      item.className = `anomaly-item is-${anomaly.type}`;
      item.innerHTML = `<span class="anomaly-icon"><i data-lucide="triangle-alert"></i></span><button type="button"><strong></strong><small></small></button>`;
      item.querySelector("strong").textContent = anomaly.title;
      item.querySelector("small").textContent = anomaly.detail;
      item.querySelector("button").addEventListener("click", () => {
        waveSurfer?.setTime(anomaly.start || 0);
        if (anomaly.end) setSelection(anomaly.start, anomaly.end);
      });
      elements.anomalyList.append(item);
    }
    refreshIcons();
  }

  async function loadSource(id) {
    const source = sourceById(id);
    if (!source) return;
    const sequence = ++loadSequence;
    activeSourceId = id;
    selectionRegion = null;
    renderSources();
    renderAnomalies();
    ensureWaveSurfer();
    waveSurfer.pause();
    regions.clearRegions();
    elements.loading.hidden = false;
    elements.analysisEmpty.hidden = true;
    elements.workspace.hidden = true;
    elements.fileMeta.textContent = `正在载入 ${source.file.name}`;
    try {
      const [, buffer] = await Promise.all([
        waveSurfer.loadBlob(source.file),
        source.buffer ? Promise.resolve(source.buffer) : decodeSourceFile(source.file),
      ]);
      if (sequence !== loadSequence || activeSourceId !== id) return;
      source.buffer = buffer;
      await new Promise((resolve) => setTimeout(resolve, 0));
      source.analysis = inspectAudioBuffer(buffer);
      elements.loading.hidden = true;
      elements.workspace.hidden = false;
      elements.analysisEmpty.hidden = true;
      elements.fileMeta.textContent = `${source.file.name} · ${formatPreciseTime(buffer.duration)} · ${Math.round(buffer.sampleRate / 1000)} kHz · ${buffer.numberOfChannels} 声道 · 峰值 ${compactDb(source.analysis.peakDb)}`;
      elements.timeLabel.textContent = `00:00.000 / ${formatPreciseTime(buffer.duration)}`;
      elements.zoomInput.disabled = false;
      elements.selectAllButton.disabled = false;
      setSelection(0, buffer.duration);
      renderSources();
      renderAnomalies();
    } catch (error) {
      if (sequence !== loadSequence) return;
      elements.loading.hidden = true;
      elements.analysisEmpty.hidden = false;
      elements.workspace.hidden = true;
      elements.analysisEmpty.querySelector("p").textContent = `无法解析 ${source.file.name}：${error.message || error}`;
      elements.fileMeta.textContent = "音频载入失败";
    }
  }

  function removeSource(id) {
    const index = sources.findIndex((source) => source.id === id);
    if (index < 0) return;
    const [removed] = sources.splice(index, 1);
    const removedClipCount = clips.length;
    for (let clipIndex = clips.length - 1; clipIndex >= 0; clipIndex -= 1) {
      if (clips[clipIndex].sourceId === id) clips.splice(clipIndex, 1);
    }
    if (removedClipCount !== clips.length) setStatus(`已同时移除 ${removedClipCount - clips.length} 个相关片段`);
    if (activeSourceId === id) {
      activeSourceId = null;
      selectionRegion = null;
      loadSequence += 1;
      waveSurfer?.empty();
      elements.workspace.hidden = true;
      elements.analysisEmpty.hidden = false;
      elements.analysisEmpty.querySelector("p").textContent = "导入音频后将在这里显示可缩放波形与频谱";
      elements.fileMeta.textContent = "未载入音频";
      if (sources.length) loadSource(sources[Math.min(index, sources.length - 1)].id);
    }
    removed.buffer = null;
    renderSources();
    renderAnomalies();
    renderComposition();
  }

  function renderComposition() {
    elements.compositionCount.textContent = String(clips.length);
    elements.compositionEmpty.hidden = clips.length > 0;
    elements.clearCompositionButton.disabled = clips.length === 0;
    elements.exportButton.disabled = clips.length === 0;
    elements.compositionDuration.textContent = `总时长 ${formatPreciseTime(clips.reduce((sum, clip) => sum + clip.end - clip.start, 0))}`;
    elements.compositionList.replaceChildren();
    clips.forEach((clip, index) => {
      const source = sourceById(clip.sourceId);
      const item = document.createElement("li");
      item.className = "composition-item";
      item.innerHTML = `<span class="clip-number"></span><button class="clip-preview" type="button"><i data-lucide="play"></i><span><strong></strong><small></small></span></button><span class="clip-duration"></span><div class="clip-actions"><button class="icon-button" data-action="up" type="button" title="上移" aria-label="上移"><i data-lucide="arrow-up"></i></button><button class="icon-button" data-action="down" type="button" title="下移" aria-label="下移"><i data-lucide="arrow-down"></i></button><button class="icon-button" data-action="remove" type="button" title="删除片段" aria-label="删除片段"><i data-lucide="trash-2"></i></button></div>`;
      item.querySelector(".clip-number").textContent = String(index + 1).padStart(2, "0");
      item.querySelector("strong").textContent = source?.file.name || "来源已移除";
      item.querySelector("small").textContent = `${formatPreciseTime(clip.start)} - ${formatPreciseTime(clip.end)}`;
      item.querySelector(".clip-duration").textContent = formatPreciseTime(clip.end - clip.start);
      item.querySelector('[data-action="up"]').disabled = index === 0;
      item.querySelector('[data-action="down"]').disabled = index === clips.length - 1;
      item.querySelector(".clip-preview").addEventListener("click", () => previewClip(clip));
      item.querySelector('[data-action="up"]').addEventListener("click", () => moveClip(index, -1));
      item.querySelector('[data-action="down"]').addEventListener("click", () => moveClip(index, 1));
      item.querySelector('[data-action="remove"]').addEventListener("click", () => {
        clips.splice(index, 1);
        renderComposition();
      });
      elements.compositionList.append(item);
    });
    refreshIcons();
  }

  function moveClip(index, offset) {
    const target = index + offset;
    if (target < 0 || target >= clips.length) return;
    [clips[index], clips[target]] = [clips[target], clips[index]];
    renderComposition();
  }

  async function previewClip(clip) {
    if (activeSourceId !== clip.sourceId) await loadSource(clip.sourceId);
    setSelection(clip.start, clip.end);
    selectionRegion?.play(true);
  }

  function updateSelectionFromInputs() {
    if (!selectionRegion) return;
    const duration = waveSurfer.getDuration();
    const start = Math.max(0, Math.min(duration, Number(elements.selectionStart.value)));
    const end = Math.max(start + 0.01, Math.min(duration, Number(elements.selectionEnd.value)));
    setSelection(start, end);
  }

  async function exportComposition() {
    if (!clips.length) return;
    elements.exportButton.disabled = true;
    elements.exportButton.classList.add("is-loading");
    setStatus("正在重新采样并合成 WAV…");
    try {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const renderClips = clips.map((clip) => {
        const source = sourceById(clip.sourceId);
        if (!source?.buffer) throw new Error("有片段的源音频尚未完成解码");
        return { buffer: source.buffer, start: clip.start, end: clip.end };
      });
      const wavBytes = renderClipsToWav(renderClips);
      const destination = await save({ defaultPath: exportFileName(), filters: [{ name: "WAV 音频", extensions: ["wav"] }] });
      if (!destination) {
        setStatus("已取消导出");
        return;
      }
      await writeFile(destination, wavBytes);
      setStatus(`合成完成：${destination}`);
    } catch (error) {
      setStatus(`导出失败：${error.message || error}`, true);
    } finally {
      elements.exportButton.classList.remove("is-loading");
      elements.exportButton.disabled = clips.length === 0;
    }
  }

  elements.importButton.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", () => {
    const files = [...elements.fileInput.files].filter((file) => file.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name));
    for (const file of files) sources.push({ id: `source-${++sourceSequence}`, file, buffer: null, analysis: null });
    elements.fileInput.value = "";
    renderSources();
    if (!activeSourceId && sources.length) loadSource(sources[0].id);
  });
  elements.playButton.addEventListener("click", () => waveSurfer?.playPause());
  elements.previewButton.addEventListener("click", () => selectionRegion?.play(true));
  elements.selectAllButton.addEventListener("click", () => setSelection(0, waveSurfer?.getDuration() || 0));
  elements.selectionStart.addEventListener("change", updateSelectionFromInputs);
  elements.selectionEnd.addEventListener("change", updateSelectionFromInputs);
  elements.zoomInput.addEventListener("input", () => {
    const zoom = Number(elements.zoomInput.value);
    elements.zoomOutput.textContent = `${zoom} px/s`;
    waveSurfer?.zoom(zoom);
  });
  elements.addSelectionButton.addEventListener("click", () => {
    if (!selectionRegion || !activeSourceId) return;
    clips.push({ id: `clip-${++clipSequence}`, sourceId: activeSourceId, start: selectionRegion.start, end: selectionRegion.end });
    setStatus(`已加入片段 ${formatPreciseTime(selectionRegion.start)} - ${formatPreciseTime(selectionRegion.end)}`);
    renderComposition();
  });
  elements.clearCompositionButton.addEventListener("click", () => {
    clips.splice(0, clips.length);
    setStatus("拼接列表已清空");
    renderComposition();
  });
  elements.exportButton.addEventListener("click", exportComposition);
  window.addEventListener("beforeunload", () => waveSurfer?.destroy());

  renderSources();
  renderAnomalies();
  renderComposition();

  return {
    prepare() {
      ensureWaveSurfer();
    },
  };
}
