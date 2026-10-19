import { useEffect } from "react";

/**
 * Powers the `table-stack` class (see index.css): below the md breakpoint a
 * table with that class turns every row into a stacked card, and each cell
 * shows its column name above its value. CSS can only print a label from an
 * attribute, so this copies each header's text onto the matching cell as
 * `data-label`.
 *
 * It's done in the DOM rather than per-table so a table only needs the class
 * to opt in, however its cells are rendered. Only `data-label` is written
 * (never children), so React's own updates are unaffected, and only child-list
 * changes are observed, so writing the attribute can't re-trigger it.
 *
 * Cells spanning several columns (expanded detail rows, empty states) get no
 * label and render full width.
 */
function labelStackedTables() {
  document
    .querySelectorAll<HTMLTableElement>("table.table-stack")
    .forEach((table) => {
      const labels: string[] = [];
      table
        .querySelectorAll(":scope > thead > tr:last-child > th")
        .forEach((th) => {
          // Drop trailing hints like "Progress (Click to add new)".
          const text = (th.textContent ?? "")
            .replace(/\s+/g, " ")
            .replace(/\s*\(.*\)\s*$/, "")
            .trim();
          const span = (th as HTMLTableCellElement).colSpan || 1;
          for (let i = 0; i < span; i++) labels.push(text);
        });

      table.querySelectorAll(":scope > tbody > tr").forEach((tr) => {
        let col = 0;
        for (const cell of Array.from(tr.children) as HTMLTableCellElement[]) {
          const span = cell.colSpan || 1;
          if (span === 1 && labels[col]) {
            if (cell.getAttribute("data-label") !== labels[col]) {
              cell.setAttribute("data-label", labels[col]);
            }
          } else if (cell.hasAttribute("data-label")) {
            cell.removeAttribute("data-label");
          }
          col += span;
        }
      });
    });
}

export function useStackedTables() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(labelStackedTables);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
}
