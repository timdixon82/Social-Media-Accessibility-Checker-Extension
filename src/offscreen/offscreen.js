// Hidden offscreen document — canvas decode and WCAG contrast analysis.
// OCR (onnxruntime-web) is NOT loaded here: offscreen documents lack the
// cross-origin isolation (COEP/COOP headers) that Chrome requires before
// granting SharedArrayBuffer access, which threaded WASM needs. Any attempt
// to load onnxruntime-web here crashes the document silently.
//
// Instead, the service worker fetches each image and sends a base64 data URL.
// We decode it locally (no network), run canvas analysis, then pass a
// synthetic whole-image detection to analyseImage so the full contrast path
// runs rather than returning NO_TEXT.

import { analyseImage } from '../core/analyse.js';
import { decodeAndResize, bitmapToImageData } from '../core/image.js';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== 'offscreen') return false;

  if (msg.type === 'ping') {
    sendResponse({ pong: true });
    return true;
  }

  if (msg.type === 'analyseImage') {
    handleAnalyse(msg.dataUrl).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  }

  return false;
});

async function handleAnalyse(dataUrl) {
  // Decode base64 data URL to Blob — no network fetch needed.
  const comma = dataUrl.indexOf(',');
  const meta  = dataUrl.slice(0, comma);
  const b64   = dataUrl.slice(comma + 1);
  const type  = meta.split(':')[1]?.split(';')[0] || 'image/jpeg';
  const binary = atob(b64);
  const uint8  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) uint8[i] = binary.charCodeAt(i);
  const blob = new Blob([uint8], { type });

  const bitmap = await decodeAndResize(blob);
  const { imageData } = bitmapToImageData(bitmap);
  bitmap.close?.();

  // Divide the image into a 3×3 grid so analyseImage produces up to 9 findings
  // that buildColourPairs can merge into distinct colour combinations.
  // One synthetic detection for the whole image only ever yields a single pair.
  const COLS = 3, ROWS = 3;
  const LABELS = [
    ['Top-left',    'Top-center',    'Top-right'],
    ['Middle-left', 'Middle-center', 'Middle-right'],
    ['Bottom-left', 'Bottom-center', 'Bottom-right'],
  ];
  const detections = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = Math.round(col * imageData.width  / COLS);
      const y = Math.round(row * imageData.height / ROWS);
      const w = (col === COLS - 1) ? imageData.width  - x : Math.round(imageData.width  / COLS);
      const h = (row === ROWS - 1) ? imageData.height - y : Math.round(imageData.height / ROWS);
      detections.push({ text: LABELS[row][col], score: 1, bbox: { x, y, w, h } });
    }
  }

  const report = analyseImage(imageData, detections);
  return { report };
}
