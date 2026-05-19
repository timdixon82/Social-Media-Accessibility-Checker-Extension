#!/usr/bin/env python3
"""
WCAG 2.2 AA image contrast analyser.

Usage: python3 analyse_contrast.py <image_path> [output_dir]
Output: JSON to stdout.

Pipeline:
  1. PaddleOCR (PP-OCRv5 mobile) detects and reads text regions as polygons.
  2. Each polygon is converted to an axis-aligned bounding box; the box is
     split into vertical strips ~one character wide and the strip with the
     WORST (lowest) contrast ratio is used — catching gradient backgrounds
     where contrast degrades across a word.
  3. Per strip: k-means (k=2) on luminance splits pixels into fg/bg.
     Text = the MINORITY cluster (less area), background = the majority.
  4. Similar colour pairs are merged; swatch and clip images are written
     to output_dir when supplied.
"""

import sys
import json
import math
import os
import numpy as np
from PIL import Image, ImageDraw

# Suppress PaddleOCR connectivity checks and noisy ccache warnings
os.environ.setdefault('PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK', 'True')


# ---------------------------------------------------------------------------
# WCAG colour math
# ---------------------------------------------------------------------------

def _linearise(ch: np.ndarray) -> np.ndarray:
    c = ch / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def luminance_map(rgb: np.ndarray) -> np.ndarray:
    return (0.2126 * _linearise(rgb[:, :, 0].astype(float))
            + 0.7152 * _linearise(rgb[:, :, 1].astype(float))
            + 0.0722 * _linearise(rgb[:, :, 2].astype(float)))


def wcag_contrast(l1: float, l2: float) -> float:
    lighter, darker = max(l1, l2), min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def hex_to_rgb(h: str) -> tuple:
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def rgb_to_hex(rgb: np.ndarray) -> str:
    r, g, b = (int(round(float(v))) for v in rgb)
    return '#{:02X}{:02X}{:02X}'.format(
        max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))


def colour_distance(h1: str, h2: str) -> float:
    r1, g1, b1 = hex_to_rgb(h1)
    r2, g2, b2 = hex_to_rgb(h2)
    return math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2)


# ---------------------------------------------------------------------------
# PaddleOCR — lazy singleton
# ---------------------------------------------------------------------------

_paddle_ocr = None


def _get_ocr():
    global _paddle_ocr
    if _paddle_ocr is None:
        import warnings
        warnings.filterwarnings('ignore')
        from paddleocr import PaddleOCR
        _paddle_ocr = PaddleOCR(
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            text_detection_model_name='PP-OCRv5_mobile_det',
            text_recognition_model_name='en_PP-OCRv5_mobile_rec',
        )
    return _paddle_ocr


def run_ocr(img: Image.Image) -> list[dict]:
    """
    Run PaddleOCR on a PIL Image and return a list of detection dicts with
    keys: text, conf (0–100 int), left, top, width, height.

    Confidence thresholds mirror the old Tesseract logic:
      - ≥ 6 alphanumeric chars: accept at conf ≥ 25  (scene text with degraded contrast)
      - 2–5 alphanumeric chars: accept at conf ≥ 50
    """
    ocr = _get_ocr()
    img_arr = np.array(img)
    result = ocr.predict(img_arr)
    if not result or result[0] is None:
        return []

    r = result[0]
    detections = []
    for text, score, poly in zip(r['rec_texts'], r['rec_scores'], r['dt_polys']):
        text = (text or '').strip()
        alnum = sum(c.isalnum() for c in text)
        if len(text) < 2 or alnum < 2:
            continue
        min_conf = 25 if alnum >= 6 else 50
        if int(score * 100) < min_conf:
            continue
        pts = np.array(poly)
        x = int(pts[:, 0].min())
        y = int(pts[:, 1].min())
        w = int(pts[:, 0].max() - pts[:, 0].min())
        h = int(pts[:, 1].max() - pts[:, 1].min())
        if w < 4 or h < 4:
            continue
        detections.append({
            'text':   text,
            'conf':   int(score * 100),
            'left':   x,
            'top':    y,
            'width':  w,
            'height': h,
        })
    return detections


# ---------------------------------------------------------------------------
# K-means (k=2) on 1-D luminance values
# ---------------------------------------------------------------------------

def kmeans2(values: np.ndarray, max_iter: int = 60):
    if values.size < 4:
        return None, None
    sv = np.sort(values)
    n  = len(sv)
    c  = np.array([sv[int(n * 0.25)], sv[int(n * 0.75)]], dtype=float)
    for _ in range(max_iter):
        labels = (np.abs(values - c[1]) < np.abs(values - c[0])).astype(np.uint8)
        new_c  = np.array([
            values[labels == 0].mean() if np.any(labels == 0) else c[0],
            values[labels == 1].mean() if np.any(labels == 1) else c[1],
        ])
        if np.allclose(c, new_c, atol=1e-7):
            break
        c = new_c
    if c[0] > c[1]:
        labels, c = 1 - labels, c[::-1]
    return labels, c        # c[0] = dark cluster, c[1] = light cluster


