/**
 * Canvas rendering helpers — pure drawing, no app-specific strings.
 * Each function returns { canvas, dataUrl } so the same node can be
 * inserted into the DOM and re-encoded for PDF/Markdown without redrawing.
 *
 * Extension note: makeSwatch adds a 2-px grey divider between bg/fg halves.
 * makeClip returns null for empty bboxes (caller must guard).
 *
 * @module render/canvas
 */

const SWATCH_W    = 80;
const SWATCH_H    = 20;
const CLIP_PADDING = 32;

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/**
 * Side-by-side colour swatch: left half = background, right half = foreground,
 * separated by a 2-px grey divider for legibility at small sizes.
 *
 * @param {string} fgHex
 * @param {string} bgHex
 * @returns {{ canvas: HTMLCanvasElement, dataUrl: string }}
 */
export function makeSwatch(fgHex, bgHex) {
  const canvas = newCanvas(SWATCH_W, SWATCH_H);
  const ctx    = canvas.getContext('2d');
  const half   = SWATCH_W / 2;
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, half, SWATCH_H);
  ctx.fillStyle = fgHex;
  ctx.fillRect(half, 0, SWATCH_W - half, SWATCH_H);
  ctx.fillStyle = 'rgb(200,200,200)';
  ctx.fillRect(half - 1, 0, 2, SWATCH_H);
  return { canvas, dataUrl: canvas.toDataURL('image/png') };
}

/**
 * Crop the source canvas to the union of bboxes plus padding, outlining each
 * bbox in red. Returns null when bboxes is empty or falsy.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {import('../core/schema.js').BBox[]} bboxes
 * @param {number} [padding]
 * @returns {{ canvas: HTMLCanvasElement, dataUrl: string }|null}
 */
export function makeClip(sourceCanvas, bboxes, padding = CLIP_PADDING) {
  if (!bboxes || bboxes.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of bboxes) {
    if (b.x         < minX) minX = b.x;
    if (b.y         < minY) minY = b.y;
    if (b.x + b.w   > maxX) maxX = b.x + b.w;
    if (b.y + b.h   > maxY) maxY = b.y + b.h;
  }
  const x1 = Math.max(0, Math.floor(minX - padding));
  const y1 = Math.max(0, Math.floor(minY - padding));
  const x2 = Math.min(sourceCanvas.width,  Math.ceil(maxX + padding));
  const y2 = Math.min(sourceCanvas.height, Math.ceil(maxY + padding));
  const w  = Math.max(1, x2 - x1);
  const h  = Math.max(1, y2 - y1);

  const canvas = newCanvas(w, h);
  const ctx    = canvas.getContext('2d');
  ctx.drawImage(sourceCanvas, x1, y1, w, h, 0, 0, w, h);
  ctx.lineWidth   = 2;
  ctx.strokeStyle = 'rgb(220,38,38)';
  for (const b of bboxes) ctx.strokeRect(b.x - x1, b.y - y1, b.w, b.h);
  return { canvas, dataUrl: canvas.toDataURL('image/png') };
}

/**
 * Downscale the source canvas to a maximum width, preserving aspect ratio.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {number} [maxWidth=600]
 * @returns {{ canvas: HTMLCanvasElement, dataUrl: string }}
 */
export function makePreview(sourceCanvas, maxWidth = 600) {
  const scale = Math.min(1, maxWidth / sourceCanvas.width);
  const w = Math.max(1, Math.round(sourceCanvas.width  * scale));
  const h = Math.max(1, Math.round(sourceCanvas.height * scale));
  const canvas = newCanvas(w, h);
  canvas.getContext('2d').drawImage(sourceCanvas, 0, 0, w, h);
  return { canvas, dataUrl: canvas.toDataURL('image/png') };
}

/**
 * Fit the source canvas into a square thumbnail of `size` pixels.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {number} [size=40]
 * @returns {{ canvas: HTMLCanvasElement, dataUrl: string }}
 */
export function makeThumb(sourceCanvas, size = 40) {
  const scale = size / Math.max(sourceCanvas.width, sourceCanvas.height);
  const w = Math.max(1, Math.round(sourceCanvas.width  * scale));
  const h = Math.max(1, Math.round(sourceCanvas.height * scale));
  const canvas = newCanvas(w, h);
  canvas.getContext('2d').drawImage(sourceCanvas, 0, 0, w, h);
  return { canvas, dataUrl: canvas.toDataURL('image/png') };
}

/**
 * Encode the full source canvas as a PNG data URL.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @returns {string}
 */
export function sourceDataUrl(sourceCanvas) {
  return sourceCanvas.toDataURL('image/png');
}
