#!/usr/bin/env node
// Creates a signed API key for the shipyard-report function.
//
//   DATA_API_SIGNING_SECRET=<the secret> node mint-key.mjs --name "Vendor X" --days 7
//
//   --name       who it is for (shown in the API, handy for tracking)   required
//   --days N     expires after N days       } give exactly one of these,
//   --hours N    expires after N hours      } or --permanent for a key
//   --minutes N  expires after N minutes    } that never expires
//   --permanent  never expires (can still be revoked, see README)
//   --schemas    comma-separated schemas it may read  [default: daily_report_shipyard]
//
// Runs entirely on your own computer: it needs the signing secret but never
// talks to Supabase, and nothing has to change there for the key to work.

import { createHmac, randomBytes } from "node:crypto";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`Unexpected argument: ${a}`);
    const key = a.slice(2);
    if (key === "permanent") {
      args.permanent = true;
    } else {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`--${key} needs a value`);
      args[key] = value;
    }
  }
  return args;
}

function fail(message) {
  console.error(`Error: ${message}\n`);
  console.error('Example: DATA_API_SIGNING_SECRET=... node mint-key.mjs --name "Vendor X" --days 7');
  process.exit(1);
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (err) {
  fail(err.message);
}

const secret = process.env.DATA_API_SIGNING_SECRET;
if (!secret) fail("set DATA_API_SIGNING_SECRET (the same value as the function's secret)");
if (!args.name) fail("--name is required");

const lengths = [
  ["days", 86400],
  ["hours", 3600],
  ["minutes", 60],
].filter(([unit]) => args[unit] !== undefined);

if (args.permanent && lengths.length > 0) fail("use --permanent OR a length of time, not both");
if (!args.permanent && lengths.length !== 1) fail("give exactly one of --days, --hours, --minutes, or --permanent");

let exp;
if (!args.permanent) {
  const [unit, seconds] = lengths[0];
  const amount = Number(args[unit]);
  if (!Number.isFinite(amount) || amount <= 0) fail(`--${unit} must be a number above 0`);
  exp = Math.floor(Date.now() / 1000 + amount * seconds);
}

const schemas = (args.schemas ?? "daily_report_shipyard")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (schemas.length === 0) fail("--schemas can't be empty");

const payload = { v: 1, id: randomBytes(6).toString("hex"), name: args.name, schemas, ...(exp ? { exp } : {}) };
const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
const token = `srt_${encodedPayload}.${signature}`;

console.log(token);
console.error("");
console.error(`  for:      ${payload.name}`);
console.error(`  id:       ${payload.id}   (put this in DATA_API_REVOKED to cancel it early)`);
console.error(`  schemas:  ${schemas.join(", ")}`);
console.error(`  expires:  ${exp ? new Date(exp * 1000).toISOString() : "never"}`);
