import { useEffect, useRef } from "react";

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  label: string;
  /** Rendered inside the sheet. Receives no props: close from the outside. */
  children: React.ReactNode;
}

/**
 * Navigation drawer for narrow screens, built on a modal <dialog>.
 *
 * The browser supplies what a hand-rolled overlay has to fake: the rest of the
 * page becomes inert, focus moves into the dialog and returns to the trigger
 * on close, and Escape is handled. Swiping is native too: the sheet sits in a
 * horizontal scroll-snap scroller, so dragging it off-screen is just a scroll
 * to the "closed" stop, and an IntersectionObserver closes the dialog once the
 * sheet has left the viewport. Styles live in index.css (.mobile-drawer*).
 */
export default function MobileNavDrawer({
  open,
  onClose,
  label,
  children,
}: MobileNavDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Open and close in response to the `open` prop.
  useEffect(() => {
    const dialog = dialogRef.current;
    const scroller = scrollerRef.current;
    if (!dialog || !scroller) return;

    if (open && !dialog.open) {
      dialog.showModal();
      // showModal() would otherwise focus the scroller (a scrollable region);
      // start on the close button so Tab walks the menu in order.
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus({
        preventScroll: true,
      });
      const supportsInitialTarget = CSS.supports(
        "scroll-initial-target",
        "nearest",
      );
      if (!supportsInitialTarget) {
        // Park the sheet off-screen first, then scroll it in, so it still
        // slides in on browsers without scroll-initial-target.
        scroller.scrollTo({ left: scroller.scrollWidth, behavior: "instant" });
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            scroller.scrollTo({ left: 0, behavior: "auto" }),
          ),
        );
      } else {
        scroller.scrollTo({ left: 0, behavior: "auto" });
      }
    } else if (!open && dialog.open) {
      // Slide out; the observer below closes the dialog when it has gone.
      scroller.scrollTo({ left: scroller.scrollWidth, behavior: "auto" });
      // With reduced motion the scroll is instant and the observer may not
      // see an intermediate frame, so close directly after a beat.
      const fallback = window.setTimeout(() => {
        if (dialog.open) dialog.close();
      }, 400);
      return () => window.clearTimeout(fallback);
    }
  }, [open]);

  // Close the dialog once the sheet is fully out of view (swipe, button,
  // backdrop tap and Escape all end up here).
  useEffect(() => {
    const dialog = dialogRef.current;
    const sheet = sheetRef.current;
    if (!dialog || !sheet) return;

    const threshold = 1 / Math.max(window.innerWidth, 1);
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry.intersectionRatio < threshold && dialog.open) {
          dialog.close();
        }
      },
      { root: dialog, threshold: [threshold, 1] },
    );
    observer.observe(sheet);

    // Fires however the dialog closed, including an Escape the browser
    // would not let us intercept. Keep the parent's state in step.
    const handleClose = () => onCloseRef.current();
    dialog.addEventListener("close", handleClose);

    // Without scroll-driven animations, drive the backdrop fade by hand.
    const scroller = scrollerRef.current;
    const handleScroll = () => {
      if (!scroller) return;
      const ratio = 1 - scroller.scrollLeft / Math.max(sheet.offsetWidth, 1);
      dialog.style.setProperty(
        "--drawer-backdrop",
        String(Math.min(1, Math.max(0, ratio))),
      );
    };
    const hasTimeline = CSS.supports("animation-timeline", "scroll()");
    if (!hasTimeline) scroller?.addEventListener("scroll", handleScroll);

    return () => {
      observer.disconnect();
      dialog.removeEventListener("close", handleClose);
      if (!hasTimeline) scroller?.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="mobile-drawer lg:hidden"
      aria-label={label}
      onClick={(event) => {
        // A tap on the dimmed area (inside the dialog, outside the sheet).
        if (sheetRef.current && !sheetRef.current.contains(event.target as Node)) {
          onClose();
        }
      }}
      onCancel={(event) => {
        // Escape: slide out instead of vanishing.
        if (event.cancelable) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div ref={scrollerRef} className="mobile-drawer-scroller">
        <div
          ref={sheetRef}
          className="mobile-drawer-sheet on-navy bg-blue-950 text-white"
        >
          {children}
        </div>
      </div>
    </dialog>
  );
}
