import test from "node:test";
import assert from "node:assert/strict";
import { inspectAudioBuffer, renderClipsToWav } from "../static/audio-utils.js";

function audioBuffer(channels, sampleRate) {
  return {
    numberOfChannels: channels.length,
    sampleRate,
    length: channels[0].length,
    duration: channels[0].length / sampleRate,
    getChannelData(index) {
      return channels[index];
    },
  };
}

test("detects only silence intervals lasting at least three seconds", () => {
  const sampleRate = 100;
  const data = new Float32Array(sampleRate * 10).fill(0.2);
  data.fill(0, sampleRate * 2, sampleRate * 6);
  data.fill(0, sampleRate * 8, sampleRate * 9);
  const result = inspectAudioBuffer(audioBuffer([data], sampleRate));

  assert.equal(result.silences.length, 1);
  assert.equal(result.silences[0].start, 2);
  assert.equal(result.silences[0].end, 6);
});

test("reports low level and clipped samples", () => {
  const data = new Float32Array(1000).fill(0.001);
  data[100] = 1;
  const result = inspectAudioBuffer(audioBuffer([data], 100));

  assert.equal(result.clippedFrames, 1);
  assert.equal(result.peak, 1);
  assert.ok(Number.isFinite(result.rmsDb));
});

test("renders ordered clips to a valid PCM WAV", () => {
  const first = audioBuffer([Float32Array.from([0, 0.5, 1, 0.5])], 4);
  const second = audioBuffer([Float32Array.from([-1, -0.5, 0, 0.5])], 4);
  const wav = renderClipsToWav([
    { buffer: first, start: 0.25, end: 0.75 },
    { buffer: second, start: 0, end: 0.5 },
  ], 4);
  const view = new DataView(wav.buffer);

  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), "RIFF");
  assert.equal(new TextDecoder().decode(wav.slice(8, 12)), "WAVE");
  assert.equal(view.getUint32(24, true), 4);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(40, true), 8);
  assert.equal(view.getInt16(44, true), 16384);
  assert.equal(view.getInt16(48, true), -32768);
});
