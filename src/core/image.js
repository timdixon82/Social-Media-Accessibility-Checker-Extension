/**
 * Image decode and resize utilities.
 *
 * Normalises any Blob/File to a long-edge range of 800–1400 px before
 * analysis. Staying inside this window keeps OCR accuracy high while
 * bounding memory use.
 *
 * @module core/image
 */

const MIN_LONG_EDGE = 800;
const MAX_LONG_EDGE = 1400;

/**
 * Compute the output dimensions that bring an image into the target range.
 *
 * @param {number} width
 * @param {number} height
 * @returns {{ width: number, height: number, scale: number }}
 */
export function targetSize(width, height) {
  const long = Math.max(width, height);
  let scale = 1;
  if (long < MIN_LONG_EDGE) scale = MIN_LONG_EDGE / long;
  else if (long > MAX_LONG_EDGE) scale = MAX_LONG_EDGE / long;
  return {
    width:  Math.max(1, Math.round(width  * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale
  };
}

/**
 * Decode a Blob/File into a colour-management-off ImageBitmap at the
 * canonical long-edge target size. The heavy work is handled by the
 * browser's native decoder, which runs off the main thread where supported.
 *
 * @param {Blob|File} blob
 * @returns {Promise<ImageBitmap>}
 */
export async function decodeAndResize(blob) {
  const probe = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
  const { width, height } = probe;
  const t = targetSize(width, height);

  if (t.scale === 1) return probe;

  probe.close?.();
  return createImageBitmap(blob, {
    resizeWidth:   t.width,
    resizeHeight:  t.height,
    resizeQuality: 'high',
    colorSpaceConversion: 'none'
  });
}

/**
 * Draw an ImageBitmap onto a canvas and extract its sRGB ImageData.
 * Uses OffscreenCanvas when available (worker-compatible).
 *
 * @param {ImageBitmap} bitmap
 * @returns {{ canvas: OffscreenCanvas|HTMLCanvasElement, ctx: CanvasRenderingContext2D, imageData: ImageData }}
 */
export function bitmapToImageData(bitmap) {
  const canvas = (typeof OffscreenCanvas !== 'undefined')
    ? new OffscreenCanvas(bitmap.width, bitmap.height)
    : Object.assign(document.createElement('canvas'), {
        width: bitmap.width, height: bitmap.height
      });
  const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { canvas, ctx, imageData };
}
