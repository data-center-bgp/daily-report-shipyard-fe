import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Lightbulb,
  List,
  Maximize,
  Minimize,
  X,
  ZoomIn,
} from "lucide-react";
import { deckById, slideLabel, type GuideDeck, type Slide } from "../../content/guide/deck";
import { topicById, type GuideImage } from "../../content/guide";

// One slide is sized in `em`, and the em follows the smaller of the stage's width
// and height, so the whole slide grows and shrinks together: readable from the back
// of a room on a projector, and still usable on a phone.
const stageFont = "clamp(13px, min(1.4cqw, 2.35cqh), 30px)";

const barButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-white transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const navButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-blue-950 transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white";

const numberDot =
  "flex h-[1.9em] w-[1.9em] flex-shrink-0 items-center justify-center rounded-full bg-blue-950 text-[0.9em] font-semibold text-white";

// Closes a native modal dialog when the press lands on its backdrop. Browsers
// that know `closedby="any"` do this themselves; this covers the rest.
function closeOnBackdrop(e: React.MouseEvent<HTMLDialogElement>) {
  const dialog = e.currentTarget;
  if (e.target !== dialog) return;
  const r = dialog.getBoundingClientRect();
  const inside =
    r.top <= e.clientY && e.clientY <= r.bottom && r.left <= e.clientX && e.clientX <= r.right;
  if (!inside) dialog.close();
}

const dialogBase =
  "m-0 overscroll-contain p-0 text-slate-900 backdrop:overflow-hidden backdrop:overscroll-contain backdrop:bg-slate-950/70";

// --- the slides ------------------------------------------------------------

function ShotImage({ image, onZoom }: { image: GuideImage; onZoom: (image: GuideImage) => void }) {
  // A tall page (the readiness form) cannot be read when squeezed to the height of
  // the slide, so it fills the width and scrolls. Everything else is shown whole.
  const [tall, setTall] = useState(false);
  return (
    <div className="relative min-h-[40%] flex-1 overflow-hidden rounded-lg border border-slate-300 bg-slate-100 @3xl:min-h-0">
      <div
        className="absolute inset-0 overflow-auto"
        {...(tall ? { tabIndex: 0, role: "region", "aria-label": "Gambar langkah, bisa digulir" } : {})}
      >
        <img
          src={image.src}
          alt={image.alt}
          decoding="async"
          onLoad={(e) => {
            const img = e.currentTarget;
            setTall(img.naturalWidth >= 600 && img.naturalHeight / img.naturalWidth > 1.4);
          }}
          className={tall ? "block h-auto w-full" : "mx-auto block h-full w-full object-contain"}
        />
      </div>
      <button
        type="button"
        onClick={() => onZoom(image)}
        className="absolute bottom-[0.8em] right-[1.4em] inline-flex min-h-11 items-center gap-[0.4em] rounded-md bg-slate-900 px-[0.9em] text-[0.8em] font-medium text-white shadow-md transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
      >
        <ZoomIn className="h-[1.2em] w-[1.2em]" aria-hidden="true" />
        {tall ? "Gulir, atau perbesar" : "Perbesar gambar"}
      </button>
    </div>
  );
}

