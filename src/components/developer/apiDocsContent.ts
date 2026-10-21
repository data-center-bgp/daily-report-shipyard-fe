import tablesData from "./data/tables.json";
import postmanCollection from "./data/shipyard-report.postman_collection.json?raw";
import postmanEnvironment from "./data/shipyard-report.postman_environment.json?raw";

// The documentation page is deliberately self-contained (this folder plus one
// route and one sidebar entry) so it can be lifted into its own documentation
// project later without untangling it from the app.

export const SCHEMA = tablesData.schema;

/** The deployed function's address, following whichever Supabase project this build points at. */
export const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shipyard-report`;

export const TABLES: { table: string; columns: string[] }[] = tablesData.tables;
export const TABLES_GENERATED = tablesData.generated;

export const DOWNLOADS = {
  collection: {
    filename: "shipyard-report.postman_collection.json",
    content: postmanCollection,
  },
  environment: {
    filename: "shipyard-report.postman_environment.json",
    content: postmanEnvironment,
  },
};

// Invented sample data on purpose — real rows never belong in documentation.
const sampleProject = {
  id: 1,
  created_at: "2026-07-21T01:41:06.354Z",
  updated_at: "2026-07-28T03:29:22.559Z",
  deleted_at: null,
  project_name: "Example Company-EXAMPLE VESSEL-Repair-2026-01",
  vessel_id: 12,
  readiness_form_id: 3,
  user_id: 2,
  docking_type: "Repair",
};

export type FieldKind = "text" | "number" | "table" | "check";

export interface EndpointField {
  name: string;
  kind: FieldKind;
  value?: string;
  placeholder?: string;
  /** true = part of the URL path, false/absent = a query option. */
  inPath?: boolean;
}

export interface Endpoint {
  id: string;
  title: string;
  /** Path after the base URL; {name} marks a path field. */
  path: string;
  description: string;
  options?: { name: string; meaning: string }[];
  fields?: EndpointField[];
  status: string;
  response: unknown;
}

export interface EndpointGroup {
  id: string;
  label: string;
  endpoints: Endpoint[];
}

export const ENDPOINT_GROUPS: EndpointGroup[] = [
  {
    id: "start",
    label: "1. Start here",
    endpoints: [
      {
        id: "whoami",
        title: "Who am I? (key info)",
        path: "",
        description:
          "Returns the name the key was issued to, when it expires (null means never) and the schemas it may read. Use it to check that a key works.",
        status: "200 OK",
        response: { caller: "supervisor", expires_at: null, schemas: [SCHEMA] },
      },
      {
        id: "schema",
        title: "List tables in a schema",
        path: "/{schema}",
        description:
          "Every table in the schema with its columns and exact row count. Takes about a second.",
        fields: [{ name: "schema", kind: "text", value: SCHEMA, inPath: true }],
        status: "200 OK",
        response: {
          schema: SCHEMA,
          tables: [
            {
              table: "projects",
              rows: 72,
              columns: Object.keys(sampleProject),
            },
            {
              table: "vessel",
              rows: 130,
              columns: ["id", "created_at", "updated_at", "deleted_at", "name", "type", "company"],
            },
          ],
        },
      },
    ],
  },
  {
    id: "read",
    label: "2. Read a table",
    endpoints: [
      {
        id: "rows",
        title: "Get a table's rows",
        path: "/{schema}/{table}",
        description:
          "Rows ordered by id, one page at a time. Use the options to page through, filter by time or include removed rows.",
        options: [
          { name: "limit", meaning: "Rows per page. 1 to 5000. Default 1000." },
          { name: "offset", meaning: "Where to start. 0 or more. Default 0." },
          {
            name: "updated_since",
            meaning:
              "Only rows created or changed after this ISO date or time, e.g. 2026-10-01T00:00:00Z.",
          },
          {
            name: "include_deleted",
            meaning: "true to also return rows removed in the app. Default: hidden.",
          },
        ],
        fields: [
          { name: "schema", kind: "text", value: SCHEMA, inPath: true },
          { name: "table", kind: "table", value: "projects", inPath: true },
          { name: "limit", kind: "number", value: "5" },
          { name: "offset", kind: "number", value: "0" },
          { name: "updated_since", kind: "text", value: "", placeholder: "optional" },
          { name: "include_deleted", kind: "check" },
        ],
        status: "200 OK",
        response: {
          schema: SCHEMA,
          table: "projects",
          total: 72,
          limit: 100,
          offset: 0,
          returned: 72,
          next_offset: null,
          data: [sampleProject],
        },
      },
    ],
  },
];

export const KEY_DURATIONS = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "permanent", label: "Permanent" },
] as const;

export type KeyDurationId = (typeof KEY_DURATIONS)[number]["id"];

export const KEY_ERRORS = [
  ["401 Missing or invalid API key", "No key was sent, or it is wrong or has been edited."],
  ["401 This API key has expired", "The expiry time has passed. Ask for a new key."],
  ["401 This API key has been revoked", "It was cancelled before it expired. Ask for a new key."],
  ["404 Unknown schema or table", "The name doesn't exist, or your key isn't allowed to read it."],
] as const;

export const STATUS_ERRORS = [
  ["400", "Bad limit (1–5000), offset (0 or more) or updated_since (ISO date or time)."],
  ["401", "Missing, wrong, expired or revoked key. The message says which."],
  ["404", "Unknown schema or table — also when your key isn't allowed that schema."],
  ["405", "Anything other than GET."],
  ["500", "A problem on our side. Try again; if it keeps happening, tell your administrator."],
] as const;

export const FAQ = [
  [
    "I get 401 — what's wrong?",
    "Check the message: a missing or invalid key, an expired key and a revoked key each have their own. Make sure the key is in the x-api-key header with no extra spaces. If it has expired or was revoked, ask for a new one.",
  ],
  [
    "How do I download a whole table?",
    "Request it with limit=5000 and keep going with offset=<next_offset> until next_offset is null. The Postman collection does the bookkeeping for you — keep sending \"Get rows (next page)\".",
  ],
  [
    "How do I get only what changed since my last pull?",
    "Use updated_since with the time of your last pull, for example ?updated_since=2026-10-01T00:00:00Z. Add include_deleted=true if you also need to know what was removed.",
  ],
  [
    "Why are prices text, not numbers?",
    "Columns stored as numeric are returned as strings so decimals are never rounded. Convert them in your tool if you need to calculate with them.",
  ],
  [
    "Will this slow down the app for the shipyard team?",
    "No. It only reads, through its own read-only database login that is limited to a few connections and a short query time, so it can't interrupt the work in the app.",
  ],
  ["Can it change data?", "No. Only GET is accepted, and the database login behind it can't write."],
  [
    "Who do I contact?",
    "Your system administrator — for new, replacement or cancelled keys, access to another schema, or anything that looks wrong in the data.",
  ],
] as const;
