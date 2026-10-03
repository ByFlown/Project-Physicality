import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import { appDataSchema, DATA_VERSION, emptyAppData, type AppData } from '../domain/schema';

const DATA_KEY = 'data';
const CHANNEL = 'physicality-sync';

let store: UseStore | undefined;
function db(): UseStore {
  store ??= createStore('project-physicality', 'kv');
  return store;
}

type Raw = Record<string, unknown>;

/** v1 → v2: body scans and the model-detail setting were added. */
function migrateV1toV2(raw: Raw): Raw {
  const settings = (raw.settings ?? {}) as Raw;
  return {
    ...raw,
    version: 2,
    scans: [],
    settings: { modelDetail: 'precise', ...settings },
  };
}

/** v2 → v3: scans may carry a fitted 3D body (optional field, nothing to convert). */
function migrateV2toV3(raw: Raw): Raw {
  return { ...raw, version: 3 };
}

/** Upgrade older persisted shapes to the current schema, one version at a time. */
export function migrate(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  let data = raw as Raw;
  if (data.version === 1) data = migrateV1toV2(data);
  if (data.version === 2) data = migrateV2toV3(data);
  if (data.version !== DATA_VERSION) return data;
  return data;
}

export type ParseResult = { ok: true; data: AppData } | { ok: false; error: string };

export function parseAppData(raw: unknown): ParseResult {
  const result = appDataSchema.safeParse(migrate(raw));
  if (result.success) return { ok: true, data: result.data };
  const issue = result.error.issues[0];
  return { ok: false, error: issue ? `${issue.path.join('.') || 'data'}: ${issue.message}` : 'Invalid data' };
}

export interface LoadResult {
  data: AppData;
  /** Set when stored data was unreadable and has been moved aside. */
  recoveredFrom?: string;
}

/**
 * Write-ahead journal: every save is first written synchronously to
 * localStorage, then to IndexedDB. If the page unloads before the IndexedDB
 * transaction commits, the journal is replayed on the next load.
 */
const TAB_ID = Math.random().toString(36).slice(2);
const JOURNAL_KEY = 'physicality:journal';
let journalSeq = 0;
const journalId = (seq: number) => `${TAB_ID}:${seq}`;

function writeJournal(data: AppData): number {
  const seq = ++journalSeq;
  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify({ seq: journalId(seq), data }));
  } catch {
    // Quota exceeded or storage blocked: IndexedDB remains the source of truth.
  }
  return seq;
}

function clearJournal(seq: number) {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    if (raw && (JSON.parse(raw) as { seq?: string }).seq === journalId(seq)) localStorage.removeItem(JOURNAL_KEY);
  } catch {
    // Ignore — a stale journal is replayed harmlessly (it equals the stored data).
  }
}

function readJournal(): unknown {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    return raw ? (JSON.parse(raw) as { data?: unknown }).data : undefined;
  } catch {
    return undefined;
  }
}

export async function loadData(): Promise<LoadResult> {
  const journal = readJournal();
  if (journal !== undefined) {
    const parsed = parseAppData(journal);
    if (parsed.ok) {
      await set(DATA_KEY, parsed.data, db());
      try {
        localStorage.removeItem(JOURNAL_KEY);
      } catch {
        // ignore
      }
      return { data: parsed.data };
    }
  }
  const raw = await get(DATA_KEY, db());
  if (raw === undefined) return { data: emptyAppData() };
  const parsed = parseAppData(raw);
  if (parsed.ok) return { data: parsed.data };
  const backupKey = `corrupt-${new Date().toISOString()}`;
  await set(backupKey, raw, db());
  return { data: emptyAppData(), recoveredFrom: backupKey };
}

let writeQueue: Promise<void> = Promise.resolve();
let channel: BroadcastChannel | undefined;

function getChannel(): BroadcastChannel | undefined {
  if (typeof BroadcastChannel === 'undefined') return undefined;
  channel ??= new BroadcastChannel(CHANNEL);
  return channel;
}

/** Writes are serialised so a slow write never overwrites a newer one. */
export function saveData(data: AppData): Promise<void> {
  const seq = writeJournal(data);
  writeQueue = writeQueue
    .then(() => set(DATA_KEY, data, db()))
    .then(() => clearJournal(seq))
    .then(() => getChannel()?.postMessage({ from: TAB_ID }))
    .catch((err) => console.error('Failed to persist data', err));
  return writeQueue;
}

export async function clearData(): Promise<void> {
  await writeQueue;
  try {
    localStorage.removeItem(JOURNAL_KEY);
  } catch {
    // ignore
  }
  await del(DATA_KEY, db());
  getChannel()?.postMessage({ from: TAB_ID });
}

/** Invoke `onChange` when another tab persists new data. */
export function subscribeToOtherTabs(onChange: () => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const handler = (e: MessageEvent<{ from?: string }>) => {
    if (e.data?.from !== TAB_ID) onChange();
  };
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}

/** Ask the browser not to evict our storage under pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    // Unsupported or denied — data still works, it is just evictable.
  }
  return false;
}

export const EXPORT_APP_ID = 'project-physicality';

export function serializeExport(data: AppData): string {
  return JSON.stringify({ app: EXPORT_APP_ID, exportedAt: new Date().toISOString(), data }, null, 2);
}

export function parseImport(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }
  const payload =
    json && typeof json === 'object' && (json as { app?: unknown }).app === EXPORT_APP_ID
      ? (json as { data: unknown }).data
      : json;
  return parseAppData(payload);
}
