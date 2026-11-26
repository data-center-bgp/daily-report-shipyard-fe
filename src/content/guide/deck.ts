// Presentation decks for the in-app guide. A deck is a list of slides that the
// presenter screen (components/guide/GuidePresenter) shows one at a time.
//
// Nothing here is written twice: the slides of every role deck are cut from the
// same topics the step-by-step pages use (topics.*.ts), so when a topic changes,
// its slides change with it. Only the overview deck has hand-written slides,
// and they are kept short and in Indonesian like the rest of the guide.

import {
  GUIDE_GROUPS,
  GUIDE_ROLE_PATHS,
  GUIDE_TOPICS,
  topicById,
} from "./index";
import {
  GUIDE_ROLE_LABEL,
  type GuideImage,
  type GuideRole,
  type GuideTopic,
} from "./types";

interface SlideBase {
  // The topic this slide belongs to. The agenda uses it to jump to a topic and
  // the slide list uses it to group slides.
  topicId?: string;
}

export type Slide = SlideBase &
  (
    | { kind: "title"; title: string; subtitle?: string; note?: string }
    | {
        kind: "section";
        eyebrow: string;
        title: string;
        summary: string;
        // The roles that do this task, shown as chips.
        who: string[];
        before?: string;
        // Which topic of the deck this is, shown as a large number.
        position?: { no: number; total: number };
      }
    | { kind: "agenda"; title: string; items: { label: string; topicId?: string }[] }
    | {
        kind: "flow";
        title: string;
        lead?: string;
        stages: { name: string; who: string; what: string }[];
      }
    | {
        kind: "cards";
        title: string;
        lead?: string;
        // A card with an icon shows it; one without shows the first letter of its title.
        cards: { title: string; body: string; icon?: "ship" | "users" | "history" }[];
      }
    | {
        kind: "steps";
        eyebrow: string;
        title: string;
        items: { no: number; title: string; detail?: string }[];
      }
    | {
        kind: "shot";
        eyebrow: string;
        no: number;
        total: number;
        title: string;
        detail?: string;
        image: GuideImage;
      }
    | { kind: "tips"; eyebrow: string; title: string; items: string[] }
    | {
        kind: "problems";
        eyebrow: string;
        title: string;
        items: { problem: string; fix: string }[];
      }
    | { kind: "closing"; title: string; body: string; link?: { label: string; href: string } }
  );

export interface GuideDeck {
  id: string;
  title: string;
  // One line on the chooser page.
  blurb: string;
  // Who the deck is for, shown as a tag on the chooser page.
  audience: string;
  // The role whose own deck this is, so the chooser can put it first.
  role?: GuideRole;
  slides: Slide[];
}

// --- helpers ---------------------------------------------------------------

const firstSentence = (text: string) => {
  const end = text.search(/[.!?](\s|$)/);
  return end === -1 ? text : text.slice(0, end + 1);
};

