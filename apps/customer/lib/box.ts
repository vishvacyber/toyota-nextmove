/** Inspection `box` is x, y, w, h as 0..1 fractions of the photo; clamp so a bad box never leaves the image. */
export function boxStyle(box: number[]) {
  const c = (n: number) => Math.min(1, Math.max(0, n));
  const [x, y] = [c(box[0]), c(box[1])];
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  return { left: pct(x), top: pct(y), width: pct(Math.min(c(box[2]), 1 - x)), height: pct(Math.min(c(box[3]), 1 - y)) };
}
