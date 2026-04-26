import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const DB_PATH = path.join(DATA_DIR, "db.json");

const DEFAULT_DB = {
  accounts: {},
  invoices: [],
  citizens: {},
  warns: [],
  state: {
    rpStatus: "off",
    rpChangedAt: Date.now(),
    eventStatus: "off",
    eventChangedAt: Date.now(),
  },
};

let cache = null;
let writeQueue = Promise.resolve();

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function loadDb() {
  if (cache) return cache;
  await ensureDir();
  try {
    const raw = await fs.readFile(DB_PATH, "utf-8");
    const p = JSON.parse(raw);
    cache = {
      accounts: p.accounts ?? {},
      invoices: p.invoices ?? [],
      citizens: p.citizens ?? {},
      warns: p.warns ?? [],
      state: { ...DEFAULT_DB.state, ...(p.state ?? {}) },
    };
  } catch {
    cache = structuredClone(DEFAULT_DB);
    await saveDb();
  }
  return cache;
}

export async function saveDb() {
  if (!cache) return;
  const snap = JSON.stringify(cache, null, 2);
  writeQueue = writeQueue.then(async () => {
    await ensureDir();
    await fs.writeFile(DB_PATH, snap, "utf-8");
  });
  await writeQueue;
}

export async function withDb(fn) {
  const db = await loadDb();
  const r = await fn(db);
  await saveDb();
  return r;
}

export function pruneOldWarns(db) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  db.warns = db.warns.filter((w) => w.createdAt >= cutoff);
}

export function getActiveWarns(db, userId) {
  pruneOldWarns(db);
  return db.warns.filter((w) => w.userId === userId);
}

export function getOrCreateAccount(db, userId) {
  if (!db.accounts[userId]) {
    db.accounts[userId] = {
      userId,
      balance: 0,
      createdAt: Date.now(),
      salary: 0,
      job: null,
    };
  }
  return db.accounts[userId];
}

export const generateId = (prefix) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
