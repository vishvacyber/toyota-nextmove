import { test } from "node:test";
import assert from "node:assert/strict";
import { floatTo16, pcm16ToFloat, rms } from "./voice.ts";

test("float samples become clamped PCM16 and back", () => {
  const pcm = floatTo16(new Float32Array([0, 1, -1, 2, -2, 0.5]));
  assert.deepEqual([...pcm], [0, 32767, -32768, 32767, -32768, 16383]);
  const back = pcm16ToFloat(pcm.buffer);
  assert.equal(back[2], -1);
  assert.ok(Math.abs(back[5] - 0.5) < 0.001);
});

test("odd byte counts are ignored, silence has no energy", () => {
  assert.equal(pcm16ToFloat(new ArrayBuffer(5)).length, 2);
  assert.equal(rms(new Float32Array(160)), 0);
  assert.ok(Math.abs(rms(new Float32Array([0.5, -0.5])) - 0.5) < 1e-9);
});
