const SILENCE_THRESHOLD = 10 ** (-54 / 20);

export function formatPreciseTime(seconds) {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(3).padStart(6, "0")}`;
}

export function inspectAudioBuffer(buffer, options = {}) {
  const minimumSilenceSeconds = options.minimumSilenceSeconds ?? 3;
  const silenceThreshold = options.silenceThreshold ?? SILENCE_THRESHOLD;
  const windowSeconds = options.windowSeconds ?? 0.05;
  const sampleRate = buffer.sampleRate;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  const frameCount = buffer.length;
  const windowFrames = Math.max(1, Math.round(sampleRate * windowSeconds));
  const silences = [];
  let silenceStart = null;
  let squareSum = 0;
  let peak = 0;
  let clippedFrames = 0;

  for (let windowStart = 0; windowStart < frameCount; windowStart += windowFrames) {
    const windowEnd = Math.min(frameCount, windowStart + windowFrames);
    let windowSquareSum = 0;
    let windowSamples = 0;
    let windowPeak = 0;

    for (let frame = windowStart; frame < windowEnd; frame += 1) {
      let frameClipped = false;
      for (const channel of channels) {
        const sample = channel[frame] || 0;
        const absolute = Math.abs(sample);
        windowSquareSum += sample * sample;
        windowSamples += 1;
        windowPeak = Math.max(windowPeak, absolute);
        peak = Math.max(peak, absolute);
        if (absolute >= 0.999) frameClipped = true;
      }
      if (frameClipped) clippedFrames += 1;
    }

    squareSum += windowSquareSum;
    const windowRms = Math.sqrt(windowSquareSum / Math.max(1, windowSamples));
    if (windowRms <= silenceThreshold && windowPeak <= silenceThreshold * 2) {
      if (silenceStart === null) silenceStart = windowStart / sampleRate;
    } else if (silenceStart !== null) {
      const end = windowStart / sampleRate;
      if (end - silenceStart >= minimumSilenceSeconds) silences.push({ start: silenceStart, end, duration: end - silenceStart });
      silenceStart = null;
    }
  }

  if (silenceStart !== null) {
    const end = frameCount / sampleRate;
    if (end - silenceStart >= minimumSilenceSeconds) silences.push({ start: silenceStart, end, duration: end - silenceStart });
  }

  const sampleCount = Math.max(1, frameCount * Math.max(1, channels.length));
  const rms = Math.sqrt(squareSum / sampleCount);
  return {
    silences,
    peak,
    peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
    rms,
    rmsDb: rms > 0 ? 20 * Math.log10(rms) : -Infinity,
    clippedFrames,
    clippedRatio: clippedFrames / Math.max(1, frameCount),
  };
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}

function sampleLinear(channel, position) {
  const leftIndex = Math.min(channel.length - 1, Math.max(0, Math.floor(position)));
  const rightIndex = Math.min(channel.length - 1, leftIndex + 1);
  const fraction = position - leftIndex;
  return channel[leftIndex] * (1 - fraction) + channel[rightIndex] * fraction;
}

export function renderClipsToWav(clips, targetSampleRate = 44100) {
  if (!clips.length) throw new Error("拼接列表为空");
  const channelCount = Math.min(2, Math.max(...clips.map(({ buffer }) => buffer.numberOfChannels)));
  const clipFrames = clips.map(({ buffer, start, end }) => {
    const safeStart = Math.max(0, Math.min(buffer.duration, start));
    const safeEnd = Math.max(safeStart, Math.min(buffer.duration, end));
    return Math.round((safeEnd - safeStart) * targetSampleRate);
  });
  const totalFrames = clipFrames.reduce((sum, frames) => sum + frames, 0);
  const dataBytes = totalFrames * channelCount * 2;
  if (!totalFrames) throw new Error("没有可导出的有效选区");
  if (dataBytes > 0xfffffff0) throw new Error("合成音频过长，WAV 文件不能超过 4 GB");

  const arrayBuffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(arrayBuffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * channelCount * 2, true);
  view.setUint16(32, channelCount * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  let byteOffset = 44;
  clips.forEach(({ buffer, start }, clipIndex) => {
    const sourceChannels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    const startFrame = Math.max(0, start) * buffer.sampleRate;
    const sourceStep = buffer.sampleRate / targetSampleRate;
    for (let frame = 0; frame < clipFrames[clipIndex]; frame += 1) {
      const sourcePosition = startFrame + frame * sourceStep;
      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        const sourceChannel = sourceChannels[Math.min(channelIndex, sourceChannels.length - 1)];
        const sample = Math.max(-1, Math.min(1, sampleLinear(sourceChannel, sourcePosition)));
        view.setInt16(byteOffset, sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767), true);
        byteOffset += 2;
      }
    }
  });

  return new Uint8Array(arrayBuffer);
}

export function renderTimelineToWav(items, targetSampleRate = 44100) {
  if (!items.length) throw new Error("音频时间轴为空");
  const audioItems = items.filter((item) => item.buffer);
  if (!audioItems.length) throw new Error("时间轴中没有可导出的音频");
  const channelCount = Math.min(2, Math.max(...audioItems.map(({ buffer }) => buffer.numberOfChannels)));
  const itemFrames = items.map((item) => {
    if (item.buffer) return Math.round(item.buffer.duration * targetSampleRate);
    return Math.max(0, Math.round((item.silenceSeconds || 0) * targetSampleRate));
  });
  const totalFrames = itemFrames.reduce((sum, frames) => sum + frames, 0);
  const dataBytes = totalFrames * channelCount * 2;
  if (!totalFrames) throw new Error("没有可导出的有效音频");
  if (dataBytes > 0xfffffff0) throw new Error("合成音频过长，WAV 文件不能超过 4 GB");

  const arrayBuffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(arrayBuffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * channelCount * 2, true);
  view.setUint16(32, channelCount * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  let byteOffset = 44;
  items.forEach((item, itemIndex) => {
    if (!item.buffer) {
      byteOffset += itemFrames[itemIndex] * channelCount * 2;
      return;
    }
    const { buffer } = item;
    const sourceChannels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    const sourceStep = buffer.sampleRate / targetSampleRate;
    for (let frame = 0; frame < itemFrames[itemIndex]; frame += 1) {
      const sourcePosition = frame * sourceStep;
      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        const sourceChannel = sourceChannels[Math.min(channelIndex, sourceChannels.length - 1)];
        const sample = Math.max(-1, Math.min(1, sampleLinear(sourceChannel, sourcePosition)));
        view.setInt16(byteOffset, sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767), true);
        byteOffset += 2;
      }
    }
  });

  return new Uint8Array(arrayBuffer);
}

export { SILENCE_THRESHOLD };
