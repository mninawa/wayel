/** Max presigned PUT / ticket size for phone HD video on report-style scopes. */
export const MEDIA_SCOPE_MAX_RAW_BYTES = 100 * 1024 * 1024;

/** Target ceiling for compressed raster photos (JPEG output). */
export const MEDIA_IMAGE_TARGET_MAX_BYTES = 10 * 1024 * 1024;

function formatMaxMb(): string {
  return `${MEDIA_SCOPE_MAX_RAW_BYTES / (1024 * 1024)} MB`;
}

/**
 * Returns a JPEG-backed file at or below `maxBytes` when possible, or the
 * original file if the image cannot be decoded (e.g. exotic HEIC) or is
 * already small enough and not oversized in pixels.
 *
 * Skips SVG (vector) and non-raster types.
 */
export async function compressRasterImageForUpload(
  file: File,
  maxBytes: number = MEDIA_IMAGE_TARGET_MAX_BYTES,
): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return file;
  }
  // Animated GIF → keep as-is unless over budget (conversion would drop frames).
  if (file.type === 'image/gif' && file.size <= maxBytes) {
    return file;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const longSide = Math.max(bitmap.width, bitmap.height);
    if (file.size <= maxBytes && longSide <= 3000) {
      return file;
    }

    let maxSide = Math.min(3840, longSide);
    let quality = 0.9;

    for (let attempt = 0; attempt < 28; attempt++) {
      const { canvas } = fitCanvas(bitmap, maxSide);
      const blob = await canvasToJpegBlob(canvas, quality);
      if (blob && blob.size <= maxBytes) {
        const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
        return new File([blob], `${base}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });
      }
      quality -= 0.07;
      if (quality < 0.45) {
        quality = 0.88;
        maxSide = Math.floor(maxSide * 0.82);
        if (maxSide < 640) {
          break;
        }
      }
    }
    return file;
  } finally {
    bitmap.close();
  }
}

function fitCanvas(
  bitmap: ImageBitmap,
  maxSide: number,
): { canvas: HTMLCanvasElement; w: number; h: number } {
  const w0 = bitmap.width;
  const h0 = bitmap.height;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not acquire canvas context.');
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  return { canvas, w, h };
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', Math.min(1, Math.max(0.4, quality))),
  );
}

/**
 * Validates raw size then normalises raster images for scopes that accept
 * report-style media. Throws a user-visible message when over budget.
 */
export async function prepareFileForScopedMediaUpload(
  file: File,
  scope: string,
): Promise<File> {
  const s = scope.trim().toLowerCase();
  if (s !== 'daily-reports' && s !== 'memories' && s !== 'documents') {
    return file;
  }
  if (file.size > MEDIA_SCOPE_MAX_RAW_BYTES) {
    throw new Error(
      `Files must be ${formatMaxMb()} or smaller — pick a shorter clip or lower camera quality.`,
    );
  }
  if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
    return compressRasterImageForUpload(file, MEDIA_IMAGE_TARGET_MAX_BYTES);
  }
  return file;
}
