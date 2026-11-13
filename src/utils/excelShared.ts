/** Helpers shared by the Excel exports (BASTP, invoice). */

// The company header/footer images the printed documents use (public/images).
// Returns null if one can't be loaded, so an export still works without it.
export async function loadImage(
  path: string,
): Promise<{ base64: string; width: number; height: number } | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const size = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const img = new Image();
        img.onload = () =>
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = reject;
        img.src = base64;
      },
    );
    return { base64, ...size };
  } catch {
    return null;
  }
}

/** Saves a built workbook as a .xlsx download. */
export function downloadXlsx(buffer: Uint8Array, fileName: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
