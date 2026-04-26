import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const TMP_PATH = path.join(DATA_DIR, "db.json.tmp");
const BAK_PATH = path.join(DATA_DIR, "db.json.bak");

const WARN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 1 mese
const SCHEMA_VERSION = 1;

const DEFAULT_DB = () => ({
  version: SCHEMA_VERSION,
  accounts: {},   // { userId: { userId, balance, salary, job, createdAt } }
  invoices: [],   // [ { id, fromUserId, toUserId, amount, description, paid, createdAt, paidAt? } ]
  citizens: {},   // { userId: { userId, fullName, birthDate, nationality, job, createdAt } }
  warns: [],      // [ { id, userId, moderatorId, reason, createdAt } ]
  state: {
    rpStatus: "off",       // "on" | "off"
    rpChangedAt: Date.now(),
    eventStatus: "off",    // "on" | "off"
    eventChangedAt: Date.now(),
  },
  meta: {
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
});

let cache = null;
let writeQueue = Promise.resolve();
let dirty = false;

// ---------- I/O di basso livello ----------

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJsonOrNull(p) {
  try {
    const raw = await fs.readFile(p, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Scrittura atomica: scrivi su .tmp, poi rinomina.
// In caso di crash il file principale resta integro.
async function atomicWrite(data) {
  await ensureDir();
  const text = JSON.stringify(data, null, 2);
  await fs.writeFile(TMP_PATH, text, "utf-8");
  // Backup del precedente prima di sostituirlo
  try {
    await fs.copyFile(DB_PATH, BAK_PATH);
  } catch {
    // Non esiste ancora, ok
  }
  await fs.rename(TMP_PATH, DB_PATH);
}

// ---------- Migrazione / validazione ----------

function migrate(parsed) {
  const base = DEFAULT_DB();
  if (!parsed || typeof parsed !== "object") return base;

  const merged = {
    version: SCHEMA_VERSION,
    accounts: parsed.accounts && typeof parsed.accounts === "object" ? parsed.accounts : {},
    invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
    citizens: parsed.citizens && typeof parsed.citizens === "object" ? parsed.citizens : {},
    warns: Array.isArray(parsed.warns) ? parsed.warns : [],
    state: {
      rpStatus: parsed.state?.rpStatus === "on" ? "on" : "off",
      rpChangedAt: Number(parsed.state?.rpChangedAt) || Date.now(),
      eventStatus: parsed.state?.eventStatus === "on" ? "on" : "off",
      eventChangedAt: Number(parsed.state?.eventChangedAt) || Date.now(),
    },
    meta: {
      createdAt: Number(parsed.meta?.createdAt) || Date.now(),
      updatedAt: Date.now(),
    },
  };

  // Normalizza ogni account
  for (const [id, a] of Object.entries(merged.accounts)) {
    mer
