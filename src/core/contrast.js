/**
 * Pure WCAG 2.2 contrast math.
 * No DOM, no browser APIs — safe to run in Node, workers, or the browser.
 *
 * @module core/contrast
 */

// sRGB linearisation per IEC 61966-2-1 (threshold 0.04045).
export function linearise(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

// Pre-computed look-up table for the pixel loop hot path.
const LIN_LUT = new Float64Array(256);
for (let i = 0; i < 256; i++) LIN_LUT[i] = linearise(i);

/** Relative luminance from integer 0–255 RGB channels. */
export function luminance(r, g, b) {
  return 0.2126 * LIN_LUT[r] + 0.7152 * LIN_LUT[g] + 0.0722 * LIN_LUT[b];
}

/** Relative luminance from float RGB (rounds to nearest integer first). */
export function luminanceFloat(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  return luminance(clamp(r), clamp(g), clamp(b));
}

/** WCAG contrast ratio between two relative luminance values. */
export function wcagContrast(l1, l2) {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/** Parse a 6-digit hex colour string to [r, g, b] integers. */
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}

/** Encode integer RGB to uppercase hex string with leading #. */
export function rgbToHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n)))
    .toString(16).padStart(2, '0').toUpperCase();
  return '#' + c(r) + c(g) + c(b);
}

/** Euclidean distance between two hex colour strings. */
export function colourDistance(h1, h2) {
  const [r1, g1, b1] = hexToRgb(h1);
  const [r2, g2, b2] = hexToRgb(h2);
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * 1-D k-means with k=2.
 * Initialises from the 25th/75th percentile values and iterates to
 * fixed-point. Returns [dark, light] centroids, or null for < 4 values.
 * @param {ArrayLike<number>} values
 * @returns {[number, number]|null}
 */
export function kmeans2(values) {
  if (!values || values.length < 4) return null;

  const sv = Float64Array.from(values).sort();
  const n  = sv.length;
  let c0 = sv[Math.floor(n * 0.25)];
  let c1 = sv[Math.floor(n * 0.75)];
  if (c0 === c1) c1 = c0 + 1e-9;

  for (let iter = 0; iter < 60; iter++) {
    let s0 = 0, s1 = 0, n0 = 0, n1 = 0;
    for (let i = 0; i < n; i++) {
      const v = sv[i];
      if (Math.abs(v - c1) < Math.abs(v - c0)) { s1 += v; n1++; }
      else                                      { s0 += v; n0++; }
    }
    const nc0 = n0 ? s0 / n0 : c0;
    const nc1 = n1 ? s1 / n1 : c1;
    if (Math.abs(nc0 - c0) < 1e-7 && Math.abs(nc1 - c1) < 1e-7) { c0 = nc0; c1 = nc1; break; }
    c0 = nc0; c1 = nc1;
  }

  if (c0 > c1) { const t = c0; c0 = c1; c1 = t; }
  return [c0, c1];
}

/**
 * Contrast result for a single image region.
 * @typedef {Object} RegionResult
 * @property {number} contrast
 * @property {string} fgHex
 * @property {string} bgHex
 * @property {number[]} fgRgb
 * @property {number[]} bgRgb
 */

/**
 * Sample a rectangular region of an ImageData and return the WCAG contrast
 * ratio between the text (minority pixel cluster) and background (majority).
 * Expands the region by 2 px on every side to capture anti-aliasing fringe.
 * Returns null for regions that are too small or near-uniform (no real text).
 *
 * @param {ImageData} imageData
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @returns {RegionResult|null}
 */
export function regionContrast(imageData, x, y, w, h) {
  const W = imageData.width, H = imageData.height;
  const data = imageData.data;

  const x1 = Math.max(0, x - 2), y1 = Math.max(0, y - 2);
  const x2 = Math.min(W, x + w + 2), y2 = Math.min(H, y + h + 2);
  const rw = x2 - x1, rh = y2 - y1;
  if (rw < 4 || rh < 4) return null;

  const lums = new Float64Array(rw * rh);
  let i = 0;
  for (let yy = y1; yy < y2; yy++) {
    const rowStart = yy * W;
    for (let xx = x1; xx < x2; xx++) {
      const off = (rowStart + xx) * 4;
      lums[i++] = 0.2126 * LIN_LUT[data[off]]
                + 0.7152 * LIN_LUT[data[off + 1]]
                + 0.0722 * LIN_LUT[data[off + 2]];
    }
  }

  const c = kmeans2(lums);
  if (!c) return null;
  const [cDark, cLight] = c;

  // Skip near-uniform regions — prevents false positives where OCR strips
  // land on pure background and k-means splits anti-aliasing noise.
  if (cLight - cDark < 0.02) return null;

  let r0 = 0, g0 = 0, b0 = 0, n0 = 0;
  let r1 = 0, g1 = 0, b1 = 0, n1 = 0;
  i = 0;
  for (let yy = y1; yy < y2; yy++) {
    const rowStart = yy * W;
    for (let xx = x1; xx < x2; xx++) {
      const off = (rowStart + xx) * 4;
      const v = lums[i++];
      if (Math.abs(v - cLight) < Math.abs(v - cDark)) {
        r1 += data[off]; g1 += data[off + 1]; b1 += data[off + 2]; n1++;
      } else {
        r0 += data[off]; g0 += data[off + 1]; b0 += data[off + 2]; n0++;
      }
    }
  }

  const mean0 = n0 ? [r0 / n0, g0 / n0, b0 / n0] : [0, 0, 0];
  const mean1 = n1 ? [r1 / n1, g1 / n1, b1 / n1] : [255, 255, 255];

  // Text = minority cluster; background = majority.
  const fgRgb = (n0 <= n1) ? mean0 : mean1;
  const bgRgb = (n0 <= n1) ? mean1 : mean0;

  const fgHex = rgbToHex(...fgRgb);
  const bgHex = rgbToHex(...bgRgb);
  const contrast = wcagContrast(luminanceFloat(...fgRgb), luminanceFloat(...bgRgb));

  return { contrast, fgHex, bgHex, fgRgb, bgRgb };
}

/**
 * Split a bounding box into narrow vertical strips (~one character wide at
 * 60 % of cap height) and return the strip with the lowest contrast ratio.
 * This ensures each letter in a word is individually sampled.
 *
 * @param {ImageData} imageData
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @returns {RegionResult|null}
 */
export function worstStripContrast(imageData, x, y, w, h) {
  const stripW    = Math.max(4, Math.floor(h * 0.6));
  const nStrips   = Math.max(3, Math.round(w / stripW));
  const actualW   = w / nStrips;
  const results   = [];

  for (let s = 0; s < nStrips; s++) {
    const sx = x + Math.round(s * actualW);
    const sw = Math.max(4, Math.round(actualW));
    const r  = regionContrast(imageData, sx, y, sw, h);
    if (r) results.push(r);
  }

  if (results.length === 0) return regionContrast(imageData, x, y, w, h);
  return results.reduce((worst, r) => r.contrast < worst.contrast ? r : worst, results[0]);
}

/**
 * WCAG AA / AAA thresholds for the given box height.
 * Large text = bbox height ≥ 24 px in the canonical resized space.
 *
 * @param {number} heightPx
 * @returns {{ isLarge: boolean, required: number, requiredAaa: number }}
 */
export function thresholdsFor(heightPx) {
  const isLarge = heightPx >= 24;
  return {
    isLarge,
    required:    isLarge ? 3.0 : 4.5,
    requiredAaa: isLarge ? 4.5 : 7.0
  };
}
