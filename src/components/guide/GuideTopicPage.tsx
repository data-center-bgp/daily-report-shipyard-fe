import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ExternalLink, Info, Lightbulb } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import {
  GUIDE_GROUPS,
  GUIDE_ROLE_LABEL,
  GUIDE_TOPICS,
  roleDoesTopic,
  rolePathFor,
  topicById,
  type GuideRole,
} from "../../content/guide";
import { primaryButton, secondaryButton } from "../plans/planStatus";

const pageShell = "mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 lg:py-8";

export default function GuideTopicPage() {
  const { topicId } = useParams();
  const { profile } = useAuth();
  const role = profile?.role as GuideRole | undefined;
  const topic = topicById(topicId);

  if (!topic) {
    return (
      <div className={`${pageShell} space-y-4`}>
        <Link
          to="/guide"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-blue-800 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali ke panduan
        </Link>
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
          <p className="text-sm font-medium text-slate-900">Topik panduan itu tidak ada</p>
          <p className="mt-1 text-sm text-slate-600">Mungkin namanya sudah diganti. Cari di panduan.</p>
        </div>
      </div>
    );
  }

  const doesIt = roleDoesTopic(topic, role);
  const group = GUIDE_GROUPS.find((g) => g.id === topic.group);
  const path = rolePathFor(role);
  const order = path && path.topics.includes(topic.id) ? path.topics : GUIDE_TOPICS.map((t) => t.id);
  const position = order.indexOf(topic.id);
  const prev = position > 0 ? topicById(order[position - 1]) : undefined;
  const next = position < order.length - 1 ? topicById(order[position + 1]) : undefined;
  const orderLabel = path && order === path.topics ? `jalur ${path.title} Anda` : "panduan";
  const related = (topic.related ?? []).map(topicById).filter((t) => !!t);

  const who =
    topic.roles === "all" ? "Semua role" : topic.roles.map((r) => GUIDE_ROLE_LABEL[r]).join(", ");

  return (
    <article className={`${pageShell} space-y-6`}>
      <header className="space-y-2">
        <Link
          to="/guide"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-blue-800 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali ke panduan
        </Link>
        {group && <p className="text-sm font-medium text-slate-600">{group.title}</p>}
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{topic.title}</h1>
        <p className="text-base text-slate-700">{topic.summary}</p>
        <p className="text-sm text-slate-700">
          <span className="font-medium">Dikerjakan oleh:</span> {who}
        </p>
        {topic.openIn && doesIt && (
          <div className="pt-1">
            <Link to={topic.openIn.href} className={primaryButton}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" /> {topic.openIn.label}
            </Link>
          </div>
        )}
      </header>

      {!doesIt && (
        <p className="flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm text-slate-800">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>
            Tugas ini dikerjakan oleh {who}. Dengan role Anda, Anda bisa membacanya dan biasanya
            melihat hasilnya, tetapi tidak bisa mengerjakannya.
          </span>
        </p>
      )}

      {topic.before && (
        <section aria-labelledby="before-title" className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 id="before-title" className="text-base font-semibold text-slate-900">
            Sebelum mulai
          </h2>
          <p className="mt-1 text-sm text-slate-800">{topic.before}</p>
        </section>
      )}

      <section aria-labelledby="steps-title" className="space-y-3">
        <h2 id="steps-title" className="text-xl font-semibold text-slate-900">
          Langkah
        </h2>
        <ol className="space-y-3">
          {topic.steps.map((step, i) => (
            <li key={step.title} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-950 text-sm font-semibold text-white"
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
                {step.detail && <p className="mt-1 text-sm text-slate-700">{step.detail}</p>}
                {step.image && (
                  <figure className="mt-3">
                    <a
                      href={step.image.src}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-md border border-slate-300"
                    >
                      <img
                        src={step.image.src}
                        alt={step.image.alt}
                        loading="lazy"
                        decoding="async"
                        className="block h-auto w-full"
                      />
                      <span className="sr-only">Buka gambar ukuran penuh di tab baru</span>
                    </a>
                  </figure>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {topic.tips && topic.tips.length > 0 && (
        <section aria-labelledby="tips-title" className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h2 id="tips-title" className="flex items-center gap-2 text-base font-semibold text-amber-950">
            <Lightbulb className="h-4 w-4" aria-hidden="true" /> Perlu diketahui
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-950">
            {topic.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>
      )}

      {topic.problems && topic.problems.length > 0 && (
        <section aria-labelledby="problems-title" className="space-y-2">
          <h2 id="problems-title" className="text-xl font-semibold text-slate-900">
            Jika ada masalah
          </h2>
          <div className="space-y-2">
            {topic.problems.map((p) => (
              <details key={p.problem} className="rounded-lg border border-slate-200 bg-white">
                <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-medium text-slate-900">
                  {p.problem}
                </summary>
                <p className="border-t border-slate-200 px-4 py-3 text-sm text-slate-700">{p.fix}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section aria-labelledby="related-title" className="space-y-2">
          <h2 id="related-title" className="text-base font-semibold text-slate-900">
            Baca selanjutnya
          </h2>
          <ul className="flex flex-wrap gap-2">
            {related.map((t) => (
              <li key={t!.id}>
                <Link to={`/guide/${t!.id}`} className={secondaryButton}>
                  {t!.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav aria-label={`Berpindah di ${orderLabel}`} className="flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-between">
        {prev ? (
          <Link to={`/guide/${prev.id}`} className={secondaryButton}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={`/guide/${next.id}`} className={secondaryButton}>
            {next.title} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </nav>
    </article>
  );
}
