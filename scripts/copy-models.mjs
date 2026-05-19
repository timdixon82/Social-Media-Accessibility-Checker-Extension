// Copies @gutenye/ocr-browser model files and onnxruntime-web WASM assets
// into vendor/ so webpack CopyPlugin can include them in dist/.
// Run automatically as a postinstall step.

import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot  = resolve(__dirname, '..');

const modelDst = join(repoRoot, 'vendor', 'models');
const ortDst   = join(repoRoot, 'vendor', 'ort');

mkdirSync(modelDst, { recursive: true });
mkdirSync(ortDst,   { recursive: true });

// OCR model files
const modelSrc = join(repoRoot, 'node_modules', '@gutenye', 'ocr-models', 'assets');
if (existsSync(modelSrc)) {
  for (const name of [
    'ch_PP-OCRv4_det_infer.onnx',
    'ch_PP-OCRv4_rec_infer.onnx',
    'ppocr_keys_v1.txt',
  ]) {
    const src = join(modelSrc, name);
    if (!existsSync(src)) { console.warn(`[copy-models] missing ${src}`); continue; }
    copyFileSync(src, join(modelDst, name));
  }
} else {
  console.warn('[copy-models] @gutenye/ocr-models not found — run npm install first');
}

// ORT WASM + worker assets
const ortSrc = join(repoRoot, 'node_modules', 'onnxruntime-web', 'dist');
if (existsSync(ortSrc)) {
  for (const f of readdirSync(ortSrc)) {
    if (/\.(wasm|mjs)$/.test(f) || /^ort-[^/]+\.js$/.test(f)) {
      copyFileSync(join(ortSrc, f), join(ortDst, f));
    }
  }
} else {
  console.warn('[copy-models] onnxruntime-web/dist not found — ORT WASM will not be served');
}

console.log('[copy-models] done');
