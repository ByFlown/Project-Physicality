/** Photo intake: validation, EXIF-aware decoding and downscaling for analysis. */

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
const MAX_HEIGHT = 1280;

export interface LoadedPhoto {
  /** Downscaled, correctly oriented image used for detection and display. */
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Object URL of a JPEG rendition, for display. Revoke with `releasePhoto`. */
  url: string;
  blob: Blob;
}

async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Fall through to <img>, which some browsers decode more formats with.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the photo.'))), 'image/jpeg', quality),
  );
}

export async function loadPhoto(file: File): Promise<LoadedPhoto> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file (JPEG, PNG or WebP).');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('That photo is larger than 25 MB. Please use a smaller one.');
  let source: CanvasImageSource & { width: number; height: number };
  try {
    source = await decode(file);
  } catch {
    throw new Error('This image format is not supported by your browser. Try a JPEG or PNG.');
  }
  const scale = Math.min(1, MAX_HEIGHT / source.height);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser cannot process images (canvas unavailable).');
  ctx.drawImage(source, 0, 0, width, height);
  if ('close' in source && typeof source.close === 'function') source.close();
  const blob = await toBlob(canvas);
  return { canvas, width, height, blob, url: URL.createObjectURL(blob) };
}

export function releasePhoto(photo: LoadedPhoto | null | undefined) {
  if (photo) URL.revokeObjectURL(photo.url);
}