# ---------------------------------------------------------------------------
# Per-region contrast — text = minority cluster
# ---------------------------------------------------------------------------

def region_contrast(img_arr: np.ndarray, x: int, y: int, w: int, h: int):
    """Returns (ratio, fg_hex, bg_hex) or None."""
    ih, iw = img_arr.shape[:2]
    x1, y1 = max(0, x - 2), max(0, y - 2)
    x2, y2 = min(iw, x + w + 2), min(ih, y + h + 2)
    if x2 - x1 < 4 or y2 - y1 < 4:
        return None

    region = img_arr[y1:y2, x1:x2]
    lum    = luminance_map(region)
    labels, lum_c = kmeans2(lum.flatten())
    if lum_c is None:
        return None

    pixels = region.reshape(-1, 3).astype(float)
    n0 = int(np.sum(labels == 0))
    n1 = int(np.sum(labels == 1))

    # Text = minority cluster; background = majority cluster
    if n0 <= n1:
        fg_idx, bg_idx = 0, 1
    else:
        fg_idx, bg_idx = 1, 0

    fg_rgb = pixels[labels == fg_idx].mean(axis=0)
    bg_rgb = pixels[labels == bg_idx].mean(axis=0)

    lum_fg = float(luminance_map(fg_rgb.reshape(1, 1, 3))[0, 0])
    lum_bg = float(luminance_map(bg_rgb.reshape(1, 1, 3))[0, 0])

    return float(wcag_contrast(lum_fg, lum_bg)), rgb_to_hex(fg_rgb), rgb_to_hex(bg_rgb)


def worst_strip_contrast(img_arr: np.ndarray, x: int, y: int, w: int, h: int):
    """
    Split the word bounding box into vertical strips roughly one character wide
    and return the strip with the WORST (lowest) contrast ratio.

    This catches gradient backgrounds where contrast degrades across a word —
    e.g. white text that starts on dark and ends on mid-grey, where a whole-box
    k-means would average to an acceptable result despite the trailing letters
    being below threshold.

    Strip width heuristic: ~75% of the box height (typical letter aspect ratio).
    Minimum 3 strips for any word box; each strip must be at least 6 px wide to
    give k-means enough pixels to work with.
    """
    strip_w = max(6, int(h * 0.75))
    n_strips = max(3, round(w / strip_w))
    actual_strip_w = w / n_strips

    strip_results = []
    for i in range(n_strips):
        sx = x + int(round(i * actual_strip_w))
        sw = max(6, int(round(actual_strip_w)))
        r = region_contrast(img_arr, sx, y, sw, h)
        if r is not None:
            strip_results.append(r)

    if not strip_results:
        return region_contrast(img_arr, x, y, w, h)

    return min(strip_results, key=lambda r: r[0])


# ---------------------------------------------------------------------------
# Image generation helpers
# ---------------------------------------------------------------------------

