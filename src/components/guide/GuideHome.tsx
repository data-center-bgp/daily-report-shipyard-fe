import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ChevronRight, Search, X } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import {
  GUIDE_GROUPS,
  GUIDE_ROLE_LABEL,
  GUIDE_TOPICS,
  roleDoesTopic,
  rolePathFor,
  searchTopics,
  topicById,
  type GuideRole,
  type GuideTopic,
} from "../../content/guide";
import { fieldClass, secondaryButton } from "../plans/planStatus";

const pageShell = "mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:py-8";

function WhoTag({ topic, role }: { topic: GuideTopic; role: GuideRole | undefined }) {
  if (roleDoesTopic(topic, role)) {
    return (
      <span className="inline-flex rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
        Tugas Anda
      </span>
    );
  }
  const who =
    topic.roles === "all"
      ? "Semua role"
      : topic.roles.map((r) => GUIDE_ROLE_LABEL[r]).join(", ");
  return (
    <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
      Dikerjakan oleh {who}
    </span>
  );
}

function TopicRow({ topic, role }: { topic: GuideTopic; role: GuideRole | undefined }) {
  return (
    <li>
      <Link
        to={`/guide/${topic.id}`}
        className="flex min-h-11 items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-blue-800">{topic.title}</span>
          <span className="mt-0.5 block text-sm text-slate-700">{topic.summary}</span>
          <span className="mt-1.5 block">
            <WhoTag topic={topic} role={role} />
          </span>
        </span>
        <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-500" aria-hidden="true" />
      </Link>
    </li>
  );
}

export default function GuideHome() {
  const { profile } = useAuth();
  const role = profile?.role as GuideRole | undefined;
  const path = rolePathFor(role);
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"role" | "all">(path ? "role" : "all");

  const results = useMemo(() => searchTopics(query, GUIDE_TOPICS), [query]);
  const searching = query.trim() !== "";
  const pathTopics = useMemo(
    () => (path ? path.topics.map(topicById).filter((t): t is GuideTopic => !!t) : []),
    [path],
  );

  return (
    <div className={`${pageShell} space-y-6`}>
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 sm:text-3xl">
          <BookOpen className="h-7 w-7 text-blue-800" aria-hidden="true" />
          Panduan pengguna
        </h1>
        <p className="text-sm text-slate-700 sm:text-base">
          Bantuan langkah demi langkah untuk setiap tugas. Mulailah dari jalur untuk role Anda, atau
          cari apa yang ingin Anda lakukan.
        </p>
      </header>

      <section aria-label="Cari dan pilih tampilan" className="space-y-3">
        <form role="search" onSubmit={(e) => e.preventDefault()} className="relative max-w-xl">
          <label htmlFor={searchId} className="sr-only">
            Cari di panduan
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden="true"
          />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Contoh: impor, invoice, kesiapan"
            className={`${fieldClass} pl-9`}
          />
        </form>

        {!searching && (
          <div role="group" aria-label="Yang ditampilkan" className="flex flex-wrap gap-2">
            {path && (
              <button
                type="button"
                aria-pressed={view === "role"}
                onClick={() => setView("role")}
                className={`inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium transition-colors sm:min-h-10 ${
                  view === "role"
                    ? "border-blue-950 bg-blue-950 text-white"
                    : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                }`}
              >
                Untuk {path.title}
              </button>
            )}
            <button
              type="button"
              aria-pressed={view === "all"}
              onClick={() => setView("all")}
              className={`inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium transition-colors sm:min-h-10 ${
                view === "all"
                  ? "border-blue-950 bg-blue-950 text-white"
                  : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
              }`}
            >
              Semua topik
            </button>
          </div>
        )}
      </section>

      {searching ? (
        <section aria-labelledby="results-title" className="space-y-2">
          <h2 id="results-title" className="text-lg font-semibold text-slate-900">
            {results.length} topik cocok dengan “{query.trim()}”
          </h2>
          {results.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
              <p className="text-sm font-medium text-slate-900">Tidak ada yang cocok</p>
              <p className="mt-1 text-sm text-slate-600">
                Coba kata yang lebih pendek, atau telusuri semua topik.
              </p>
              <button type="button" onClick={() => setQuery("")} className={`mt-4 ${secondaryButton}`}>
                <X className="h-4 w-4" aria-hidden="true" /> Hapus pencarian
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {results.map((t) => (
                <TopicRow key={t.id} topic={t} role={role} />
              ))}
            </ul>
          )}
        </section>
      ) : view === "role" && path ? (
        <section aria-labelledby="path-title" className="space-y-3">
          <div>
            <h2 id="path-title" className="text-lg font-semibold text-slate-900">
              Mulai dari sini: {path.title}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-700">{path.intro}</p>
          </div>
          <ol className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {pathTopics.map((t, i) => (
              <li key={t.id}>
                <Link
                  to={`/guide/${t.id}`}
                  className="flex min-h-11 items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-950 text-xs font-semibold text-white"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-blue-800">{t.title}</span>
                    <span className="mt-0.5 block text-sm text-slate-700">{t.summary}</span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-500" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <div className="space-y-8">
          {GUIDE_GROUPS.map((group) => {
            const topics = GUIDE_TOPICS.filter((t) => t.group === group.id);
            if (topics.length === 0) return null;
            return (
              <section key={group.id} aria-labelledby={`group-${group.id}`} className="space-y-2">
                <div>
                  <h2 id={`group-${group.id}`} className="text-lg font-semibold text-slate-900">
                    {group.title}
                  </h2>
                  <p className="text-sm text-slate-600">{group.blurb}</p>
                </div>
                <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
                  {topics.map((t) => (
                    <TopicRow key={t.id} topic={t} role={role} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
