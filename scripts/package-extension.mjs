#!/usr/bin/env node
// Zips the dist/ folder into extension.zip ready for store submission.
// Usage: node scripts/package-extension.mjs
import { createWriteStream, readdirSync, statSync, readFileSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createDeflateRaw } from 'zlib';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const distDir = join(root, 'dist');
const outFile = join(root, 'extension.zip');

// Read version from manifest
const manifest = JSON.parse(readFileSync(join(distDir, 'manifest.json'), 'utf8'));
const version = manifest.version ?? '1.0.0';

// Collect all files in dist recursively
function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry); // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal — dir is a trusted build-output path; entry comes from fs.readdirSync, not user input.
    if (statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

// Minimal ZIP writer (DEFLATE + central directory)
function writeZip(entries, destPath) {
  const centralDir = [];
  let offset = 0;
  const parts = [];

  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name);
    const compressed = createDeflateRawSync(data);
    const crc = crc32(data);

    const local = Buffer.allocUnsafe(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);  // signature
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0, 6);           // flags
    local.writeUInt16LE(8, 8);           // DEFLATE
    local.writeUInt16LE(0, 10);          // mod time
    local.writeUInt16LE(0, 12);          // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.copy(local, 30);

    parts.push(local, compressed);

    const cd = Buffer.allocUnsafe(46 + nameBytes.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBytes.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    nameBytes.copy(cd, 46);
    centralDir.push(cd);

    offset += local.length + compressed.length;
  }

  const cdBuf = Buffer.concat(centralDir);
  const eocd = Buffer.allocUnsafe(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(centralDir.length, 8);
  eocd.writeUInt16LE(centralDir.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  const out = createWriteStream(destPath);
  for (const p of parts) out.write(p);
  out.write(cdBuf);
  out.write(eocd);
  out.end();
  return new Promise(r => out.on('finish', r));
}

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

// Synchronous deflate wrapper
import { deflateRawSync } from 'zlib';
function createDeflateRawSync(buf) { return deflateRawSync(buf); }

const files = walk(distDir);
const entries = files.map(f => ({
  name: relative(distDir, f).replace(/\\/g, '/'),
  data: readFileSync(f),
}));

await writeZip(entries, outFile);
console.log(`Packaged v${version} → extension.zip (${entries.length} files)`);
