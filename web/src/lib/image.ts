/**
 * Shrinks a photo to fit within `max` x `max` (keeping aspect) and re-encodes it as JPEG.
 * Used for avatars: a 12 MP phone photo becomes ~60 KB. Images already small enough are still
 * re-encoded, which also strips EXIF (location) data.
 */
export async function resizeImage(file: File, max = 512, quality = 0.88): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't resize images.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Couldn't process that image. Try another one.");
  return blob;
}
