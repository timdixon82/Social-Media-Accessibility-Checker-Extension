/**
 * OCR adapter — PaddleOCR PP-OCRv4 via @gutenye/ocr-browser + ONNX Runtime Web.
 *
 * Extension-specific version: model and WASM paths cannot use
 * import.meta.env.BASE_URL (Vite-specific) or chrome.runtime.getURL
 * (unavailable in the sandboxed page). Paths are injected at runtime
 * via initOcr() from the message the service worker sends.
 *
 * @module adapters/paddle-ocr
 */

import Ocr  from '@gutenye/ocr-browser';
import * as ort from 'onnxruntime-web';

let ocrInstance = null;

/**
 * Initialise ORT WASM and create the PaddleOCR instance.
 * Called once from sandbox.js when the 'init' message arrives.
 *
 * @param {{ wasmPaths: string, models: { detectionPath: string, recognitionPath: string, dictionaryPath: string } }} options
 */
export async function initOcr({ wasmPaths, models }) {
  ort.env.wasm.wasmPaths = wasmPaths;
  // Disable the WASM proxy worker. The proxy serialises worker code as a string
  // and evaluates it dynamically, which Chrome MV3 blocks as 'unsafe-eval'.
  ort.env.wasm.proxy      = false;
  ort.env.wasm.numThreads = 1;
  ocrInstance = await Ocr.create({
    models,
    onnxOptions: { executionProviders: ['wasm'] },
  });
}

/**
 * Run OCR on a data URL and return normalised word detections.
 *
 * @param {string} dataUrl  PNG/JPEG base64 data URL
 * @returns {Promise<import('../core/schema.js').OcrWord[]>}
 */
export async function runOcr(dataUrl) {
  if (!ocrInstance) throw new Error('OCR not ready — call initOcr first');
  const blob    = dataUrlToBlob(dataUrl);
  const blobUrl = URL.createObjectURL(blob);
  const lines   = await ocrInstance.detect(blobUrl);
  URL.revokeObjectURL(blobUrl);
  return (lines || [])
    .map((line) => ({
      text:  line.text || '',
      score: typeof line.mean === 'number' ? line.mean : 1,
      bbox:  polyToBbox(line.box),
    }))
    .filter((d) => d.bbox && d.bbox.w > 0 && d.bbox.h > 0);
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function dataUrlToBlob(dataUrl) {
  const comma  = dataUrl.indexOf(',');
  const mime   = dataUrl.slice(5, dataUrl.indexOf(';')) || 'image/png';
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Convert a 4-point polygon [[x,y]…] to an axis-aligned BBox. */
function polyToBbox(poly) {
  if (!poly || !poly.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [px, py] of poly) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
