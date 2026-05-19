/**
 * Image analysis pipeline: OCR detections + ImageData → ReportData.
 *
 * This module is the single public API other projects need to call.
 * It depends only on core/contrast.js and accepts plain data types.
 *
 * @module core/analyse
 */

import {
  worstStripContrast,
  thresholdsFor,
  colourDistance
} from './contrast.js';

// ── OCR filter ───────────────────────────────────────────────────────────────

/**
 * Drop low-quality or degenerate OCR words before analysis.
 *   - text length < 2 or fewer than 2 alphanumeric characters
 *   - confidence below 25 % (long words) or 50 % (short words)
 *   - bbox smaller than 4 × 4 px
 *
 * @param {import('./schema.js').OcrWord[]} words
 * @returns {import('./schema.js').OcrWord[]}
 */
export function filterOcrDetections(words) {
  const out = [];
  for (const w of words) {
    const text = (w.text || '').trim();
    if (text.length < 2) continue;
    const alnum = (text.match(/[\p{L}\p{N}]/gu) || []).length;
    if (alnum < 2) continue;
    const minConf = alnum >= 6 ? 25 : 50;
    if (Math.trunc((w.score ?? 1) * 100) < minConf) continue;
    const b = w.bbox;
    if (!b || b.w < 4 || b.h < 4) continue;
    out.push({ ...w, text });
  }
  return out;
}

// ── Colour-pair merge ────────────────────────────────────────────────────────

/**
 * Collapse per-detection findings into unique ColourPairs.
 * Two findings merge when both FG and BG colour distances are below the
 * threshold. The pair always retains the worst (lowest) contrast seen.
 *
 * @param {Object[]} findings
 * @param {number}   [threshold=25]
 * @returns {import('./schema.js').ColourPair[]}  Sorted worst-first.
 */
export function buildColourPairs(findings, threshold = 25) {
  const pairs = [];

  for (const f of findings) {
    let merged = false;
    for (const p of pairs) {
      if (
        colourDistance(f.fgHex, p.fgHex) < threshold &&
        colourDistance(f.bgHex, p.bgHex) < threshold
      ) {
        if (f.contrast < p.contrast) {
          p.contrast   = f.contrast;
          p.fgHex      = f.fgHex;
          p.bgHex      = f.bgHex;
          p.pass       = f.pass;
          p.passAaa    = f.passAaa;
          p.requiredAaa = f.requiredAaa;
        }
        p.examples.push(f.text);
        p.bboxes.push(f.bbox);
        merged = true;
        break;
      }
    }
    if (!merged) {
      pairs.push({
        fgHex:       f.fgHex,
        bgHex:       f.bgHex,
        contrast:    f.contrast,
        pass:        f.pass,
        required:    f.required,
        passAaa:     f.passAaa,
        requiredAaa: f.requiredAaa,
        examples:    [f.text],
        bboxes:      [f.bbox]
      });
    }
  }

  // Deduplicate example words and cap at 6.
  for (const p of pairs) {
    const seen = new Set();
    const dedup = [];
    for (const e of p.examples) {
      const key = (e || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      dedup.push(e);
      if (dedup.length >= 6) break;
    }
    p.examples = dedup;
  }

  pairs.sort((a, b) => a.contrast - b.contrast);
  return pairs;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the full contrast analysis pipeline on a decoded image.
 *
 * @param {ImageData}                          imageData     Pixel data of the (resized) image
 * @param {import('./schema.js').OcrWord[]}    ocrDetections Raw OCR output from any adapter
 * @returns {import('./schema.js').ReportData}
 */
export function analyseImage(imageData, ocrDetections) {
  const words = filterOcrDetections(ocrDetections || []);

  if (words.length === 0) {
    return {
      hasText: false, colourPairs: [],
      verdict: 'NO_TEXT', flag: false,
      detail: 'No text detected by OCR'
    };
  }

  const findings = [];
  for (const w of words) {
    const { x, y, w: bw, h: bh } = w.bbox;
    const result = worstStripContrast(
      imageData,
      Math.round(x), Math.round(y),
      Math.round(bw), Math.round(bh)
    );
    if (!result) continue;

    const { required, requiredAaa } = thresholdsFor(bh);
    const cr = Math.round(result.contrast * 100) / 100;
    findings.push({
      text: w.text,
      contrast: cr,
      fgHex:    result.fgHex,
      bgHex:    result.bgHex,
      bbox:     { x: Math.round(x), y: Math.round(y), w: Math.round(bw), h: Math.round(bh) },
      required, requiredAaa,
      pass:     cr >= required,
      passAaa:  cr >= requiredAaa
    });
  }

  if (findings.length === 0) {
    return {
      hasText: false, colourPairs: [],
      verdict: 'NO_TEXT', flag: false,
      detail: 'No text detected by OCR'
    };
  }

  const colourPairs = buildColourPairs(findings);
  const failures    = colourPairs.filter((p) => !p.pass);
  const verdict     = failures.length ? 'FAIL' : 'PASS';
  const minCr       = colourPairs[0].contrast;
  const maxCr       = colourPairs[colourPairs.length - 1].contrast;

  let detail;
  if (failures.length) {
    const worst = failures[0];
    detail = `${failures.length}/${colourPairs.length} colour combination(s) fail WCAG 2.2 AA — `
           + `worst: ${worst.fgHex} on ${worst.bgHex} `
           + `at ${worst.contrast.toFixed(1)}:1 (required ${worst.required}:1)`;
  } else {
    detail = `All ${colourPairs.length} colour combination(s) pass `
           + `(range ${minCr.toFixed(1)}–${maxCr.toFixed(1)}:1)`;
  }

  return {
    hasText: true, colourPairs,
    verdict, flag: verdict === 'FAIL',
    detail
  };
}
