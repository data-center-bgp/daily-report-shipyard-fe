import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Presentation } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import type { GuideRole } from "../../content/guide";
import { deckIdForRole, getDecks } from "../../content/guide/deck";
import { primaryButton } from "../plans/planStatus";

const pageShell = "mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:py-8";

const keys: { keys: string; does: string }[] = [
  { keys: "Panah kanan, Spasi, Page Down", does: "Slide berikutnya" },
  { keys: "Panah kiri, Page Up", does: "Slide sebelumnya" },
  { keys: "Home, End", does: "Slide pertama, slide terakhir" },
  { keys: "G", does: "Daftar slide, untuk lompat ke topik tertentu" },
  { keys: "F", does: "Layar penuh" },
  { keys: "Esc", does: "Keluar dari presentasi" },
];

export default function GuidePresentHome() {
  const { profile } = useAuth();
  const role = profile?.role as GuideRole | undefined;
  const mine = deckIdForRole(role);

  // The deck for the signed-in role first, then the rest in their usual order.
  const decks = useMemo(() => {
    const all = getDecks();
    const own = all.find((d) => d.id === mine);
    return own ? [own, ...all.filter((d) => d.id !== own.id)] : all;
  }, [mine]);

  return (
    <div className={`${pageShell} space-y-6`}>
      <header className="space-y-2">
        <Link
          to="/guide"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-blue-800 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali ke panduan
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 sm:text-3xl">
          <Presentation className="h-7 w-7 text-blue-800" aria-hidden="true" />
          Mode presentasi
        </h1>
        <p className="max-w-3xl text-sm text-slate-700 sm:text-base">
          Pilih paket slide, lalu mulai. Isinya diambil dari panduan yang sama, jadi otomatis ikut
          berubah ketika panduan diperbarui. Bisa dibuka sendiri untuk belajar, atau ditampilkan di
          layar saat Anda menjelaskannya ke orang lain.
        </p>
      </header>

      <section aria-labelledby="decks-title" className="space-y-3">
        <h2 id="decks-title" className="text-lg font-semibold text-slate-900">
          Paket slide
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {decks.map((d) => (
            <li
              key={d.id}
              className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                {d.id === mine && (
                  <span className="inline-flex rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    Untuk role Anda
                  </span>
                )}
                <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {d.audience}
                </span>
                <span className="text-xs text-slate-600">{d.slides.length} slide</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-slate-900">{d.title}</h3>
                <p className="mt-1 text-sm text-slate-700">{d.blurb}</p>
              </div>
              <div>
                <Link to={`/guide/present/${d.id}`} className={primaryButton}>
                  <Presentation className="h-4 w-4" aria-hidden="true" /> Mulai presentasi
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="keys-title" className="space-y-2">
        <h2 id="keys-title" className="text-lg font-semibold text-slate-900">
          Tombol yang berguna saat presentasi
        </h2>
        <dl className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {keys.map((k) => (
            <div key={k.keys} className="grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-[18rem_1fr]">
              <dt className="font-medium text-slate-900">{k.keys}</dt>
              <dd className="text-slate-700">{k.does}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-slate-700">
          Di HP atau tablet, geser ke kiri atau kanan untuk berpindah slide. Tekan Perbesar gambar
          untuk melihat tangkapan layar dalam ukuran penuh.
        </p>
      </section>
    </div>
  );
}
