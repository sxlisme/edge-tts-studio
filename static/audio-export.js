import { Mp3Encoder } from "@breezystack/lamejs";

function readPcmWav(wavBytes) {
  const view = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);
  const signature = String.fromCharCode(...wavBytes.slice(0, 4));
  const wave = String.fromCharCode(...wavBytes.slice(8, 12));
  const audioFormat = view.getUint16(20, true);
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);
  if (signature !== "RIFF" || wave !== "WAVE" || audioFormat !== 1 || bitsPerSample !== 16 || ![1, 2].includes(channels)) {
    throw new Error("仅支持 16 位单声道或双声道 PCM WAV 音频");
  }
  return { view, channels, sampleRate, dataOffset: 44, frameCount: Math.floor((wavBytes.byteLength - 44) / (channels * 2)) };
}

export async function encodeWavToMp3(wavBytes, options = {}) {
  const { view, channels, sampleRate, dataOffset, frameCount } = readPcmWav(wavBytes);
  const bitrate = options.bitrate || 128;
  const blockFrames = 1152;
  const encoder = new Mp3Encoder(channels, sampleRate, bitrate);
  const chunks = [];
  let totalBytes = 0;

  for (let startFrame = 0, blockIndex = 0; startFrame < frameCount; startFrame += blockFrames, blockIndex += 1) {
    const frames = Math.min(blockFrames, frameCount - startFrame);
    const left = new Int16Array(frames);
    const right = channels === 2 ? new Int16Array(frames) : undefined;
    for (let frame = 0; frame < frames; frame += 1) {
      const offset = dataOffset + (startFrame + frame) * channels * 2;
      left[frame] = view.getInt16(offset, true);
      if (right) right[frame] = view.getInt16(offset + 2, true);
    }
    const chunk = encoder.encodeBuffer(left, right);
    if (chunk.length) {
      chunks.push(chunk);
      totalBytes += chunk.length;
    }
    options.onProgress?.((startFrame + frames) / frameCount);
    if (blockIndex > 0 && blockIndex % 160 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const finalChunk = encoder.flush();
  if (finalChunk.length) {
    chunks.push(finalChunk);
    totalBytes += finalChunk.length;
  }
  const mp3Bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    mp3Bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return mp3Bytes;
}