function SlideView({
  slide,
  onZoom,
  onJumpTopic,
}: {
  slide: Slide;
  onZoom: (image: GuideImage) => void;
  onJumpTopic: (topicId: string) => void;
}) {
  switch (slide.kind) {
    case "title":
      return (
        <div className="flex h-full flex-col justify-center overflow-y-auto bg-blue-950 p-[3em] text-white">
          <p className="text-[0.95em] font-medium text-blue-200">Daily Report Shipyard</p>
          <h1 className="mt-[0.6em] max-w-[22em] text-[3em] font-bold leading-[1.1]">{slide.title}</h1>
          {slide.subtitle && (
            <p className="mt-[0.8em] max-w-[34em] text-[1.4em] text-blue-100">{slide.subtitle}</p>
          )}
          {slide.note && <p className="mt-[1.6em] max-w-[44em] text-[1em] text-blue-200">{slide.note}</p>}
        </div>
      );

    case "section":
      return (
        <div className="flex h-full flex-col justify-center gap-[1.2em] overflow-y-auto bg-blue-950 p-[3em] text-white">
          <p className="text-[1em] font-medium text-blue-200">{slide.eyebrow}</p>
          <h1 className="max-w-[20em] text-[2.6em] font-bold leading-[1.1]">{slide.title}</h1>
          <p className="max-w-[34em] text-[1.3em] text-blue-100">{slide.summary}</p>
          <dl className="mt-[0.4em] grid max-w-[46em] gap-[0.9em] border-t border-white/25 pt-[1em] @2xl:grid-cols-2">
            {slide.facts.map((f) => (
              <div key={f.label}>
                <dt className="text-[0.85em] text-blue-200">{f.label}</dt>
                <dd className="mt-[0.2em] text-[1.05em]">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      );

    case "agenda":
      return (
        <div className="flex h-full flex-col gap-[1em] overflow-y-auto p-[2em]">
          <h1 className="text-[2em] font-bold text-blue-950">{slide.title}</h1>
          <ol
            className={`grid gap-x-[1.5em] gap-y-[0.2em] ${
              slide.items.length > 18
                ? "@3xl:grid-cols-2 @5xl:grid-cols-3"
                : slide.items.length > 8
                  ? "@3xl:grid-cols-2"
                  : ""
            }`}
          >
            {slide.items.map((item, i) => (
              <li key={`${item.topicId}-${i}`}>
                <button
                  type="button"
                  onClick={() => item.topicId && onJumpTopic(item.topicId)}
                  className={`flex min-h-11 w-full items-start gap-[0.7em] rounded-md px-[0.6em] text-left text-slate-900 transition-colors hover:bg-slate-100 ${
                    slide.items.length > 18 ? "py-[0.15em] text-[0.9em]" : "py-[0.35em] text-[1.05em]"
                  }`}
                >
                  <span className={numberDot}>{i + 1}</span>
                  <span className="pt-[0.15em]">{item.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      );

    case "flow":
      return (
        <div className="flex h-full flex-col gap-[1em] overflow-y-auto p-[2em]">
          <h1 className="text-[2em] font-bold text-blue-950">{slide.title}</h1>
          {slide.lead && <p className="max-w-[44em] text-[1.1em] text-slate-700">{slide.lead}</p>}
          <ol className="grid content-start gap-[0.8em] @xl:grid-cols-2 @4xl:grid-cols-4">
            {slide.stages.map((s, i) => (
              <li
                key={s.name}
                className="flex flex-col gap-[0.4em] rounded-lg border border-slate-200 bg-slate-50 p-[1em]"
              >
                <span className={numberDot}>{i + 1}</span>
                <h2 className="text-[1.15em] font-semibold text-slate-900">{s.name}</h2>
                <p className="text-[0.85em] font-medium text-blue-800">{s.who}</p>
                <p className="text-[0.9em] text-slate-700">{s.what}</p>
              </li>
            ))}
          </ol>
        </div>
      );

    case "cards":
      return (
        <div className="flex h-full flex-col gap-[1em] overflow-y-auto p-[2em]">
          <h1 className="text-[2em] font-bold text-blue-950">{slide.title}</h1>
          {slide.lead && <p className="max-w-[44em] text-[1.1em] text-slate-700">{slide.lead}</p>}
          <ul
            className={`grid content-start gap-[0.9em] ${
              slide.cards.length > 4 ? "@xl:grid-cols-2 @3xl:grid-cols-3" : "@3xl:grid-cols-3"
            }`}
          >
            {slide.cards.map((c) => (
              <li key={c.title} className="rounded-lg border border-slate-200 bg-slate-50 p-[1em]">
                <h2 className="text-[1.15em] font-semibold text-slate-900">{c.title}</h2>
                <p className="mt-[0.3em] text-[0.95em] text-slate-700">{c.body}</p>
              </li>
            ))}
          </ul>
        </div>
      );

    case "steps":
      return (
        <div className="flex h-full flex-col gap-[1em] overflow-y-auto p-[2em]">
          <p className="text-[0.95em] font-medium text-slate-600">{slide.eyebrow}</p>
          <h1 className="text-[2em] font-bold leading-[1.15] text-blue-950">{slide.title}</h1>
          <ol className="grid gap-[0.8em]">
            {slide.items.map((s) => (
              <li key={s.no} className="flex gap-[0.9em] rounded-lg border border-slate-200 bg-white p-[1em]">
                <span className={numberDot}>{s.no}</span>
                <div className="min-w-0">
                  <h2 className="text-[1.25em] font-semibold text-slate-900">{s.title}</h2>
                  {s.detail && <p className="mt-[0.3em] text-[1.05em] text-slate-700">{s.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      );

    case "shot":
      return (
        <div className="flex h-full flex-col gap-[1.2em] p-[2em] @3xl:flex-row">
          <div className="flex max-h-[45%] flex-shrink-0 flex-col gap-[0.5em] overflow-y-auto @3xl:max-h-none @3xl:w-[32%]">
            <p className="text-[0.95em] font-medium text-slate-600">{slide.eyebrow}</p>
            <p className="text-[0.95em] font-semibold text-blue-800">
              Langkah {slide.no} dari {slide.total}
            </p>
            <h1 className="text-[1.7em] font-bold leading-[1.15] text-blue-950">{slide.title}</h1>
            {slide.detail && <p className="text-[1.05em] text-slate-700">{slide.detail}</p>}
          </div>
          <ShotImage image={slide.image} onZoom={onZoom} />
        </div>
      );

    case "tips":
      return (
        <div className="flex h-full flex-col gap-[1em] overflow-y-auto bg-amber-50 p-[2em] text-amber-950">
          <p className="text-[0.95em] font-medium">{slide.eyebrow}</p>
          <h1 className="flex items-center gap-[0.4em] text-[2em] font-bold">
            <Lightbulb className="h-[0.9em] w-[0.9em]" aria-hidden="true" /> {slide.title}
          </h1>
          <ul className="grid gap-[0.7em]">
            {slide.items.map((t) => (
              <li key={t} className="rounded-lg border border-amber-300 bg-white p-[1em] text-[1.15em]">
                {t}
              </li>
            ))}
          </ul>
        </div>
      );

    case "problems":
      return (
        <div className="flex h-full flex-col gap-[1em] overflow-y-auto p-[2em]">
          <p className="text-[0.95em] font-medium text-slate-600">{slide.eyebrow}</p>
          <h1 className="text-[2em] font-bold text-blue-950">{slide.title}</h1>
          <ul className="grid gap-[0.8em]">
            {slide.items.map((p) => (
              <li key={p.problem} className="rounded-lg border border-slate-200 bg-slate-50 p-[1em]">
                <h2 className="text-[1.2em] font-semibold text-slate-900">{p.problem}</h2>
                <p className="mt-[0.4em] text-[1.05em] text-slate-700">{p.fix}</p>
              </li>
            ))}
          </ul>
        </div>
      );

    case "closing":
      return (
        <div className="flex h-full flex-col justify-center gap-[1em] overflow-y-auto bg-blue-950 p-[3em] text-white">
          <h1 className="text-[3em] font-bold leading-[1.1]">{slide.title}</h1>
          <p className="max-w-[34em] text-[1.3em] text-blue-100">{slide.body}</p>
          {slide.link && (
            <p className="mt-[0.6em]">
              <Link
                to={slide.link.href}
                className="inline-flex min-h-11 items-center rounded-md bg-white px-[1.2em] py-[0.5em] text-[1em] font-semibold text-blue-950 hover:bg-blue-50"
              >
                {slide.link.label}
              </Link>
            </p>
          )}
        </div>
      );
  }
}

// --- the presenter ---------------------------------------------------------

function Presenter({ deck }: { deck: GuideDeck }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const total = deck.slides.length;
  const asked = Number(params.get("slide"));
  const index = Number.isInteger(asked) && asked >= 1 && asked <= total ? asked - 1 : 0;
  const slide = deck.slides[index];

  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDialogElement>(null);
  const zoomRef = useRef<HTMLDialogElement>(null);
  const [listOpen, setListOpen] = useState(false);
  const [zoom, setZoom] = useState<GuideImage | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const canFullscreen = typeof document !== "undefined" && document.fullscreenEnabled;

  // The key handler is attached once, so it reads the current slide from here.
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  const modalOpen = listOpen || zoom !== null;

  const go = useCallback(
    (n: number) => {
      const next = Math.min(Math.max(n, 0), total - 1);
      setParams({ slide: String(next + 1) }, { replace: true });
    },
    [total, setParams],
  );

  const jumpToTopic = useCallback(
    (topicId: string) => {
      const at = deck.slides.findIndex((s) => s.topicId === topicId);
      if (at !== -1) go(at);
    },
    [deck, go],
  );

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void rootRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || modalOpen) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest("input, textarea, select")) return;
      const onControl = !!target?.closest("button, a, summary");
      const at = indexRef.current;
      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
          go(at + 1);
          break;
        case "ArrowLeft":
        case "PageUp":
          go(at - 1);
          break;
        case " ":
          // Space presses a focused button, so leave it alone there.
          if (onControl) return;
          go(at + (e.shiftKey ? -1 : 1));
          break;
        case "Home":
          go(0);
          break;
        case "End":
          go(total - 1);
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        case "g":
        case "G":
          setListOpen(true);
          break;
        case "Escape":
          // In full screen the browser uses Escape to leave it, so do not also exit.
          if (document.fullscreenElement) return;
          navigate("/guide/present");
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, total, toggleFullscreen, navigate, modalOpen]);

  // Native modal dialogs: open and close them from state.
  useEffect(() => {
    const d = listRef.current;
    if (!d) return;
    if (listOpen && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: "center" });
    } else if (!listOpen && d.open) d.close();
  }, [listOpen]);
  useEffect(() => {
    const d = zoomRef.current;
    if (!d) return;
    if (zoom && !d.open) d.showModal();
    else if (!zoom && d.open) d.close();
  }, [zoom]);

  // Fetch the picture of the next slide while this one is on screen.
  useEffect(() => {
    const next = deck.slides[index + 1];
    if (next?.kind === "shot") new Image().src = next.image.src;
  }, [deck, index]);

  // Swipe left or right on a phone or tablet.
  const touch = useRef<{ x: number; y: number } | null>(null);

  const groups = useMemo(() => {
    const out: { key: string; heading?: string; items: { at: number; slide: Slide }[] }[] = [];
    deck.slides.forEach((s, at) => {
      const last = out[out.length - 1];
      if (last && last.key === (s.topicId ?? "")) last.items.push({ at, slide: s });
      else
        out.push({
          key: s.topicId ?? "",
          heading: s.topicId ? topicById(s.topicId)?.title : undefined,
          items: [{ at, slide: s }],
        });
    });
    return out;
  }, [deck]);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[70] flex flex-col bg-slate-950 text-white"
      onTouchStart={(e) => {
        const t = e.touches[0];
        touch.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        const start = touch.current;
        touch.current = null;
        if (!start) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="flex h-14 flex-shrink-0 items-center gap-1 px-1 sm:gap-2 sm:px-3">
        <Link to="/guide/present" className={barButton}>
          <X className="h-4 w-4" aria-hidden="true" /> Keluar
        </Link>
        <p className="min-w-0 flex-1 truncate px-1 text-sm font-medium text-slate-200">{deck.title}</p>
        <p className="px-1 text-sm tabular-nums text-slate-200">
          {index + 1} / {total}
        </p>
        <button type="button" onClick={() => setListOpen(true)} className={barButton}>
          <List className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Daftar slide</span>
          <span className="sr-only sm:hidden">Daftar slide</span>
        </button>
        {canFullscreen && (
          <button type="button" onClick={toggleFullscreen} aria-pressed={fullscreen} className={barButton}>
            {fullscreen ? (
              <Minimize className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Maximize className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">Layar penuh</span>
            <span className="sr-only sm:hidden">Layar penuh</span>
          </button>
        )}
      </div>
      <div className="h-1 flex-shrink-0 bg-white/15" aria-hidden="true">
        <div
          className="h-full bg-blue-400 motion-safe:transition-[width]"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      <div className="relative min-h-0 flex-1" style={{ containerType: "size" }}>
        <section
          key={index}
          aria-roledescription="slide"
          aria-label={`Slide ${index + 1} dari ${total}: ${slideLabel(slide)}`}
          className="absolute inset-2 overflow-hidden rounded-lg bg-white text-slate-900 sm:inset-4"
          style={{ fontSize: stageFont }}
        >
          <SlideView slide={slide} onZoom={setZoom} onJumpTopic={jumpToTopic} />
        </section>
      </div>
      <p className="sr-only" aria-live="polite">
        Slide {index + 1} dari {total}: {slideLabel(slide)}
      </p>

      <div className="flex h-16 flex-shrink-0 items-center justify-between gap-3 px-2 sm:px-4">
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className={navButton}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Sebelumnya
        </button>
        <p className="hidden text-xs text-slate-300 md:block">
          Panah kiri dan kanan untuk berpindah. F layar penuh. G daftar slide. Esc keluar.
        </p>
        <button
          type="button"
          onClick={() => go(index + 1)}
          disabled={index === total - 1}
          className={navButton}
        >
          Berikutnya <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <dialog
        ref={listRef}
        aria-labelledby="slide-list-title"
        onClose={() => setListOpen(false)}
        onClick={closeOnBackdrop}
        {...({ closedby: "any" } as object)}
        className={`${dialogBase} fixed inset-y-0 left-auto right-0 h-full max-h-none w-[min(26rem,100%)] max-w-none bg-white`}
      >
        <div className="flex h-full flex-col">
          <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
            <h1 id="slide-list-title" className="text-base font-semibold text-slate-900">
              Daftar slide
            </h1>
            <button
              type="button"
              onClick={() => setListOpen(false)}
              className="inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm font-medium text-slate-800 hover:bg-slate-100"
            >
              <X className="h-4 w-4" aria-hidden="true" /> Tutup
            </button>
          </div>
          <nav aria-label="Daftar slide" className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
            {groups.map((g, gi) => (
              <section key={`${g.key}-${gi}`} className="mb-3">
                {g.heading && (
                  <h2 className="px-2 pb-1 text-sm font-semibold text-blue-900">{g.heading}</h2>
                )}
                <ol>
                  {g.items.map(({ at, slide: s }) => (
                    <li key={at}>
                      <button
                        type="button"
                        aria-current={at === index ? "true" : undefined}
                        onClick={() => {
                          go(at);
                          setListOpen(false);
                        }}
                        className={`flex min-h-11 w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                          at === index
                            ? "bg-blue-950 font-semibold text-white"
                            : "text-slate-800 hover:bg-slate-100"
                        }`}
                      >
                        <span className="w-7 flex-shrink-0 tabular-nums opacity-80">{at + 1}</span>
                        <span>{slideLabel(s)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </nav>
        </div>
      </dialog>

      <dialog
        ref={zoomRef}
        aria-labelledby="zoom-title"
        onClose={() => setZoom(null)}
        onClick={closeOnBackdrop}
        {...({ closedby: "any" } as object)}
        className={`${dialogBase} fixed inset-0 h-dvh max-h-none w-dvw max-w-none bg-transparent`}
      >
        <div className="flex h-full flex-col">
          <div className="flex flex-shrink-0 items-center justify-between gap-2 bg-slate-950 px-3 py-2 text-white">
            <h1 id="zoom-title" className="text-sm font-medium">
              Gambar ukuran penuh
            </h1>
            <button
              type="button"
              onClick={() => setZoom(null)}
              className="inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm font-medium hover:bg-white/15"
            >
              <X className="h-4 w-4" aria-hidden="true" /> Tutup
            </button>
          </div>
          <div
            tabIndex={0}
            role="region"
            aria-label="Gambar, bisa digulir"
            className="min-h-0 flex-1 overflow-auto bg-slate-900 p-3"
          >
            {zoom && <img src={zoom.src} alt={zoom.alt} className="mx-auto block h-auto max-w-full" />}
          </div>
        </div>
      </dialog>
    </div>
  );
}

export default function GuidePresenter() {
  const { deckId } = useParams();
  const deck = deckById(deckId);
  if (!deck) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 sm:px-6 lg:py-8">
        <Link
          to="/guide/present"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-blue-800 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali ke mode presentasi
        </Link>
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
          <p className="text-sm font-medium text-slate-900">Paket slide itu tidak ada</p>
          <p className="mt-1 text-sm text-slate-600">Pilih salah satu dari daftar paket slide.</p>
        </div>
      </div>
    );
  }
  return <Presenter key={deck.id} deck={deck} />;
}
