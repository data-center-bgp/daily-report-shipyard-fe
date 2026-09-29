import { supabase } from "../lib/supabase";

const BUCKET = "shipyard_signatures";
export const COMPANY_STAMP = "STEMPEL BAROKAH GALANGAN PERKASA";

// Crops the empty transparent margin around the ink. Uploaded files carry
// very different amounts of padding, which otherwise makes some signatures
// print much smaller than others in the same fixed-size slot.
function trimTransparentEdges(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0);
      const { data, width, height } = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );

      let minX = width, minY = height, maxX = -1, maxY = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] > 20) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return resolve(dataUrl);

      const pad = 2;
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(width - 1, maxX + pad);
      maxY = Math.min(height - 1, maxY + pad);

      const out = document.createElement("canvas");
      out.width = maxX - minX + 1;
      out.height = maxY - minY + 1;
      out
        .getContext("2d")!
        .drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
      resolve(out.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Keyed by file name without extension. Caches the promise, so opening
// several print previews downloads each file only once per session.
const cache = new Map<string, Promise<string | null>>();

// Returns the image as a data URL (not a storage URL) so both the browser
// print and the html2canvas PDF download can embed it without cross-origin
// canvas issues. Resolves to null when there's no file for that name —
// the slot then stays blank to sign by hand.
export function loadSignature(name: string | null | undefined) {
  const key = name?.trim();
  if (!key) return Promise.resolve(null);

  let pending = cache.get(key);
  if (!pending) {
    pending = supabase.storage
      .from(BUCKET)
      .download(`${key}.png`)
      .then(({ data, error }) => {
        if (error || !data) return null;
        return new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () =>
            trimTransparentEdges(reader.result as string).then(resolve);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(data);
        });
      });
    // A failed lookup (e.g. offline) shouldn't be cached forever.
    pending.then((url) => {
      if (!url) cache.delete(key);
    });
    cache.set(key, pending);
  }
  return pending;
}
