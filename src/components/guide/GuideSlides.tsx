import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { History, Lightbulb, Ship, Users, ZoomIn, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Slide } from "../../content/guide/deck";
import type { GuideImage } from "../../content/guide";
import ShipScene, { Waves } from "./ShipScene";

// The look of the slides. Navy is the brand's own colour (the sign-in page and the
// sidebar), the amber is the crane in the sign-in picture and marks the one thing
// to look at on a slide (who does the task, the lightbulb of a tip), and the ship
// and the water are the same illustration as the sign-in page. Everything is sized
// in em, so one slide scales as a whole with the stage it is shown on.

const LOGO = "/bgp-icon.jpg";

const tile =
  "flex h-[2.4em] w-[2.4em] flex-shrink-0 items-center justify-center rounded-[0.7em] bg-blue-950 text-[1em] font-bold text-white";

const cardClass = "rounded-[0.9em] border border-slate-200 bg-white p-[1em] shadow-sm";

function RoleChips({ roles }: { roles: string[] }) {
  return (
    <ul className="flex flex-wrap gap-[0.4em]">
      {roles.map((r) => (
        <li
          key={r}
          className="rounded-full bg-amber-300 px-[0.85em] py-[0.15em] text-[0.9em] font-semibold text-blue-950"
        >
          {r}
        </li>
      ))}
    </ul>
  );
}

