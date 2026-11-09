/**
 * Turns a rendered document (a print preview element) into an A4 PDF.
 *
 * The element is photographed once and cut into pages. Cutting every fixed
 * height slices table rows and the signature block in half, so the cuts are
 * chosen instead: a page ends at the bottom of the last row that still fits,
 * and blocks marked `data-pdf-keep="<group>"` (the closing note, date and
 * signatures) are never split — the whole group moves to the next page
 * instead. The company header/footer images appear once, as in the on-screen
 * document (no repeated header/footer per page).
 */

export interface PageBreakInput {
  /** Y positions (px, same unit as the other values) where a page may end. */
  candidates: number[];
  /** [top, bottom] ranges that a page must not end inside. */
  keepRanges: [number, number][];
  totalHeight: number;
  pageHeight: number;
}

/**
 * Where each page starts, as a list of Y offsets (the first is always 0).
 * A page takes as much as fits, ending at the latest allowed candidate;
 * when nothing suitable exists (one row taller than a page) it is cut at the
 * page height, same as before.
 */
export function computePageStarts({
  candidates,
  keepRanges,
  totalHeight,
  pageHeight,
}: PageBreakInput): number[] {
  const sorted = [...new Set(candidates)].sort((a, b) => a - b);
  const insideKeep = (y: number) =>
    keepRanges.some(([top, bottom]) => y > top && y < bottom);
  // A cut that leaves almost nothing on the page is worse than a mid-row one.
  const minSlice = pageHeight * 0.3;

  const starts = [0];
  let start = 0;
  while (totalHeight - start > pageHeight) {
    const limit = start + pageHeight;
    let cut = limit;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const c = sorted[i];
      if (c > limit) continue;
      if (c <= start + minSlice) break;
      if (insideKeep(c)) continue;
      cut = c;
      break;
    }
    // A keep block that starts on this page but would be cut at the limit
    // moves whole to the next page.
    if (cut === limit) {
      const spanning = keepRanges
        .filter(([top, bottom]) => top > start + minSlice && top < limit && bottom > limit)
        .map(([top]) => top)
        .sort((a, b) => b - a)[0];
      if (spanning !== undefined) cut = spanning;
    }
    starts.push(cut);
    start = cut;
  }
  return starts;
}

/** Reads the safe cut points and keep-together blocks off the rendered DOM. */
function measureBreaks(root: HTMLElement) {
  const rootTop = root.getBoundingClientRect().top;
  const y = (el: Element) => el.getBoundingClientRect().bottom - rootTop;

  const candidates: number[] = [];
  // Leaf rows only: the layout wraps every section in an outer table row, and
  // those wrappers are not rows anyone should cut between.
  root.querySelectorAll("tbody tr").forEach((tr) => {
    if (!tr.querySelector("tr")) candidates.push(y(tr));
  });
  root.querySelectorAll(".section-block").forEach((el) => {
    candidates.push(y(el));
  });

  const groups = new Map<string, [number, number]>();
  root.querySelectorAll<HTMLElement>("[data-pdf-keep]").forEach((el) => {
    const group = el.dataset.pdfKeep ?? "";
    const top = el.getBoundingClientRect().top - rootTop;
    const bottom = y(el);
    const range = groups.get(group);
    groups.set(
      group,
      range ? [Math.min(range[0], top), Math.max(range[1], bottom)] : [top, bottom],
    );
  });

  return { candidates, keepRanges: [...groups.values()] };
}

export async function downloadElementAsPdf(
  root: HTMLElement,
  filename: string,
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  // Measured on the copy html2canvas actually renders (onclone), not on the
  // live page: the two can differ by a few pixels per page, which would put a
  // cut a few pixels inside the row it was meant to avoid.
  let measured: ReturnType<typeof measureBreaks> | null = null;
  let measuredWidthPx = root.getBoundingClientRect().width;
  const canvas = await html2canvas(root, {
    scale: 2,
    useCORS: true,
    onclone: (_doc, clonedRoot) => {
      measuredWidthPx = clonedRoot.getBoundingClientRect().width;
      measured = measureBreaks(clonedRoot);
    },
  });
  const { candidates, keepRanges } = measured ?? measureBreaks(root);
  const toCanvasPx = canvas.width / measuredWidthPx;

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const marginMm = 10;
  const usableWidthMm = pageWidthMm - marginMm * 2;
  const usableHeightMm = pageHeightMm - marginMm * 2;
  const pxPerMm = canvas.width / usableWidthMm;
  const pageHeightPx = usableHeightMm * pxPerMm;

  const starts = computePageStarts({
    candidates: candidates.map((c) => c * toCanvasPx),
    keepRanges: keepRanges.map(
      ([top, bottom]) => [top * toCanvasPx, bottom * toCanvasPx] as [number, number],
    ),
    totalHeight: canvas.height,
    pageHeight: pageHeightPx,
  });

  starts.forEach((startPx, i) => {
    const endPx = i + 1 < starts.length ? starts[i + 1] : canvas.height;
    const sliceHeightPx = Math.round(endPx - startPx);

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeightPx;
    const ctx = pageCanvas.getContext("2d");
    if (!ctx) throw new Error("Could not create canvas context");
    ctx.drawImage(
      canvas,
      0,
      Math.round(startPx),
      canvas.width,
      sliceHeightPx,
      0,
      0,
      canvas.width,
      sliceHeightPx,
    );

    if (i > 0) pdf.addPage();
    pdf.addImage(
      pageCanvas.toDataURL("image/jpeg", 0.98),
      "JPEG",
      marginMm,
      marginMm,
      usableWidthMm,
      sliceHeightPx / pxPerMm,
    );
  });

  pdf.save(filename);
}