// Splits items into slides that stay readable: at most `maxItems` per slide and
// roughly `maxChars` of text. The first item of a slide is always kept.
function chunk<T>(items: T[], maxItems: number, maxChars: number, size: (item: T) => number): T[][] {
  const out: T[][] = [];
  let current: T[] = [];
  let chars = 0;
  for (const item of items) {
    const s = size(item);
    if (current.length >= maxItems || (current.length > 0 && chars + s > maxChars)) {
      out.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += s;
  }
  if (current.length > 0) out.push(current);
  return out;
}

function topicSlides(topic: GuideTopic, position?: { no: number; total: number }): Slide[] {
  const topicId = topic.id;
  const group = GUIDE_GROUPS.find((g) => g.id === topic.group)?.title ?? "";
  const who =
    topic.roles === "all" ? ["Semua role"] : topic.roles.map((r) => GUIDE_ROLE_LABEL[r]);

  const slides: Slide[] = [
    {
      kind: "section",
      topicId,
      eyebrow: group,
      title: topic.title,
      summary: topic.summary,
      who,
      before: topic.before,
      position,
    },
  ];

  // A step with a screenshot gets a slide of its own. Steps without one are
  // gathered, a few at a time, so the deck does not turn into a wall of slides.
  let pending: { no: number; title: string; detail?: string }[] = [];
  const flush = () => {
    for (const part of chunk(pending, 3, 520, (s) => s.title.length + (s.detail?.length ?? 0))) {
      const first = part[0].no;
      const last = part[part.length - 1].no;
      slides.push({
        kind: "steps",
        topicId,
        eyebrow: topic.title,
        title: first === last ? `Langkah ${first}` : `Langkah ${first} sampai ${last}`,
        items: part,
      });
    }
    pending = [];
  };
  topic.steps.forEach((step, i) => {
    if (step.image) {
      flush();
      slides.push({
        kind: "shot",
        topicId,
        eyebrow: topic.title,
        no: i + 1,
        total: topic.steps.length,
        title: step.title,
        detail: step.detail,
        image: step.image,
      });
    } else {
      pending.push({ no: i + 1, title: step.title, detail: step.detail });
    }
  });
  flush();

  if (topic.tips && topic.tips.length > 0) {
    chunk(topic.tips, 4, 560, (t) => t.length).forEach((items) =>
      slides.push({ kind: "tips", topicId, eyebrow: topic.title, title: "Perlu diketahui", items }),
    );
  }
  if (topic.problems && topic.problems.length > 0) {
    chunk(topic.problems, 2, 560, (p) => p.problem.length + p.fix.length).forEach((items) =>
      slides.push({ kind: "problems", topicId, eyebrow: topic.title, title: "Jika ada masalah", items }),
    );
  }
  return slides;
}

const closing = (body: string): Slide => ({
  kind: "closing",
  title: "Terima kasih",
  body,
  link: { label: "Buka panduan langkah demi langkah", href: "/guide" },
});

// --- the overview deck (hand-written) --------------------------------------

function overviewDeck(): GuideDeck {
  const signIn = topicById("sign-in-and-menu");
  const slides: Slide[] = [
    {
      kind: "title",
      title: "Cara memakai Daily Report Shipyard",
      subtitle: "Dari rencana docking sampai pembayaran, dalam satu sistem",
      note: "Barokah Galangan Perkasa",
    },
    {
      kind: "cards",
      title: "Untuk apa sistem ini?",
      cards: [
        {
          title: "Satu tempat untuk satu docking",
          body: "Rencana, project, work order, progres, BASTP, dan invoice sebuah kapal ada di sistem yang sama. Semua orang melihat data yang sama.",
          icon: "ship",
        },
        {
          title: "Setiap tugas ada pemiliknya",
          body: "Anda hanya melihat menu dan tombol yang boleh dipakai oleh role Anda. Role lain tetap bisa melihat hasilnya.",
          icon: "users",
        },
        {
          title: "Semua tercatat",
          body: "Activity log menyimpan siapa melakukan apa, dan kapan.",
          icon: "history",
        },
      ],
    },
    {
      kind: "flow",
      title: "Perjalanan satu docking",
      lead: "Delapan tahap, dari rencana sampai uang masuk. Setiap tahap dikerjakan oleh role yang bertanggung jawab.",
      stages: [
        {
          name: "Docking plan",
          who: "Shipping",
          what: "Merencanakan docking sekitar dua bulan sebelumnya, lengkap dengan work order dan work detail.",
        },
        {
          name: "Review plan",
          who: "PPIC",
          what: "Menyetujui plan, atau mengembalikannya dengan catatan.",
        },
        {
          name: "Konversi",
          who: "PPIC",
          what: "Plan yang disetujui menjadi project, work order, dan work detail.",
        },
        {
          name: "Form kesiapan",
          who: "Shipping dan HSSE",
          what: "Shipping mengisi, HSSE meninjau dan menandatangani.",
        },
        {
          name: "Pelaksanaan",
          who: "PPIC dan Production",
          what: "PPIC merencanakan pekerjaan, Production mengisi cara pengerjaan dan melaporkan progres.",
        },
        {
          name: "Verifikasi",
          who: "Shipping",
          what: "Menyetujui pekerjaan yang sudah mencapai 100%.",
        },
        {
          name: "BASTP",
          who: "PPIC, Production, Admin",
          what: "Serah terima pekerjaan yang sudah selesai.",
        },
        {
          name: "Invoice",
          who: "Finance",
          what: "Memberi harga pada BASTP yang siap, lalu menandai yang sudah dibayar.",
        },
      ],
    },
    {
      kind: "cards",
      title: "Siapa mengerjakan apa",
      cards: GUIDE_ROLE_PATHS.map((p) => ({ title: p.title, body: firstSentence(p.intro) })),
    },
    ...(signIn ? topicSlides(signIn) : []),
    {
      kind: "steps",
      eyebrow: "Panduan di dalam sistem",
      title: "Kalau Anda lupa caranya",
      items: [
        {
          no: 1,
          title: "Buka Panduan Pengguna",
          detail: "Menunya ada di bagian Bantuan, di sebelah kiri.",
        },
        {
          no: 2,
          title: "Mulai dari jalur untuk role Anda",
          detail: "Setiap role punya urutan topik yang sebaiknya dibaca lebih dulu.",
        },
        {
          no: 3,
          title: "Atau cari dengan kata kunci",
          detail: "Contoh: impor, invoice, kesiapan.",
        },
        {
          no: 4,
          title: "Mau menjelaskannya ke orang lain?",
          detail: "Buka Mode presentasi dan pilih paket slide yang sesuai.",
        },
      ],
    },
    closing("Mulailah dari jalur untuk role Anda. Setiap topik berisi langkah demi langkah dan gambarnya."),
  ];
  return {
    id: "ikhtisar",
    title: "Ikhtisar sistem",
    blurb: "Untuk apa sistem ini, perjalanan satu docking, dan siapa mengerjakan apa. Cocok untuk pengenalan.",
    audience: "Semua orang",
    slides,
  };
}

// --- decks built from the guide topics -------------------------------------

function topicDeck(opts: {
  id: string;
  title: string;
  subtitle: string;
  blurb: string;
  audience: string;
  role?: GuideRole;
  intro?: string;
  topicIds: string[];
}): GuideDeck {
  const topics = opts.topicIds.map(topicById).filter((t): t is GuideTopic => !!t);
  const slides: Slide[] = [
    { kind: "title", title: opts.title, subtitle: opts.subtitle, note: opts.intro },
    {
      kind: "agenda",
      title: "Yang akan kita bahas",
      items: topics.map((t) => ({ label: t.title, topicId: t.id })),
    },
    ...topics.flatMap((t, i) => topicSlides(t, { no: i + 1, total: topics.length })),
    closing("Semua topik ini bisa dibaca lagi kapan saja di Panduan Pengguna."),
  ];
  return {
    id: opts.id,
    title: opts.title,
    blurb: opts.blurb,
    audience: opts.audience,
    role: opts.role,
    slides,
  };
}

const roleDeckId = (role: GuideRole) => role.toLowerCase().replace(/_/g, "-");

export const ALL_DECK_ID = "semua";

// MASTER reads everything, so that role gets the all-topics deck below.
export const deckIdForRole = (role: GuideRole | undefined) =>
  !role ? undefined : role === "MASTER" ? ALL_DECK_ID : roleDeckId(role);

let cache: GuideDeck[] | null = null;

// Built on first use, because the slides are cut from every topic.
export function getDecks(): GuideDeck[] {
  if (cache) return cache;
  const roleDecks = GUIDE_ROLE_PATHS.filter((p) => p.role !== "MASTER").map((p) =>
    topicDeck({
      id: roleDeckId(p.role),
      title: `Panduan untuk ${p.title}`,
      subtitle: `Tugas dan langkah-langkah untuk role ${p.title}`,
      blurb: firstSentence(p.intro),
      audience: `Role ${p.title}`,
      role: p.role,
      intro: p.intro,
      topicIds: p.topics,
    }),
  );
  const all = topicDeck({
    id: ALL_DECK_ID,
    title: "Semua topik panduan",
    subtitle: "Seluruh langkah demi langkah di Daily Report Shipyard",
    blurb: "Semua topik panduan, dari login sampai administrasi. Jalur untuk role Master.",
    audience: "Master dan siapa pun yang butuh gambaran penuh",
    role: "MASTER",
    topicIds: GUIDE_TOPICS.map((t) => t.id),
  });
  cache = [overviewDeck(), ...roleDecks, all];
  return cache;
}

export const deckById = (id: string | undefined) => getDecks().find((d) => d.id === id);

// What a slide is called in the slide list.
export function slideLabel(slide: Slide): string {
  switch (slide.kind) {
    // The slide list already groups slides under their topic, so say what this one is.
    case "section":
      return `Pembuka: ${slide.title}`;
    case "steps":
      return slide.items.length === 1 ? `${slide.title}: ${slide.items[0].title}` : slide.title;
    case "problems":
      return `${slide.title}: ${slide.items[0].problem}`;
    default:
      return slide.title;
  }
}
