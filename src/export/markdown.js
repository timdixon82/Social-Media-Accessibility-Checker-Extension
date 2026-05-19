/**
 * Markdown export for LinkedIn post accessibility reports.
 * Accepts the extension's post + imageReports format.
 *
 * @module export/markdown
 */

import { DISCLAIMER_TEXT, THRESHOLDS_FOOTER } from './strings.js';

/**
 * Build the full Markdown string for a single post audit.
 *
 * @param {Object} post
 * @param {Object[]} imageReports
 * @returns {string}
 */
export function buildMarkdown(post, imageReports) {
  const displayDate = formatDate(post.date);
  const lines = [];
  lines.push(`> **Automated audit:** ${DISCLAIMER_TEXT}\n`);
  lines.push(`# ${post.author} — ${displayDate}\n`);
  lines.push(`**Author:** ${post.author}  `);
  lines.push(`**Date:** ${displayDate}  `);
  if (post.platform) lines.push(`**Platform:** ${post.platform}  `);
  if (post.postUrl) lines.push(`**URL:** [View on LinkedIn](${post.postUrl})  `);
  lines.push('');
  lines.push(post.text || '_No text content extracted_');
  const mdImages = imageReports.filter((r) => r.src);
  if (mdImages.length) {
    lines.push('');
    for (const r of mdImages) lines.push(`![${r.alt || r.filename}](${r.src})`);
  }
  lines.push('\n---\n');
  lines.push('## Summary\n');
  lines.push('| Check | Result |');
  lines.push('|-------|--------|');

  const altFail      = imageReports.some((r) => !r.hasAlt) && !post.hasImageDescInText;
  const altNA        = imageReports.length === 0;
  const contrastFail = imageReports.some((r) => r.report?.verdict === 'FAIL');
  const contrastNA   = imageReports.length === 0 ||
    imageReports.every((r) => !r.report || r.report.verdict === 'NO_TEXT' || r.error);

  lines.push(`| Emoji usage | ${post.emojiResult?.flag ? `FLAG (${post.emojiResult.count})` : `PASS (${post.emojiResult?.count ?? 0})`} |`);
  lines.push(`| Non-standard fonts | ${post.fontResult?.found ? `FAIL (${post.fontResult.count} chars)` : 'PASS'} |`);
  lines.push(`| Image alt text | ${altNA ? 'N/A' : altFail ? 'FAIL' : 'PASS'} |`);
  lines.push(`| Image contrast | ${contrastNA ? 'N/A' : contrastFail ? 'FAIL' : 'PASS'} |`);
  lines.push('\n---\n');
  lines.push('## Detail\n');

  lines.push('### 1. Emoji Usage');
  if (post.emojiResult?.flag) {
    lines.push(`- FLAG — ${post.emojiResult.count} emoji (threshold: >5)`);
    if (post.emojiResult.examples?.length) lines.push(`- Examples: ${post.emojiResult.examples.join(' ')}`);
  } else {
    lines.push(`- PASS — ${post.emojiResult?.count ?? 0} emoji`);
  }
  lines.push('');

  lines.push('### 2. Non-standard Fonts');
  if (post.fontResult?.found) {
    lines.push(`- FAIL — ${post.fontResult.count} Unicode mathematical character(s) used as decorative font (invisible to screen readers)`);
    if (post.fontResult.examples?.length) lines.push(`- Examples: ${post.fontResult.examples.join(' ')}`);
  } else {
    lines.push('- PASS — no non-standard Unicode font characters detected');
  }
  lines.push('');

  lines.push('### 3. Image Alt Text');
  if (imageReports.length === 0) {
    lines.push('- No media images found.');
  } else {
    for (const r of imageReports) {
      if (r.hasAlt)                     lines.push(`- \`${r.filename}\`: PASS — alt="${r.alt}"`);
      else if (r.isPlaceholder)         lines.push(`- \`${r.filename}\`: FAIL — LinkedIn placeholder alt, not a genuine description`);
      else if (post.hasImageDescInText) lines.push(`- \`${r.filename}\`: NOTE — no alt attribute, description found in post text`);
      else                              lines.push(`- \`${r.filename}\`: FAIL — no alt text`);
    }
  }
  lines.push('');

  lines.push('### 4. Image Colour Contrast');
  if (imageReports.length === 0) {
    lines.push('- No media images to analyse.');
  } else {
    for (const r of imageReports) {
      lines.push(`**${r.filename}**`);
      if (r.error) {
        lines.push(`- ERROR: ${r.error}`);
      } else if (!r.report || r.report.verdict === 'NO_TEXT') {
        lines.push('- No colour contrast data available');
      } else {
        lines.push(`- ${r.report.verdict} — ${r.report.detail}`);
        if (r.report.colourPairs?.length) {
          lines.push('');
          lines.push('| Foreground | Background | Ratio | AA | AAA | Examples | WebAIM |');
          lines.push('|-----------|-----------|-------|-----|-----|----------|--------|');
          for (const p of r.report.colourPairs) {
            const url = `https://webaim.org/resources/contrastchecker/?fcolor=${p.fgHex.replace('#', '')}&bcolor=${p.bgHex.replace('#', '')}`;
            lines.push(`| \`${p.fgHex}\` | \`${p.bgHex}\` | ${p.contrast.toFixed(2)}:1 | ${p.pass ? 'Pass' : 'Fail'} | ${p.passAaa ? 'Pass' : 'Fail'} | ${p.examples.join(', ')} | [Check](${url}) |`);
          }
        }
      }
      lines.push('');
    }
    lines.push(`> ${THRESHOLDS_FOOTER}`);
  }

  return lines.join('\n');
}

function formatDate(rawDate) {
  if (!rawDate) return 'Unknown date';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmt = (d) => `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const direct = new Date(rawDate);
  if (!isNaN(direct)) return fmt(direct);
  const match = rawDate.trim().match(/^(\d+)\s*(s|m|h|d|w|mo|yr)$/i);
  if (match) {
    const msPerUnit = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5, mo: 30 * 864e5, yr: 365 * 864e5 };
    const ms = msPerUnit[match[2].toLowerCase()];
    if (ms) return fmt(new Date(Date.now() - parseInt(match[1], 10) * ms)) + ' (approx.)';
  }
  return rawDate;
}
