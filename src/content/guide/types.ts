// The in-app user guide. Content lives in plain files (one per group) so it can
// be edited without touching any screen. It is written from
// docs/USER_GUIDELINE_SOURCE.md: when that file changes, change the matching
// topic here in the same commit.
//
// The guide is written in Indonesian. Names of menus, buttons, pages and roles
// stay exactly as they appear on screen (English), so people can find them.

export type GuideRole =
  | "MASTER"
  | "PPIC"
  | "PRODUCTION"
  | "ADMIN"
  | "FINANCE"
  | "MANAGER"
  | "HSSE"
  | "ADMIN_SHIPPING"
  | "SHIPPING";

export type GuideGroupId =
  | "start"
  | "planning"
  | "projects"
  | "work"
  | "finance"
  | "data"
  | "admin";

export interface GuideImage {
  // File under public/guide/, written as "/guide/<name>.png".
  src: string;
  // Says what the picture shows, for people who cannot see it.
  alt: string;
}

export interface GuideStep {
  title: string;
  // One or two sentences saying how, or what to expect. Plain text.
  detail?: string;
  // A screenshot of this step. Optional: steps without one read fine.
  image?: GuideImage;
}

export interface GuideProblem {
  problem: string;
  fix: string;
}

export interface GuideTopic {
  // Used in the address: /guide/<id>
  id: string;
  title: string;
  // One line shown in lists.
  summary: string;
  group: GuideGroupId;
  // Who does this task. "all" means every role.
  roles: GuideRole[] | "all";
  // What must be true before the first step.
  before?: string;
  steps: GuideStep[];
  tips?: string[];
  problems?: GuideProblem[];
  // The screen where the task happens. Shown as a button to the roles that do it.
  openIn?: { label: string; href: string };
  // Other topic ids worth reading next.
  related?: string[];
}

export interface GuideRolePath {
  role: GuideRole;
  // How the role is called in the guide.
  title: string;
  intro: string;
  // Topic ids in the order a person in this role should read them.
  topics: string[];
}

export const GUIDE_GROUPS: { id: GuideGroupId; title: string; blurb: string }[] = [
  { id: "start", title: "Memulai", blurb: "Masuk, menu, alert, dan dashboard." },
  { id: "planning", title: "Docking Plan", blurb: "Shipping merencanakan docking lebih awal, PPIC memeriksanya." },
  { id: "projects", title: "Project dan kesiapan kapal", blurb: "Satu project untuk setiap docking, dan form kesiapan yang disetujui HSSE." },
  { id: "work", title: "Work order dan progres", blurb: "Dari work order sampai pekerjaan selesai dan terverifikasi." },
  { id: "finance", title: "BASTP dan invoice", blurb: "Serah terima pekerjaan dan penagihannya." },
  { id: "data", title: "Impor dan ekspor", blurb: "Memasukkan dan mengeluarkan data lewat spreadsheet." },
  { id: "admin", title: "Administrasi", blurb: "Master data, pengguna, dan activity log." },
];

export const GUIDE_ROLE_LABEL: Record<GuideRole, string> = {
  MASTER: "Master",
  PPIC: "PPIC",
  PRODUCTION: "Production",
  ADMIN: "Admin",
  FINANCE: "Finance",
  MANAGER: "Manager",
  HSSE: "HSSE",
  ADMIN_SHIPPING: "Admin Shipping",
  SHIPPING: "Shipping",
};
