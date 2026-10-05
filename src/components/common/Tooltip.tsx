import { useId, useState, type ReactNode } from "react";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
}

// Shown on hover and keyboard focus. Positioned with `fixed` coordinates taken
// from the trigger, so it isn't clipped by scrolling table containers
// (`overflow-x-auto` also clips vertically). Flips below the trigger when
// there isn't room above it.
export default function Tooltip({ content, children }: TooltipProps) {
  const id = useId();
  const [pos, setPos] = useState<{
    x: number;
    y: number;
    below: boolean;
  } | null>(null);

  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const below = r.top < 120;
    setPos({
      x: r.left + r.width / 2,
      y: below ? r.bottom + 8 : r.top - 8,
      below,
    });
  };

  return (
    <span
      className="inline-flex"
      tabIndex={0}
      aria-describedby={pos ? id : undefined}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setPos(null)}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={() => setPos(null)}
    >
      {children}
      {pos && (
        <span
          id={id}
          role="tooltip"
          style={{
            left: Math.min(Math.max(pos.x, 144), window.innerWidth - 144),
            top: pos.y,
          }}
          className={`pointer-events-none fixed z-50 w-72 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white shadow-lg ${
            pos.below ? "" : "-translate-y-full"
          }`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
