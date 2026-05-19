/**
 * PDF export via pdfmake.
 * Adapted for extension data: imageReports use dataUrl strings instead of
 * HTMLCanvasElement. Accepts the extension's post + imageReports format.
 *
 * @module export/pdf
 */

import { makeSwatch } from '../render/canvas.js';
import { DISCLAIMER_TEXT, THRESHOLDS_FOOTER } from './strings.js';

let pdfMakePromise = null;

async function loadPdfMake() {
  if (pdfMakePromise) return pdfMakePromise;
  pdfMakePromise = (async () => {
    const pdfMake = (await import('pdfmake/build/pdfmake.js')).default;
    const fonts   = (await import('pdfmake/build/vfs_fonts.js')).default;
    pdfMake.vfs = fonts.vfs ?? fonts.pdfMake?.vfs ?? fonts;
    return pdfMake;
  })();
  return pdfMakePromise;
}

function verdictLabel(verdict) {
  if (verdict === 'PASS') return '✓ PASS';
  if (verdict === 'FAIL') return '✗ FAIL';
  return '— NO TEXT';
}

function buildDocDefinition(post, imageReports, timestamp) {
  const displayDate = post.displayDate || post.date || '';
  const platform    = post.platform    || '';
  const content     = [];

  // ── Branded header ──────────────────────────────────────────────────────────
  content.push({
    table: {
      widths: ['*'],
      body: [[{
        stack: [
          {
            text: [
              { text: 'Social Media Post ', color: '#ffffff', fontSize: 16, bold: true },
              { text: 'Accessibility', color: '#FF7C00', fontSize: 16, bold: true },
              { text: ' Checker', color: '#ffffff', fontSize: 16, bold: true },
            ]
          },
          { text: 'WCAG Accessibility Audit', color: '#63D2FF', fontSize: 9, margin: [0, 4, 0, 0] }
        ],
        fillColor: '#061528',
        margin: [16, 12, 16, 12]
      }]]
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 14]
  });

  content.push({ text: 'Accessibility Report', style: 'h1', margin: [0, 0, 0, 2] });
  if (timestamp) content.push({ text: `Generated ${timestamp}`, style: 'timestamp', margin: [0, 0, 0, 8] });

  // ── Post metadata ────────────────────────────────────────────────────────────
  const metaRows = [
    [{ text: 'Author',   style: 'metaLabel' }, { text: post.author || '', style: 'metaValue' }],
    [{ text: 'Date',     style: 'metaLabel' }, { text: displayDate,        style: 'metaValue' }],
  ];
  if (platform) metaRows.push([{ text: 'Platform', style: 'metaLabel' }, { text: platform, style: 'metaValue' }]);
  if (post.postUrl) metaRows.push([{ text: 'Post URL', style: 'metaLabel' }, { text: post.postUrl, link: post.postUrl, style: 'link' }]);

  content.push({
    table: { widths: [60, '*'], body: metaRows },
    layout: 'noBorders',
    margin: [0, 0, 0, 12]
  });

  // ── Disclaimer ───────────────────────────────────────────────────────────────
  content.push({
    table: {
      widths: ['*'],
      body: [[{
        text: [{ text: 'Automated audit only — ', bold: true }, DISCLAIMER_TEXT],
        fillColor: '#fff7ed', color: '#7c2d12', margin: [10, 8, 10, 8], fontSize: 9
      }]]
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 14]
  });

  // ── Summary table ─────────────────────────────────────────────────────────────
  const altFail      = imageReports.some(r => !r.hasAlt) && !post.hasImageDescInText;
  const altNA        = imageReports.length === 0;
  const contrastFail = imageReports.some(r => r.report?.verdict === 'FAIL');
  const contrastNA   = imageReports.length === 0 ||
    imageReports.every(r => !r.report || r.report.verdict === 'NO_TEXT' || r.error);
  const overallFail  = altFail || post.fontResult?.found || contrastFail;
  const overallFlag  = !overallFail && post.emojiResult?.flag;
  const overallStyle = overallFail ? 'fail' : overallFlag ? 'flag' : 'pass';

  content.push({ text: 'Summary', style: 'h2', margin: [0, 6, 0, 6] });
  content.push({
    table: {
      headerRows: 1,
      widths: ['*', 'auto'],
      body: [
        [{ text: 'Check', style: 'th' }, { text: 'Result', style: 'th' }],
        ['Emoji usage',        post.emojiResult?.flag
          ? { text: `FLAG — ${post.emojiResult.count} emoji`, style: 'flag' }
          : { text: `PASS — ${post.emojiResult?.count ?? 0} emoji`, style: 'pass' }],
        ['Non-standard fonts', post.fontResult?.found
          ? { text: `FAIL — ${post.fontResult.count} characters`, style: 'fail' }
          : { text: 'PASS', style: 'pass' }],
        ['Image alt text',     altNA  ? { text: 'N/A',  style: 'neutral' }
          : altFail             ? { text: 'FAIL', style: 'fail' }
          :                       { text: 'PASS', style: 'pass' }],
        ['Image contrast',     contrastNA ? { text: 'N/A',  style: 'neutral' }
          : contrastFail        ? { text: 'FAIL', style: 'fail' }
          :                       { text: 'PASS', style: 'pass' }],
        ['Overall',            { text: overallFail ? 'FAIL' : overallFlag ? 'FLAG' : 'PASS', style: overallStyle, bold: true }],
      ]
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 12]
  });

  // ── Emoji section ──────────────────────────────────────────────────────────────
  content.push({ text: '1. Emoji usage', style: 'h2' });
  if (post.emojiResult?.flag) {
    content.push({ text: `FLAG — ${post.emojiResult.count} emoji found (threshold: more than 5).`, style: 'flag' });
    if (post.emojiResult.examples?.length) {
      content.push({ text: `Examples: ${post.emojiResult.examples.join(' ')}`, margin: [0, 2, 0, 8] });
    }
  } else {
    content.push({ text: `PASS — ${post.emojiResult?.count ?? 0} emoji found.`, style: 'pass', margin: [0, 0, 0, 8] });
  }

  // ── Fonts section ──────────────────────────────────────────────────────────────
  content.push({ text: '2. Non-standard Unicode fonts', style: 'h2' });
  if (post.fontResult?.found) {
    content.push({ text: `FAIL — ${post.fontResult.count} Unicode mathematical character(s) used as decorative text. These are invisible to screen readers.`, style: 'fail' });
    if (post.fontResult.examples?.length) {
      content.push({ text: `Examples: ${post.fontResult.examples.join(' ')}`, margin: [0, 2, 0, 8] });
    }
  } else {
    content.push({ text: 'PASS — No non-standard font characters detected.', style: 'pass', margin: [0, 0, 0, 8] });
  }

  // ── Alt text section ──────────────────────────────────────────────────────────
  content.push({ text: '3. Image alt text', style: 'h2' });
  if (imageReports.length === 0) {
    content.push({ text: 'No media images found in this post.', margin: [0, 0, 0, 8] });
  } else {
    const altBody = [[{ text: 'Image', style: 'th' }, { text: 'Result', style: 'th' }]];
    for (const r of imageReports) {
      let detail;
      if (r.hasAlt)                     detail = { text: `PASS — "${(r.alt || '').slice(0, 80)}"`, style: 'pass' };
      else if (r.isPlaceholder)         detail = { text: 'FAIL — LinkedIn placeholder alt text', style: 'fail' };
      else if (post.hasImageDescInText) detail = { text: 'NOTE — description found in post text', style: 'flag' };
      else                              detail = { text: 'FAIL — no alt text', style: 'fail' };
      altBody.push([r.filename, detail]);
    }
    content.push({
      table: { headerRows: 1, widths: ['*', 'auto'], body: altBody },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 12]
    });
  }

  // ── Contrast section ──────────────────────────────────────────────────────────
  content.push({ text: '4. Image colour contrast', style: 'h2' });

  if (imageReports.length === 0) {
    content.push({ text: 'No media images to analyse.', margin: [0, 0, 0, 8] });
  } else {
    for (const r of imageReports) {
      content.push({ text: r.filename, style: 'h3', pageBreak: content.length > 20 ? 'before' : undefined });

      if (r.dataUrl) {
        content.push({ image: r.dataUrl, width: 420, margin: [0, 6, 0, 8] });
      }

      if (r.error) {
        content.push({ text: `Error: ${r.error}`, style: 'fail', margin: [0, 0, 0, 8] });
        continue;
      }
      if (!r.report || r.report.verdict === 'NO_TEXT') {
        content.push({ text: '— No colour contrast data could be extracted from this image.', style: 'neutral', margin: [0, 0, 0, 8] });
        continue;
      }

      content.push({
        text: [
          { text: 'Result: ', bold: true },
          { text: verdictLabel(r.report.verdict) + ' — ', style: r.report.verdict === 'PASS' ? 'pass' : 'fail' },
          r.report.detail || ''
        ],
        margin: [0, 0, 0, 10]
      });

      if (r.report.colourPairs?.length) {
        content.push({ text: 'Colour combinations detected', style: 'h3', margin: [0, 6, 0, 4] });

        // Background before Foreground — matches sister project column order
        const pairBody = [[
          { text: 'Swatch',     style: 'th' },
          { text: 'Background', style: 'th' },
          { text: 'Foreground', style: 'th' },
          { text: 'Ratio',      style: 'th' },
          { text: 'AA',         style: 'th' },
          { text: 'AAA',        style: 'th' },
          { text: 'Check',      style: 'th' },
          { text: 'Examples',   style: 'th' },
        ]];

        for (const p of r.report.colourPairs) {
          const swatchUrl = p.swatchDataUrl || makeSwatch(p.fgHex, p.bgHex).dataUrl;
          const webaim = `https://webaim.org/resources/contrastchecker/?fcolor=${p.fgHex.slice(1)}&bcolor=${p.bgHex.slice(1)}`;
          pairBody.push([
            { image: swatchUrl, width: 60, height: 15 },
            p.bgHex,
            p.fgHex,
            `${p.contrast.toFixed(2)}:1`,
            { text: p.pass    ? '✓' : '✗', style: p.pass    ? 'pass' : 'fail' },
            { text: p.passAaa ? '✓' : '✗', style: p.passAaa ? 'pass' : 'fail' },
            { text: 'WebAIM ↗', link: webaim, style: 'link' },
            { text: p.examples.map(e => `"${e}"`).join(', '), style: 'examples' },
          ]);
        }

        content.push({
          table: { headerRows: 1, widths: [60, 'auto', 'auto', 'auto', 20, 20, 'auto', '*'], body: pairBody },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 10]
        });

        const failing = r.report.colourPairs.filter(p => !p.pass);
        if (failing.length) {
          content.push({ text: 'Failing regions', style: 'h3', margin: [0, 8, 0, 4] });
          for (const p of failing) {
            content.push({
              text: `Background ${p.bgHex} / Foreground ${p.fgHex} — ${p.contrast.toFixed(2)}:1`,
              style: 'clipHeading',
              margin: [0, 6, 0, 4]
            });
            if (p.clipDataUrl) {
              content.push({ image: p.clipDataUrl, width: 420, margin: [0, 0, 0, 8] });
            }
          }
        }
      }
    }

    content.push({ text: THRESHOLDS_FOOTER, style: 'footer', italics: true, margin: [0, 16, 0, 4] });
  }

  return {
    content,
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.3 },
    pageMargins: [40, 50, 40, 50],
    styles: {
      h1:          { fontSize: 18, bold: true, margin: [0, 0, 0, 4] },
      h2:          { fontSize: 13, bold: true, margin: [0, 10, 0, 5] },
      h3:          { fontSize: 11, bold: true, margin: [0, 6, 0, 3] },
      th:          { bold: true, fillColor: '#f3f4f6' },
      pass:        { color: '#14532d', bold: true },
      fail:        { color: '#7f1d1d', bold: true },
      flag:        { color: '#7c2d12', bold: true },
      neutral:     { color: '#4b5563' },
      metaLabel:   { bold: true, fontSize: 9, color: '#4b5563' },
      metaValue:   { fontSize: 9 },
      timestamp:   { fontSize: 9, color: '#4b5563' },
      examples:    { italics: true, color: '#374151', fontSize: 8 },
      link:        { color: '#1d4ed8', decoration: 'underline', fontSize: 9 },
      clipHeading: { bold: true, fontSize: 9 },
      footer:      { fontSize: 9, color: '#4b5563' },
    }
  };
}

export async function buildPdf(post, imageReports, timestamp) {
  const pdfMake = await loadPdfMake();
  const docDef = buildDocDefinition(post, imageReports, timestamp);
  return new Promise((resolve, reject) => {
    try {
      pdfMake.createPdf(docDef).getBlob(resolve);
    } catch (err) {
      reject(err);
    }
  });
}
