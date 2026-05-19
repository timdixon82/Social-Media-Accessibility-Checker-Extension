#!/usr/bin/env node
// Generates icon16.png, icon48.png, icon128.png in src/icons/
// Uses only Node.js built-ins — no external dependencies.
import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dir, '..', 'src', 'icons');
mkdirSync(outDir, { recursive: true });

// CRC32
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

function encodePNG(w, h, rgba) {
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  ihdr[10] = ihdr[11] = ihdr[12] = 0;

  // Prepend filter byte 0 to each row
  const rows = Buffer.allocUnsafe(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    rows[y * (1 + w * 4)] = 0;
    rgba.copy(rows, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeIcon(size) {
  const rgba = Buffer.alloc(size * size * 4, 0);

  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    // Alpha-blend onto existing pixel
    const ea = rgba[i + 3] / 255;
    const na = a / 255;
    const out = na + ea * (1 - na);
    if (out === 0) return;
    rgba[i]     = Math.round((r * na + rgba[i]     * ea * (1 - na)) / out);
    rgba[i + 1] = Math.round((g * na + rgba[i + 1] * ea * (1 - na)) / out);
    rgba[i + 2] = Math.round((b * na + rgba[i + 2] * ea * (1 - na)) / out);
    rgba[i + 3] = Math.round(out * 255);
  };

  // Blue rounded-square background with anti-aliased corners
  const cornerR = size * 0.18;
  const [bR, bG, bB] = [26, 115, 232]; // #1a73e8
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nearX = Math.max(cornerR, Math.min(size - 1 - cornerR, x));
      const nearY = Math.max(cornerR, Math.min(size - 1 - cornerR, y));
      const dist = Math.sqrt((x - nearX) ** 2 + (y - nearY) ** 2);
      const alpha = Math.round(Math.max(0, Math.min(1, cornerR - dist + 0.5)) * 255);
      if (alpha > 0) set(x, y, bR, bG, bB, alpha);
    }
  }

  // White eye shape (ellipse) centred slightly above middle
  const cx = size / 2;
  const cy = size * 0.48;
  const eRx = size * 0.36; // horizontal semi-axis
  const eRy = size * 0.19; // vertical semi-axis
  const irisR = size * 0.12; // iris radius

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const eyeDist = Math.sqrt((dx / eRx) ** 2 + (dy / eRy) ** 2);
      if (eyeDist > 1.4) continue;

      // Anti-aliased eye edge
      const edgeAlpha = Math.round(Math.max(0, Math.min(1, (1.2 - eyeDist) / 0.25)) * 255);
      if (edgeAlpha <= 0) continue;

      const inIris = dx * dx + dy * dy <= irisR * irisR;
      if (inIris) {
        // Dark-blue iris
        set(x, y, 10, 60, 150, edgeAlpha);
      } else if (eyeDist <= 1.0) {
        set(x, y, 255, 255, 255, edgeAlpha);
      }
    }
  }

  // White highlight dot in iris
  const hlR = irisR * 0.32;
  const hlCx = cx - irisR * 0.27, hlCy = cy - irisR * 0.27;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - hlCx, dy = y - hlCy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const a = Math.round(Math.max(0, Math.min(1, (hlR - d + 0.5))) * 255);
      if (a > 0) set(x, y, 255, 255, 255, a);
    }
  }

  return encodePNG(size, size, rgba);
}

for (const size of [16, 48, 128]) {
  const filePath = join(outDir, `icon${size}.png`);
  writeFileSync(filePath, makeIcon(size));
  console.log(`  icon${size}.png`);
}
console.log('Icons generated in src/icons/');
