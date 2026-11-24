import type { ReactNode } from "react";
import { pct } from "./chartTokens";

// Dashboard building blocks. The dashboard reads like a ledger: hairline
// rules, right-aligned tabular figures, every chart backed by a legend that
// carries the same numbers, so nothing depends on colour alone. Sections are
// separated by space and a rule, not wrapped in a card each.

export interface Segment {
  label: string;
  value: number;
  color: string;
}

export function ProgressTrack({
  value,
  color,
  height,
  label,
}: {
  value: number;
  color: string;
  height: string;
  /** What this bar measures, e.g. "Overall progress of MV Example". */
  label: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-slate-200 ${height}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`${color} ${height} rounded-full`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/** A dashboard section: heading, one line of context, then content. */
export function Section({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="scroll-mt-20">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2
            id={`${id}-title`}
            className="text-lg font-semibold text-slate-900"
          >
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-sm text-slate-600">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** The bordered surface charts and tables sit on. Flat: no shadow. */
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white p-4 sm:p-5 ${className}`}
    >
      {children}
    </div>
  );
}

function LegendRow({
  segment,
  total,
}: {
  segment: Segment;
  total: number;
}) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        aria-hidden="true"
        className="h-3 w-3 flex-shrink-0 rounded-sm"
        style={{ backgroundColor: segment.color }}
      />
      <span className="text-slate-700">{segment.label}</span>
      <span className="ml-auto font-semibold tabular-nums text-slate-900">
        {segment.value.toLocaleString()}
      </span>
      <span className="w-10 text-right tabular-nums text-slate-600">
        {pct(segment.value, total)}%
      </span>
    </li>
  );
}

const describeSegments = (segments: Segment[], total: number) =>
  segments
    .map(
      (s) =>
        `${s.label} ${s.value.toLocaleString()} (${pct(s.value, total)}%)`,
    )
    .join(", ");

/** A part-to-whole bar with its legend. */
export function StackedBar({
  title,
  subtitle,
  segments,
}: {
  title: string;
  subtitle?: string;
  segments: Segment[];
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  return (
    <figure>
      <figcaption>
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        {subtitle && (
          <span className="block text-sm text-slate-600">{subtitle}</span>
        )}
      </figcaption>
      <div
        role="img"
        aria-label={`${title}: ${describeSegments(segments, total)}`}
        className="mt-3 flex h-4 w-full gap-0.5 overflow-hidden rounded bg-slate-200"
      >
        {segments.map(
          (s) =>
            s.value > 0 && (
              <div
                key={s.label}
                className="h-full"
                style={{
                  width: `${(s.value / total) * 100}%`,
                  backgroundColor: s.color,
                }}
              />
            ),
        )}
      </div>
      <ul className="mt-3 space-y-1.5">
        {segments.map((s) => (
          <LegendRow key={s.label} segment={s} total={total} />
        ))}
      </ul>
    </figure>
  );
}

/** A donut for a genuine part-to-whole among three or more categories. */
export function Donut({
  title,
  subtitle,
  segments,
  size = 148,
}: {
  title: string;
  subtitle?: string;
  segments: Segment[];
  size?: number;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const strokeWidth = 20;
  const radius = size / 2 - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <figure>
      <figcaption>
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        {subtitle && (
          <span className="block text-sm text-slate-600">{subtitle}</span>
        )}
      </figcaption>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-4">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`${title}: ${describeSegments(segments, total)}`}
          className="flex-shrink-0"
        >
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth={strokeWidth}
            />
            {segments.map((s) => {
              if (s.value <= 0 || total <= 0) return null;
              const fraction = s.value / total;
              const dash = Math.max(fraction * circumference - 2, 0);
              const dashOffset = -cumulative;
              cumulative += fraction * circumference;
              return (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={dashOffset}
                />
              );
            })}
          </g>
          <text
            x={size / 2}
            y={size / 2 - 2}
            textAnchor="middle"
            fontSize={24}
            fontWeight={700}
            fill="#0f172a"
          >
            {total.toLocaleString()}
          </text>
          <text
            x={size / 2}
            y={size / 2 + 16}
            textAnchor="middle"
            fontSize={12}
            fill="#475569"
          >
            total
          </text>
        </svg>
        <ul className="min-w-[12rem] flex-1 space-y-1.5">
          {segments.map((s) => (
            <LegendRow key={s.label} segment={s} total={total} />
          ))}
        </ul>
      </div>
    </figure>
  );
}
