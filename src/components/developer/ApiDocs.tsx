import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  Braces,
  Check,
  ChevronDown,
  Copy,
  Download,
  KeyRound,
  KeySquare,
  Loader2,
  Play,
  Search,
  ShieldCheck,
  Table2,
} from "lucide-react";
import {
  BASE_URL,
  DOWNLOADS,
  ENDPOINT_GROUPS,
  FAQ,
  KEY_ERRORS,
  SCHEMA,
  STATUS_ERRORS,
  TABLES,
  TABLES_GENERATED,
  type Endpoint,
  type EndpointField,
} from "./apiDocsContent";
import KeyManager from "./KeyManager";

type TabId = "overview" | "keys" | "manage" | "guide" | "tables" | "help";

const TABS: { id: TabId; label: string; icon: typeof BookOpen }[] = [
  { id: "overview", label: "Overview", icon: BookOpen },
  { id: "keys", label: "Access keys", icon: KeyRound },
  { id: "manage", label: "Manage keys", icon: KeySquare },
  { id: "guide", label: "Integration guide", icon: Braces },
  { id: "tables", label: "Table reference", icon: Table2 },
  { id: "help", label: "Help", icon: ShieldCheck },
];

const inlineCode =
  "rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[12.5px] text-gray-800";

function C({ children }: { children: ReactNode }) {
  return <code className={inlineCode}>{children}</code>;
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg bg-white p-4 shadow sm:p-6 ${className}`}>{children}</div>
  );
}

// ── Copy button ─────────────────────────────────────────────────────────────
function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API needs a secure context; fall back for plain http.
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

// ── Code blocks ─────────────────────────────────────────────────────────────
function JsonBlock({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) nodes.push(text.slice(last, at));
    if (m[1]) {
      nodes.push(
        <span key={at} className={m[2] ? "text-sky-300" : "text-emerald-300"}>
          {m[1]}
        </span>,
      );
      if (m[2]) nodes.push(m[2]);
    } else {
      nodes.push(
        <span key={at} className={m[3] ? "text-pink-300" : "text-amber-300"}>
          {m[0]}
        </span>,
      );
    }
    last = at + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <CodeShell>{nodes}</CodeShell>;
}

function CodeShell({ children }: { children: ReactNode }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-lg bg-slate-900 p-4 font-mono text-[12.5px] leading-relaxed text-slate-100">
      {children}
    </pre>
  );
}

function CodeLabel({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-1.5 mt-4 flex items-center justify-between gap-2">
      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-gray-500">
        {title}
      </span>
      {action}
    </div>
  );
}

function UrlBar({ url }: { url: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
      <code className="min-w-0 flex-1 break-all px-1 font-mono text-[13px] text-gray-800">{url}</code>
      <CopyButton text={url} label="Copy URL" />
    </div>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 align-top text-gray-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Endpoint card with a live "send request" box ────────────────────────────
type FieldValues = Record<string, string | boolean>;

function initialValues(fields: EndpointField[] = []): FieldValues {
  const values: FieldValues = {};
  for (const f of fields) values[f.name] = f.kind === "check" ? false : (f.value ?? "");
  return values;
}

function buildUrl(endpoint: Endpoint, values: FieldValues): string {
  let path = endpoint.path;
  const query: string[] = [];
  for (const f of endpoint.fields ?? []) {
    const raw = values[f.name];
    const v = typeof raw === "boolean" ? (raw ? "true" : "") : String(raw ?? "").trim();
    if (f.inPath) path = path.replace(`{${f.name}}`, encodeURIComponent(v));
    else if (v !== "") query.push(`${f.name}=${encodeURIComponent(v)}`);
  }
  return BASE_URL + path + (query.length ? `?${query.join("&")}` : "");
}

interface TryResult {
  status: number;
  ms: number;
  size: number;
  text: string;
  truncated: boolean;
}

function EndpointCard({ endpoint, apiKey, onNeedKey }: { endpoint: Endpoint; apiKey: string; onNeedKey: () => void }) {
  const [values, setValues] = useState<FieldValues>(() => initialValues(endpoint.fields));
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("Enter your key at the top of the page, then send.");
  const [result, setResult] = useState<TryResult | null>(null);

  const url = buildUrl(endpoint, values);
  const responseText = JSON.stringify(endpoint.response, null, 2);

  const send = async () => {
    if (!apiKey.trim()) {
      setMessage("Enter your API key in the box at the top first.");
      onNeedKey();
      return;
    }
    setSending(true);
    setMessage("Sending…");
    const started = performance.now();
    try {
      const res = await fetch(url, { headers: { "x-api-key": apiKey.trim(), Accept: "application/json" } });
      const raw = await res.text();
      let pretty = raw;
      try {
        pretty = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        // not JSON — show as is
      }
      const LIMIT = 8000;
      setResult({
        status: res.status,
        ms: Math.round(performance.now() - started),
        size: raw.length,
        text: pretty.length > LIMIT ? `${pretty.slice(0, LIMIT)}\n…` : pretty,
        truncated: pretty.length > LIMIT,
      });
      setMessage("");
    } catch {
      setResult(null);
      setMessage("Couldn't reach the API. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  const setField = (name: string, value: string | boolean) => setValues((prev) => ({ ...prev, [name]: value }));

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-3 sm:px-6">
        <span className="rounded-md bg-emerald-100 px-2.5 py-1 font-mono text-xs font-bold text-emerald-800">GET</span>
        <code className="min-w-0 flex-1 break-all font-mono text-[13px] font-semibold text-gray-900">{url}</code>
        <CopyButton text={url} label="Copy URL" />
      </div>

      <div className="space-y-1 px-4 py-4 sm:px-6">
        <h3 className="text-base font-semibold text-gray-900">{endpoint.title}</h3>
        <p className="text-sm text-gray-600">{endpoint.description}</p>

        {endpoint.options && (
          <div className="pt-2">
            <DataTable
              head={["Option", "Meaning"]}
              rows={endpoint.options.map((o) => [<C key={o.name}>{o.name}</C>, o.meaning])}
            />
          </div>
        )}

        <CodeLabel title="Headers" />
        <CodeShell>{"x-api-key: YOUR_API_KEY\nAccept: application/json"}</CodeShell>

        <CodeLabel
          title={`Response body (${endpoint.status})`}
          action={<CopyButton text={responseText} label="Copy JSON" />}
        />
        <JsonBlock text={responseText} />

        <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 sm:p-4">
          <div className="flex flex-wrap items-end gap-3">
            {(endpoint.fields ?? []).map((f) => (
              <FieldInput key={f.name} endpointId={endpoint.id} field={f} value={values[f.name]} onChange={setField} />
            ))}
            <button
              type="button"
              onClick={send}
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Send request
            </button>
          </div>
          {message && <p className="mt-3 text-xs text-gray-500">{message}</p>}
          {result && (
            <div className="mt-3">
              <p className="mb-2 flex flex-wrap items-center gap-2 font-mono text-xs text-gray-500">
                <span
                  className={`rounded px-2 py-0.5 font-bold ${
                    result.status < 400 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                  }`}
                >
                  {result.status}
                </span>
                {result.ms} ms · {(result.size / 1024).toFixed(1)} kB
                {result.truncated && " · showing the first part"}
              </p>
              <JsonBlock text={result.text} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldInput({
  endpointId,
  field,
  value,
  onChange,
}: {
  endpointId: string;
  field: EndpointField;
  value: string | boolean;
  onChange: (name: string, value: string | boolean) => void;
}) {
  const id = `${endpointId}-${field.name}`;
  const base =
    "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500";

  if (field.kind === "check") {
    return (
      <label htmlFor={id} className="flex items-center gap-2 pb-2 text-sm text-gray-700">
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(field.name, e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        {field.name}
      </label>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-semibold text-gray-500">
        {field.name}
      </label>
      {field.kind === "table" ? (
        <select id={id} value={String(value)} onChange={(e) => onChange(field.name, e.target.value)} className={base}>
          {TABLES.map((t) => (
            <option key={t.table}>{t.table}</option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={field.kind === "number" ? "number" : "text"}
          min={field.kind === "number" ? 0 : undefined}
          value={String(value)}
          placeholder={field.placeholder}
          onChange={(e) => onChange(field.name, e.target.value)}
          className={`${base} ${field.kind === "number" ? "w-28" : "w-44"}`}
        />
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
function downloadFile(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ApiDocs() {
  const [tab, setTab] = useState<TabId>("overview");
  const [groupId, setGroupId] = useState(ENDPOINT_GROUPS[0].id);
  const [apiKey, setApiKey] = useState("");
  const [tableQuery, setTableQuery] = useState("");

  const group = ENDPOINT_GROUPS.find((g) => g.id === groupId) ?? ENDPOINT_GROUPS[0];

  const filteredTables = useMemo(() => {
    const q = tableQuery.trim().toLowerCase();
    if (!q) return TABLES;
    return TABLES.filter(
      (t) => t.table.toLowerCase().includes(q) || t.columns.some((c) => c.toLowerCase().includes(q)),
    );
  }, [tableQuery]);

  const focusKey = () => document.getElementById("api-key-input")?.focus();
  const curl = `curl -H "x-api-key: YOUR_API_KEY" \\\n  "${BASE_URL}/${SCHEMA}/projects?limit=100"`;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold text-gray-900 sm:text-3xl">
          <Braces className="h-7 w-7 shrink-0 text-blue-600" />
          API Documentation
          <span className="rounded-full bg-blue-50 px-3 py-1 font-mono text-xs font-semibold text-blue-700">
            Shipyard Report API · Read-only JSON
          </span>
        </h1>
        <p className="mt-2 text-gray-600">
          Fetch the shipyard's daily-report data as JSON — projects, work orders, work details, progress, BASTP,
          invoices and more — without logging in to the app.
        </p>
      </div>

      {/* Tabs */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Sections">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              tab === id
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:text-blue-700"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <>
          <Card>
            <h2 className="text-lg font-semibold text-gray-900">Base URL</h2>
            <p className="mb-3 text-sm text-gray-600">
              Every request starts here. Send your key in the <C>x-api-key</C> header.
            </p>
            <UrlBar url={BASE_URL} />
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Format", "JSON"],
                ["Methods", "GET only (read-only)"],
                ["Authentication", "x-api-key header"],
                ["Page size", "up to 5,000 rows"],
                ["Schema", SCHEMA],
                ["Tables", `${TABLES.length} tables`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{k}</div>
                  <div className="mt-0.5 break-words font-semibold text-gray-900">{v}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Get started in 3 steps</h2>
            <ol className="space-y-3">
              {[
                [
                  "Get a key.",
                  <>
                    Ask your administrator. A key is either permanent or expires after a set time.{" "}
                    <button type="button" onClick={() => setTab("keys")} className="font-medium text-blue-600 hover:underline">
                      About access keys
                    </button>
                  </>,
                ],
                [
                  "Check that it works.",
                  <>
                    Call <C>GET /</C> — it returns the name the key was issued to, when it expires and which schemas it can read.
                  </>,
                ],
                [
                  "Read a table.",
                  <>
                    Call <C>GET /{SCHEMA}/&lt;table&gt;</C> and page through with <C>offset</C>.{" "}
                    <button type="button" onClick={() => setTab("guide")} className="font-medium text-blue-600 hover:underline">
                      Open the integration guide
                    </button>
                  </>,
                ],
              ].map(([title, body], i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <p className="text-sm text-gray-700">
                    <strong className="text-gray-900">{title as string}</strong> {body as ReactNode}
                  </p>
                </li>
              ))}
            </ol>
            <CodeLabel title="Example · cURL" action={<CopyButton text={curl} />} />
            <CodeShell>{curl}</CodeShell>
          </Card>

          <Card className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Try it in Postman or Apidog</h2>
              <p className="text-sm text-gray-600">Import the ready-made collection and every endpoint is set up for you.</p>
            </div>
            <button
              type="button"
              onClick={() => setTab("guide")}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Get the collection
            </button>
          </Card>
        </>
      )}

      {/* Access keys */}
      {tab === "keys" && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900">Access keys</h2>
          <p className="text-sm text-gray-600">
            Every request needs a key. Keys only allow reading data, and each key is limited to the schemas it was issued for.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Permanent key</div>
              <div className="font-semibold text-gray-900">Never expires</div>
              <p className="mt-1 text-sm text-gray-600">
                For people or systems that need standing access, like a dashboard. Kept by the administrator and cancelled by removing it.
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Expiring key</div>
              <div className="font-semibold text-gray-900">Stops working automatically</div>
              <p className="mt-1 text-sm text-gray-600">
                Starts with <C>srt_</C>. For one-off or temporary access — it works until the time it was issued for, then answers{" "}
                <C>401 This API key has expired</C>.
              </p>
            </div>
          </div>

          <h3 className="mt-6 text-base font-semibold text-gray-900">Sending your key</h3>
          <p className="text-sm text-gray-600">
            Put it in the <C>x-api-key</C> header (or as <C>Authorization: Bearer &lt;key&gt;</C>). Don't put it in the URL.
          </p>
          <div className="mt-2">
            <CodeShell>{"x-api-key: YOUR_API_KEY\n\n# or\nAuthorization: Bearer YOUR_API_KEY"}</CodeShell>
          </div>

          <h3 className="mt-6 text-base font-semibold text-gray-900">Checking when a key expires</h3>
          <p className="text-sm text-gray-600">
            Call <C>GET /</C>. The <C>expires_at</C> field is the expiry time, or <C>null</C> for a key that never expires.
          </p>

          <h3 className="mt-6 text-base font-semibold text-gray-900">Getting, replacing or cancelling a key</h3>
          <p className="text-sm text-gray-600">
            Create one yourself on the{" "}
            <button type="button" onClick={() => setTab("manage")} className="font-medium text-blue-600 hover:underline">
              Manage keys
            </button>{" "}
            tab: pick how long it should work (7, 30 or 90 days, or permanent) and copy it. The same tab lists every key made there and
            lets you revoke one. A revoked key stops working straight away, and revoking one never affects anyone else's.
          </p>

          <div className="my-4 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <p>
              <strong>Treat a key like a password.</strong> It can read all the data it was issued for. Don't share it in chat or
              email, don't commit it to code, and don't paste it into a website you don't trust. If you think it leaked, tell your
              administrator so it can be cancelled.
            </p>
          </div>

          <h3 className="mb-2 text-base font-semibold text-gray-900">If a key is rejected</h3>
          <DataTable
            head={["Response", "Meaning"]}
            rows={KEY_ERRORS.map(([r, m]) => [<C key={r}>{r}</C>, m])}
          />
        </Card>
      )}

      {/* Manage keys */}
      {tab === "manage" && <KeyManager />}

      {/* Integration guide */}
      {tab === "guide" && (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-gray-900">
                  Postman Collection v2.1
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-blue-700">
                    Also imports into Apidog
                  </span>
                </h2>
                <p className="text-sm text-gray-600">
                  Every endpoint and every table, with examples and checks, ready to run. No typing URLs by hand.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => downloadFile(DOWNLOADS.collection.filename, DOWNLOADS.collection.content)}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  <Download className="h-4 w-4" /> Download collection
                </button>
                <button
                  type="button"
                  onClick={() => downloadFile(DOWNLOADS.environment.filename, DOWNLOADS.environment.content)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <Download className="h-4 w-4" /> Download environment
                </button>
              </div>
            </div>
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-gray-600">
              <li>Import the collection (and, optionally, the environment) in Postman or Apidog.</li>
              <li>
                Set the <C>apiKey</C> variable to your key.
              </li>
              <li>
                Run <strong>Who am I?</strong> — it should return <C>200</C>.
              </li>
            </ol>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-gray-900">Try it from this page</h2>
            <p className="mb-3 text-sm text-gray-600">
              Paste a key to run the requests below and see real responses. The key stays in this browser tab only — it isn't saved,
              and it's sent nowhere except to the API.
            </p>
            <label htmlFor="api-key-input" className="text-xs font-semibold text-gray-500">
              Your API key
            </label>
            <input
              id="api-key-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="paste key here"
              className="mt-1 block w-full max-w-md rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Card>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Endpoint groups">
            {ENDPOINT_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={g.id === groupId}
                onClick={() => setGroupId(g.id)}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                  g.id === groupId
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-300 bg-white text-gray-700 hover:border-blue-400"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {group.endpoints.map((e) => (
              <EndpointCard key={e.id} endpoint={e} apiKey={apiKey} onNeedKey={focusKey} />
            ))}
          </div>

          <Card>
            <h2 className="text-lg font-semibold text-gray-900">Paging through a table</h2>
            <p className="mb-3 text-sm text-gray-600">A table response includes everything needed to page through it:</p>
            <DataTable
              head={["Field", "Meaning"]}
              rows={[
                [<C key="a">total</C>, "Rows matching your filters (all pages)."],
                [
                  <span key="b">
                    <C>limit</C> / <C>offset</C>
                  </span>,
                  "The page size and start you asked for.",
                ],
                [<C key="c">returned</C>, "Rows in this response."],
                [
                  <C key="d">next_offset</C>,
                  <>
                    Send this as <C>offset</C> to get the next page. <C>null</C> on the last page.
                  </>,
                ],
                [<C key="e">data</C>, "The rows, ordered by id."],
              ]}
            />
            <p className="mt-3 text-sm text-gray-600">
              Keep requesting with <C>offset=&lt;next_offset&gt;</C> until it is <C>null</C>.
            </p>
            <h3 className="mt-5 text-base font-semibold text-gray-900">Data notes</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600">
              <li>
                <C>id</C> columns are numbers. Columns stored as <C>numeric</C> (such as prices) come back as <strong>text</strong>, so
                no precision is lost.
              </li>
              <li>
                Rows removed in the app are marked with <C>deleted_at</C> and <strong>hidden by default</strong>. Add{" "}
                <C>include_deleted=true</C> to get them.
              </li>
              <li>
                For syncing, <C>updated_since</C> returns rows created or changed after a time. A row that was never edited counts by
                its <C>created_at</C>.
              </li>
            </ul>
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Errors</h2>
            <DataTable
              head={["Status", "When"]}
              rows={STATUS_ERRORS.map(([s, w]) => [
                <span key={s} className="rounded bg-red-100 px-2 py-0.5 font-mono text-xs font-bold text-red-800">
                  {s}
                </span>,
                w,
              ])}
            />
            <div className="mt-3">
              <JsonBlock text={'{\n  "error": "This API key has expired"\n}'} />
            </div>
          </Card>
        </>
      )}

      {/* Table reference */}
      {tab === "tables" && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900">Table reference</h2>
          <p className="mb-3 text-sm text-gray-600">
            Every table in <C>{SCHEMA}</C> and its columns. Use the table name in <C>GET /{SCHEMA}/&lt;table&gt;</C>.
          </p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={tableQuery}
              onChange={(e) => setTableQuery(e.target.value)}
              placeholder="Search tables or columns…"
              aria-label="Search tables or columns"
              className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <p className="my-3 text-xs text-gray-500">
            {filteredTables.length} of {TABLES.length} tables · generated {TABLES_GENERATED}
          </p>
          <div className="space-y-2">
            {filteredTables.map((t) => (
              <details
                key={t.table}
                open={tableQuery.trim() !== ""}
                className="group rounded-lg border border-gray-200 bg-gray-50"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
                  <span className="min-w-0">
                    <code className="font-mono text-sm font-semibold text-gray-900">{t.table}</code>
                    <span className="ml-2 text-xs text-gray-500">{t.columns.length} columns</span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-3 px-4 pb-4">
                  <UrlBar url={`${BASE_URL}/${SCHEMA}/${t.table}`} />
                  <div className="flex flex-wrap gap-1.5">
                    {t.columns.map((c) => (
                      <span key={c} className="rounded border border-gray-200 bg-white px-2 py-0.5 font-mono text-xs text-gray-700">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </details>
            ))}
            {filteredTables.length === 0 && <p className="text-sm text-gray-500">No tables match.</p>}
          </div>
        </Card>
      )}

      {/* Help */}
      {tab === "help" && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Help</h2>
          <div className="space-y-2">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group rounded-lg border border-gray-200 bg-gray-50">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-gray-900">
                  {q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
                </summary>
                <p className="px-4 pb-4 text-sm text-gray-600">{a}</p>
              </details>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
