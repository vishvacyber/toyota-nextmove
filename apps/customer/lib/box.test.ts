import { test } from "node:test";
import assert from "node:assert/strict";
import { boxStyle } from "./box.ts";

test("box fractions become percent", () => {
  assert.deepEqual(boxStyle([0.42, 0.62, 0.18, 0.1]), { left: "42.00%", top: "62.00%", width: "18.00%", height: "10.00%" });
});

test("box is clamped inside the photo", () => {
  assert.deepEqual(boxStyle([0.9, -0.2, 0.5, 2]), { left: "90.00%", top: "0.00%", width: "10.00%", height: "100.00%" });
});
