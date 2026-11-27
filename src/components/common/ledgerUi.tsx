import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { CheckCircle2, CircleDashed, X, type LucideIcon } from "lucide-react";

// The shared look of the list pages that follow the Projects redesign: flat
// navy and slate, ledger tables, 44px touch targets, status as a word and an
// icon as well as a tint. Pages keep their own data and handlers; these are
// the repeated pieces of markup.

export const pageShell =
  "mx-auto w-full max-w-[96rem] px-4 py-5 sm:px-6 lg:px-8 lg:py-8";

export const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 disabled:hover:bg-blue-700 sm:min-h-10";
export const secondaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white sm:min-h-10";
export const dangerButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-red-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-800 disabled:opacity-50 disabled:hover:bg-red-700 sm:min-h-10";
export const dangerOutlineButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-700 bg-white px-4 text-sm font-medium text-red-800 transition-colors hover:bg-red-50 disabled:opacity-50 sm:min-h-10";
// A square icon-only button (edit, delete): 44px on touch, 40px with a mouse.
export const iconButton =
  "inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-700 transition-colors hover:bg-slate-100 sm:h-10 sm:w-10";

export const fieldClass =
  "min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-500 focus:border-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100 sm:min-h-10 sm:text-sm";
export const labelClass = "mb-1 block text-sm font-medium text-slate-700";

export const tagBase =
  "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium";

// Percent done as a number, a bar, and for the two ends a word as well, so the
// bar's colour is never the only signal.
export function ProgressMeter({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const clamped = Math.min(100, Math.max(0, value || 0));
  const done = clamped >= 100;
  return (
    <div className="min-w-[7rem]">
      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
        <span className="font-medium tabular-nums text-slate-900">
          {clamped}%
        </span>
        {done ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Done
          </span>
        ) : clamped === 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-slate-600">
            <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" /> Not
            started
          </span>
        ) : null}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className={`h-2 rounded-full ${done ? "bg-emerald-600" : "bg-blue-700"}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

// A native modal <dialog>: the page behind goes inert, focus moves in and
// returns to the trigger, and Escape closes it. A click on the backdrop closes
// it too. While `busy`, neither can dismiss it (a save is in flight).
export function Dialog({
  title,
  icon: Icon,
  onClose,
  busy = false,
  footer,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  onClose: () => void;
  busy?: boolean;
  footer: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // The dialog unmounts as it closes, so the browser can't hand focus back to
  // the button that opened it; do that here.
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      // Removing the dialog from the page already ends the modal state; calling
      // close() here would fire a close event that dismisses it again.
      opener?.focus?.();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/50"
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 py-2 pl-4 pr-2">
          <h2
            id={titleId}
            className="flex items-center gap-2 text-lg font-semibold"
          >
            {Icon && <Icon className="h-5 w-5" aria-hidden="true" />} {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className={iconButton}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 p-3">
          {footer}
        </div>
      </div>
    </dialog>
  );
}

export interface ComboOption {
  key: string | number;
  label: string;
  detail?: string;
  selected?: boolean;
}

// A text box that suggests matches as you type and picks one: used for the
// vessel, project and work order filters. Arrow keys move through the
// suggestions, Enter picks one, Escape closes the list.
export function FilterCombo({
  label,
  placeholder,
  value,
  onInputChange,
  onClear,
  options,
  onSelect,
  open,
  onOpenChange,
  disabled = false,
  emptyText = "No matches",
  containerRef,
}: {
  label: string;
  placeholder: string;
  value: string;
  onInputChange: (value: string) => void;
  onClear: () => void;
  options: ComboOption[];
  onSelect: (key: string | number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  emptyText?: string;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const inputId = useId();
  const listId = useId();
  const [active, setActive] = useState(-1);
  const expanded = open && options.length > 0;

  const optionId = (i: number) => `${listId}-${i}`;

  const pick = (i: number) => {
    const option = options[i];
    if (!option) return;
    onSelect(option.key);
    setActive(-1);
  };

  return (
    <div className="relative" ref={containerRef}>
      <label htmlFor={inputId} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            expanded && active >= 0 ? optionId(active) : undefined
          }
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            setActive(-1);
            onInputChange(e.target.value);
          }}
          onFocus={() => onOpenChange(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (!open) onOpenChange(true);
              else setActive((a) => (a + 1) % Math.max(options.length, 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) =>
                a <= 0 ? options.length - 1 : a - 1,
              );
            } else if (e.key === "Enter" && expanded && active >= 0) {
              e.preventDefault();
              pick(active);
            } else if (e.key === "Escape") {
              onOpenChange(false);
            }
          }}
          className={`${fieldClass} pr-11`}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Clear ${label.toLowerCase()}`}
            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 sm:h-10 sm:w-10"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {open && !disabled && options.length === 0 && (
        <p
          role="status"
          className="absolute z-20 mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm text-slate-600 shadow-md"
        >
          {emptyText}
        </p>
      )}

      {expanded && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-300 bg-white shadow-md"
        >
          {options.map((option, i) => (
            <li
              key={option.key}
              id={optionId(i)}
              role="option"
              aria-selected={!!option.selected}
              // Keep focus in the input so the list does not close first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
              className={`min-h-11 cursor-pointer px-3 py-2 sm:min-h-10 ${
                i === active
                  ? "bg-slate-100"
                  : option.selected
                    ? "bg-blue-50"
                    : "hover:bg-slate-50"
              }`}
            >
              <div
                className={`text-sm text-slate-900 ${
                  option.selected ? "font-semibold" : "font-medium"
                }`}
              >
                {option.label}
              </div>
              {option.detail && (
                <div className="text-sm text-slate-600">{option.detail}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