// The frame of every light slide: the brand on the left, where you are on the right.
function Frame({
  context,
  tone = "light",
  children,
}: {
  context?: string;
  tone?: "light" | "amber";
  children: ReactNode;
}) {
  return (
    <div className={`flex h-full flex-col ${tone === "amber" ? "bg-amber-50" : "bg-slate-50"}`}>
      <div className="flex flex-shrink-0 items-center justify-between gap-[1em] border-b border-slate-200 bg-white px-[1.6em] py-[0.6em]">
        <div className="flex items-center gap-[0.6em]">
          <img src={LOGO} alt="" className="h-[1.8em] w-[1.8em] rounded-[0.4em] object-cover" />
          <span className="text-[0.8em] font-semibold text-blue-950">Daily Report Shipyard</span>
        </div>
        {context && <span className="min-w-0 truncate text-[0.8em] text-slate-600">{context}</span>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[1em] overflow-y-auto p-[1.6em]">{children}</div>
    </div>
  );
}

const h1Class = "text-[2em] font-bold leading-[1.1] text-blue-950";

// --- a screenshot ----------------------------------------------------------

function ShotImage({ image, onZoom }: { image: GuideImage; onZoom: (image: GuideImage) => void }) {
  // A tall page (the readiness form) cannot be read when squeezed to the height of
  // the slide, so it fills the width and scrolls. Everything else is shown whole.
  const [tall, setTall] = useState(false);
  return (
    <div className="relative min-h-[40%] flex-1 overflow-hidden rounded-[1em] bg-blue-950 p-[0.5em] shadow-lg @3xl:min-h-0">
      <div className="relative h-full w-full overflow-hidden rounded-[0.6em] bg-slate-100">
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
      </div>
      <button
        type="button"
        onClick={() => onZoom(image)}
        className="absolute bottom-[1.2em] right-[1.8em] inline-flex min-h-11 items-center gap-[0.4em] rounded-md bg-amber-300 px-[0.9em] text-[0.8em] font-semibold text-blue-950 shadow-md transition-colors hover:bg-amber-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <ZoomIn className="h-[1.2em] w-[1.2em]" aria-hidden="true" />
        {tall ? "Gulir, atau perbesar" : "Perbesar gambar"}
      </button>
    </div>
  );
}

const CARD_ICON = { ship: Ship, users: Users, history: History } as const;

// --- the slides ------------------------------------------------------------

export default function SlideView({
  slide,
  context,
  onZoom,
  onJumpTopic,
}: {
  slide: Slide;
  // Where this slide sits: the topic it belongs to, or the deck.
  context: string;
  onZoom: (image: GuideImage) => void;
  onJumpTopic: (topicId: string) => void;
}) {
  switch (slide.kind) {
    case "title":
      return (
        <div className="relative flex h-full flex-col justify-between overflow-hidden bg-blue-950 p-[2.2em] text-white">
          <div className="relative z-10 flex items-center gap-[0.8em]">
            <img
              src={LOGO}
              alt=""
              className="h-[3em] w-[3em] rounded-[0.7em] object-cover ring-1 ring-white/25"
            />
            <div>
              <p className="font-bold leading-tight">Barokah Galangan Perkasa</p>
              <p className="text-[0.85em] text-blue-200">Daily Report Shipyard System</p>
            </div>
          </div>
          <div className="relative z-10 max-w-[22em] pb-[4em]">
            <h1 className="text-[3em] font-bold leading-[1.08]">{slide.title}</h1>
            {slide.subtitle && (
              <p className="mt-[0.7em] text-[1.3em] leading-snug text-blue-100">{slide.subtitle}</p>
            )}
            {slide.note && (
              <p className="mt-[1.2em] hidden max-w-[34em] text-[0.95em] text-blue-200 @2xl:block">
                {slide.note}
              </p>
            )}
          </div>
          <ShipScene className="pointer-events-none absolute bottom-[1%] right-0 hidden h-[58%] w-[68%] @2xl:block" />
          <Waves className="pointer-events-none absolute inset-x-0 bottom-0 h-[16%] w-full" />
        </div>
      );

    case "section":
      return (
        <div className="relative flex h-full flex-col justify-center overflow-hidden bg-blue-950 p-[2.4em] pb-[4em] text-white">
          {slide.position && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-[0.05em] right-[0.2em] hidden select-none text-[10em] font-black leading-none text-blue-900 @2xl:block"
            >
              {String(slide.position.no).padStart(2, "0")}
            </span>
          )}
          <div className="relative z-10 flex max-w-[34em] flex-col gap-[0.9em]">
            <p className="text-[0.95em] font-medium text-blue-200">
              {slide.eyebrow}
              {slide.position && ` · Topik ${slide.position.no} dari ${slide.position.total}`}
            </p>
            <h1 className="text-[2.6em] font-bold leading-[1.08]">{slide.title}</h1>
            <p className="text-[1.2em] leading-snug text-blue-100">{slide.summary}</p>
            <div className="mt-[0.5em] flex flex-wrap items-center gap-[0.6em]">
              <span className="text-[0.85em] text-blue-200">Dikerjakan oleh</span>
              <RoleChips roles={slide.who} />
            </div>
            {slide.before && (
              <p className="rounded-[0.8em] border border-white/20 bg-white/5 p-[0.9em] text-[0.95em] text-blue-100">
                <strong className="font-semibold text-white">Sebelum mulai: </strong>
                {slide.before}
              </p>
            )}
          </div>
          <Waves className="pointer-events-none absolute inset-x-0 bottom-0 h-[3.2em] w-full" />
        </div>
      );

    case "agenda": {
      const dense = slide.items.length > 18;
      return (
        <Frame context={context}>
          <h1 className={h1Class}>{slide.title}</h1>
          <ol
            className={`grid ${dense ? "gap-[0.3em]" : "gap-[0.5em]"} ${
              dense
                ? "@3xl:grid-cols-2 @5xl:grid-cols-3 @7xl:grid-cols-4"
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
                  className={`flex min-h-11 w-full items-center gap-[0.7em] rounded-[0.7em] border border-slate-200 bg-white px-[0.6em] text-left text-slate-900 shadow-sm transition-colors hover:border-blue-400 hover:bg-blue-50 ${
                    dense ? "py-[0.2em] text-[0.85em]" : "py-[0.4em] text-[1em]"
                  }`}
                >
                  <span
                    className={`${tile} ${dense ? "h-[1.9em] w-[1.9em] rounded-[0.5em] text-[0.9em]" : ""}`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">{item.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </Frame>
      );
    }

    case "flow":
      return (
        <Frame context={context}>
          <h1 className={h1Class}>{slide.title}</h1>
          {slide.lead && <p className="max-w-[44em] text-[1em] text-slate-700">{slide.lead}</p>}
          <ol className="grid gap-x-[2em] @3xl:grid-flow-col @3xl:grid-rows-4">
            {slide.stages.map((s, i) => {
              const last = i === slide.stages.length - 1;
              // The line down to the next stage stops at the end of a column.
              const endOfColumn = i % 4 === 3;
              return (
                <li key={s.name} className="flex gap-[0.9em]">
                  <div className="flex flex-col items-center">
                    <span className={tile}>{i + 1}</span>
                    {!last && (
                      <span
                        aria-hidden="true"
                        className={`my-[0.2em] w-[0.15em] flex-1 rounded bg-blue-200 ${
                          endOfColumn ? "@3xl:invisible" : ""
                        }`}
                      />
                    )}
                  </div>
                  <div className="min-w-0 pb-[0.7em]">
                    <div className="flex flex-wrap items-center gap-x-[0.6em] gap-y-[0.2em]">
                      <h2 className="text-[1.1em] font-semibold text-slate-900">{s.name}</h2>
                      <RoleChips roles={s.who.split(/,\s*|\s+dan\s+/)} />
                    </div>
                    <p className="mt-[0.2em] text-[0.9em] text-slate-700">{s.what}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Frame>
      );

    case "cards":
      return (
        <Frame context={context}>
          <h1 className={h1Class}>{slide.title}</h1>
          {slide.lead && <p className="max-w-[44em] text-[1em] text-slate-700">{slide.lead}</p>}
          <ul
            className={`grid content-start gap-[0.8em] ${
              slide.cards.length > 4 ? "@xl:grid-cols-2 @3xl:grid-cols-3" : "@3xl:grid-cols-3"
            }`}
          >
            {slide.cards.map((c) => {
              const Icon = c.icon ? CARD_ICON[c.icon] : null;
              return (
                <li key={c.title} className={`${cardClass} flex gap-[0.8em]`}>
                  <span className={tile}>
                    {Icon ? (
                      <Icon className="h-[1.3em] w-[1.3em]" aria-hidden="true" />
                    ) : (
                      c.title.charAt(0)
                    )}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[1.1em] font-semibold text-slate-900">{c.title}</h2>
                    <p className="mt-[0.25em] text-[0.9em] text-slate-700">{c.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Frame>
      );

    case "steps":
      return (
        <Frame context={context}>
          <h1 className={h1Class}>{slide.title}</h1>
          <ol className="grid gap-[0.7em]">
            {slide.items.map((s) => (
              <li key={s.no} className={`${cardClass} flex gap-[0.9em]`}>
                <span className={tile}>{s.no}</span>
                <div className="min-w-0">
                  <h2 className="text-[1.2em] font-semibold text-slate-900">{s.title}</h2>
                  {s.detail && <p className="mt-[0.25em] text-[1em] text-slate-700">{s.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
        </Frame>
      );

    case "shot":
      return (
        <Frame context={context}>
          <div className="flex min-h-0 flex-1 flex-col gap-[1.2em] @3xl:flex-row">
            <div className="flex max-h-[45%] flex-shrink-0 flex-col gap-[0.5em] overflow-y-auto @3xl:max-h-none @3xl:w-[32%]">
              <p className="flex items-center gap-[0.6em] text-[0.95em] font-semibold text-blue-800">
                <span className="rounded-full bg-blue-950 px-[0.8em] py-[0.15em] text-white">
                  {String(slide.no).padStart(2, "0")}
                </span>
                Langkah {slide.no} dari {slide.total}
              </p>
              <h1 className="text-[1.7em] font-bold leading-[1.15] text-blue-950">{slide.title}</h1>
              {slide.detail && <p className="text-[1.05em] text-slate-700">{slide.detail}</p>}
            </div>
            <ShotImage image={slide.image} onZoom={onZoom} />
          </div>
        </Frame>
      );

    case "tips":
      return (
        <Frame context={context} tone="amber">
          <h1 className="flex items-center gap-[0.5em] text-[2em] font-bold leading-[1.1] text-amber-950">
            <span className="flex h-[1.5em] w-[1.5em] flex-shrink-0 items-center justify-center rounded-full bg-amber-300 text-blue-950">
              <Lightbulb className="h-[0.85em] w-[0.85em]" aria-hidden="true" />
            </span>
            {slide.title}
          </h1>
          <ul className="grid gap-[0.7em]">
            {slide.items.map((t) => (
              <li
                key={t}
                className="rounded-[0.9em] border border-amber-300 bg-white p-[1em] text-[1.1em] text-amber-950 shadow-sm"
              >
                {t}
              </li>
            ))}
          </ul>
        </Frame>
      );

    case "problems":
      return (
        <Frame context={context}>
          <h1 className={h1Class}>{slide.title}</h1>
          <ul className="grid gap-[0.8em]">
            {slide.items.map((p) => (
              <li key={p.problem} className={`${cardClass} grid gap-[0.6em]`}>
                <div className="flex items-start gap-[0.7em]">
                  <span className="mt-[0.15em] inline-flex flex-shrink-0 items-center gap-[0.3em] rounded-full bg-red-50 px-[0.7em] py-[0.15em] text-[0.8em] font-semibold text-red-800">
                    <AlertTriangle className="h-[1em] w-[1em]" aria-hidden="true" /> Masalah
                  </span>
                  <h2 className="text-[1.1em] font-semibold text-slate-900">{p.problem}</h2>
                </div>
                <div className="flex items-start gap-[0.7em]">
                  <span className="mt-[0.15em] inline-flex flex-shrink-0 items-center gap-[0.3em] rounded-full bg-emerald-50 px-[0.7em] py-[0.15em] text-[0.8em] font-semibold text-emerald-800">
                    <CheckCircle2 className="h-[1em] w-[1em]" aria-hidden="true" /> Cara mengatasi
                  </span>
                  <p className="text-[1em] text-slate-700">{p.fix}</p>
                </div>
              </li>
            ))}
          </ul>
        </Frame>
      );

    case "closing":
      return (
        <div className="relative flex h-full flex-col justify-between overflow-hidden bg-blue-950 p-[2.2em] text-white">
          <div className="relative z-10 flex items-center gap-[0.8em]">
            <img
              src={LOGO}
              alt=""
              className="h-[3em] w-[3em] rounded-[0.7em] object-cover ring-1 ring-white/25"
            />
            <p className="font-bold leading-tight">Barokah Galangan Perkasa</p>
          </div>
          <div className="relative z-10 max-w-[24em] pb-[4em]">
            <h1 className="text-[3em] font-bold leading-[1.08]">{slide.title}</h1>
            <p className="mt-[0.6em] text-[1.2em] leading-snug text-blue-100">{slide.body}</p>
            {slide.link && (
              <p className="mt-[1em]">
                <Link
                  to={slide.link.href}
                  className="inline-flex min-h-11 items-center rounded-md bg-amber-300 px-[1.2em] py-[0.5em] text-[0.95em] font-semibold text-blue-950 transition-colors hover:bg-amber-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {slide.link.label}
                </Link>
              </p>
            )}
          </div>
          <ShipScene className="pointer-events-none absolute bottom-[1%] right-0 hidden h-[58%] w-[68%] @2xl:block" />
          <Waves className="pointer-events-none absolute inset-x-0 bottom-0 h-[16%] w-full" />
        </div>
      );
  }
}