def make_swatch(fg_hex: str, bg_hex: str, path: str, w: int = 80, h: int = 20):
    """Side-by-side tile: left = background, right = foreground (text colour)."""
    arr = np.zeros((h, w, 3), dtype=np.uint8)
    arr[:, :w//2] = hex_to_rgb(bg_hex)
    arr[:, w//2:] = hex_to_rgb(fg_hex)
    arr[:, w//2-1:w//2+1] = (200, 200, 200)
    Image.fromarray(arr).save(path)


def make_clip(img_arr: np.ndarray, bboxes: list, path: str, padding: int = 32):
    """Crop union of bboxes with padding; draw red outlines on each box."""
    if not bboxes:
        return
    ih, iw = img_arr.shape[:2]
    cx1 = max(0,  min(b[0]        for b in bboxes) - padding)
    cy1 = max(0,  min(b[1]        for b in bboxes) - padding)
    cx2 = min(iw, max(b[0] + b[2] for b in bboxes) + padding)
    cy2 = min(ih, max(b[1] + b[3] for b in bboxes) + padding)

    clip = Image.fromarray(img_arr[cy1:cy2, cx1:cx2]).convert('RGB')
    draw = ImageDraw.Draw(clip)
    for bx, by, bw, bh in bboxes:
        draw.rectangle(
            [bx - cx1, by - cy1, bx - cx1 + bw, by - cy1 + bh],
            outline=(220, 38, 38), width=2,
        )
    clip.save(path)


# ---------------------------------------------------------------------------
# Colour-pair aggregation with similarity merging
# ---------------------------------------------------------------------------

def build_colour_pairs(findings: list, threshold: float = 25.0) -> list:
    pairs: list[dict] = []
    for f in findings:
        merged = False
        for p in pairs:
            if (colour_distance(f['fg_hex'], p['fg_hex']) < threshold and
                    colour_distance(f['bg_hex'], p['bg_hex']) < threshold):
                if f['contrast_ratio'] < p['contrast_ratio']:
                    p.update({k: f[k] for k in
                               ('contrast_ratio', 'fg_hex', 'bg_hex', 'pass', 'pass_aaa', 'required_aaa')})
                p['examples'].append(f['text'])
                p['bboxes'].append(f['bbox'])
                merged = True
                break
        if not merged:
            pairs.append({
                'fg_hex':         f['fg_hex'],
                'bg_hex':         f['bg_hex'],
                'contrast_ratio': f['contrast_ratio'],
                'pass':           f['pass'],
                'required':       f['required'],
                'pass_aaa':       f['pass_aaa'],
                'required_aaa':   f['required_aaa'],
                'examples':       [f['text']],
                'bboxes':         [f['bbox']],
            })

    for p in pairs:
        p['examples'] = list(dict.fromkeys(p['examples']))[:6]

    return sorted(pairs, key=lambda p: p['contrast_ratio'])


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def analyse(image_path: str, output_dir: str | None = None) -> dict:
    img = Image.open(image_path).convert('RGB')

    # Upscale small images — helps OCR accuracy
    min_dim = 800
    ow, oh  = img.size
    if max(ow, oh) < min_dim:
        scale = min_dim / max(ow, oh)
        img   = img.resize((int(ow * scale), int(oh * scale)), Image.LANCZOS)

    # Cap very large images for speed
    max_dim = 1400
    ow, oh  = img.size
    if max(ow, oh) > max_dim:
        scale = max_dim / max(ow, oh)
        img   = img.resize((int(ow * scale), int(oh * scale)), Image.LANCZOS)

    img_arr = np.array(img)

    detections = run_ocr(img)

    findings = []
    for det in detections:
        result = worst_strip_contrast(img_arr, det['left'], det['top'], det['width'], det['height'])
        if result is None:
            continue
        cr, fg_hex, bg_hex = result

        is_large     = det['height'] >= 24
        required     = 3.0 if is_large else 4.5
        required_aaa = 4.5 if is_large else 7.0

        findings.append({
            'text':           det['text'],
            'contrast_ratio': round(cr, 2),
            'fg_hex':         fg_hex,
            'bg_hex':         bg_hex,
            'large_text':     bool(is_large),
            'required':       float(required),
            'pass':           bool(cr >= required),
            'required_aaa':   float(required_aaa),
            'pass_aaa':       bool(cr >= required_aaa),
            'bbox':           [det['left'], det['top'], det['width'], det['height']],
        })

    if not findings:
        return {
            'has_text': False, 'colour_pairs': [],
            'verdict': 'NO_TEXT', 'flag': False,
            'detail': 'No text detected by OCR',
        }

    colour_pairs = build_colour_pairs(findings)
    failures     = [p for p in colour_pairs if not p['pass']]
    verdict      = 'FAIL' if failures else 'PASS'
    min_cr       = colour_pairs[0]['contrast_ratio']
    max_cr       = colour_pairs[-1]['contrast_ratio']

    if failures:
        worst  = failures[0]
        detail = (f"{len(failures)}/{len(colour_pairs)} colour combination(s) fail WCAG 2.2 AA — "
                  f"worst: {worst['fg_hex']} on {worst['bg_hex']} "
                  f"at {worst['contrast_ratio']:.1f}:1 (required {worst['required']}:1)")
    else:
        detail = (f"All {len(colour_pairs)} colour combination(s) pass "
                  f"(range {min_cr:.1f}–{max_cr:.1f}:1)")

    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        for p in colour_pairs:
            tag = f"{p['fg_hex'].lstrip('#')}_{p['bg_hex'].lstrip('#')}"
            swatch_file = f"swatch_{tag}.png"
            make_swatch(p['fg_hex'], p['bg_hex'], os.path.join(output_dir, swatch_file))
            p['swatch_file'] = swatch_file
            if not p['pass'] and p.get('bboxes'):
                clip_file = f"clip_{tag}.png"
                make_clip(img_arr, p['bboxes'], os.path.join(output_dir, clip_file))
                p['clip_file'] = clip_file

    for p in colour_pairs:
        p.pop('bboxes', None)

    return {
        'has_text':     True,
        'colour_pairs': colour_pairs,
        'verdict':      verdict,
        'flag':         verdict == 'FAIL',
        'detail':       detail,
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: analyse_contrast.py <image> [output_dir]'}))
        sys.exit(1)
    try:
        result = analyse(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)
