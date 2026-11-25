import { adminTopics } from "./topics.admin";
import { dataTopics } from "./topics.data";
import { financeTopics } from "./topics.finance";
import { planningTopics } from "./topics.planning";
import { projectTopics } from "./topics.projects";
import { startTopics } from "./topics.start";
import { workTopics } from "./topics.work";
import type { GuideRole, GuideRolePath, GuideTopic } from "./types";

export * from "./types";

// In the order they should be read.
export const GUIDE_TOPICS: GuideTopic[] = [
  ...startTopics,
  ...planningTopics,
  ...projectTopics,
  ...workTopics,
  ...financeTopics,
  ...dataTopics,
  ...adminTopics,
];

export const topicById = (id: string | undefined): GuideTopic | undefined =>
  GUIDE_TOPICS.find((t) => t.id === id);

// Does this role carry out the task (not merely look at the result)?
export const roleDoesTopic = (topic: GuideTopic, role: GuideRole | undefined) =>
  topic.roles === "all" || (!!role && topic.roles.includes(role));

// What each role should read first, in order. Master reads everything.
export const GUIDE_ROLE_PATHS: GuideRolePath[] = [
  {
    role: "SHIPPING",
    title: "Shipping",
    intro:
      "Anda merencanakan docking lebih awal: PPIC memeriksa plan Anda, lalu mengubahnya menjadi project. Anda juga memverifikasi pekerjaan yang selesai dan memutuskan permintaan additional work order. Di tempat lain Anda hanya bisa melihat, tidak bisa mengubah, kecuali form kesiapan dari project yang berasal dari plan Anda.",
    topics: [
      "sign-in-and-menu",
      "plan-create",
      "plan-import",
      "plan-submit-fix",
      "plan-follow",
      "readiness-fill",
      "verify-work",
      "wo-additional-approve",
      "alerts-and-dashboard",
      "export-data",
      "activity-log",
    ],
  },
  {
    role: "PPIC",
    title: "PPIC",
    intro:
      "Anda memeriksa plan dari Shipping, mengubahnya menjadi project, merencanakan work detail, dan menyiapkan BASTP.",
    topics: [
      "sign-in-and-menu",
      "plan-review",
      "plan-convert",
      "project-create",
      "readiness-fill",
      "wo-create",
      "wd-add",
      "wd-edit",
      "bastp-create",
      "bastp-materials",
      "import-data",
      "export-data",
      "master-data",
      "alerts-and-dashboard",
    ],
  },
  {
    role: "HSSE",
    title: "HSSE",
    intro:
      "Anda meninjau form kesiapan setiap kapal dan menandatanganinya. Anda bisa melihat plan, project, dan pekerjaan, tetapi tidak bisa mengubahnya.",
    topics: [
      "sign-in-and-menu",
      "readiness-review",
      "plan-follow",
      "alerts-and-dashboard",
    ],
  },
  {
    role: "PRODUCTION",
    title: "Production",
    intro:
      "Anda mengisi bagaimana setiap tugas dikerjakan, melaporkan progres, dan menyiapkan BASTP.",
    topics: [
      "sign-in-and-menu",
      "wd-edit",
      "progress-report",
      "wo-create",
      "bastp-create",
      "bastp-materials",
      "export-data",
      "alerts-and-dashboard",
    ],
  },
  {
    role: "FINANCE",
    title: "Finance",
    intro: "Anda membuat invoice dari BASTP yang sudah siap, dan menandainya sebagai sudah dibayar.",
    topics: ["sign-in-and-menu", "invoice-create", "alerts-and-dashboard", "activity-log"],
  },
  {
    role: "ADMIN",
    title: "Admin",
    intro: "Anda membuat project, work order, dan BASTP, serta bisa mengekspor data.",
    topics: [
      "sign-in-and-menu",
      "project-create",
      "wo-create",
      "bastp-create",
      "bastp-materials",
      "export-data",
      "alerts-and-dashboard",
    ],
  },
  {
    role: "ADMIN_SHIPPING",
    title: "Admin Shipping",
    intro:
      "Anda membuat project, work order, dan work detail, serta bisa mengisi form kesiapan dan mengimpor data.",
    topics: [
      "sign-in-and-menu",
      "project-create",
      "readiness-fill",
      "wo-create",
      "wd-add",
      "import-data",
      "alerts-and-dashboard",
    ],
  },
  {
    role: "MANAGER",
    title: "Manager",
    intro:
      "Anda bisa melihat semuanya tetapi tidak bisa mengubah apa pun. Topik-topik ini menunjukkan di mana harus melihat.",
    topics: [
      "sign-in-and-menu",
      "alerts-and-dashboard",
      "plan-follow",
      "export-data",
      "activity-log",
    ],
  },
  {
    role: "MASTER",
    title: "Master",
    intro:
      "Anda bisa mengerjakan hampir semuanya dan juga menjalankan administrasi. Baca topik untuk pekerjaan yang Anda awasi, lalu topik administrasi.",
    topics: GUIDE_TOPICS.map((t) => t.id),
  },
];

export const rolePathFor = (role: GuideRole | undefined) =>
  GUIDE_ROLE_PATHS.find((p) => p.role === role);

// Case-insensitive match over a topic's title, summary and steps.
export function searchTopics(query: string, topics: GuideTopic[]): GuideTopic[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return topics;
  return topics.filter((t) => {
    const haystack = [
      t.title,
      t.summary,
      t.before ?? "",
      ...t.steps.flatMap((s) => [s.title, s.detail ?? ""]),
      ...(t.tips ?? []),
      ...(t.problems ?? []).flatMap((p) => [p.problem, p.fix]),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}
