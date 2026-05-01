import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Event } from "../types.js";

let _db: Database.Database | null = null;

const DEFAULT_DIR = join(homedir(), ".highli");
const DEFAULT_PATH = process.env.HIGHLI_DB_PATH ?? join(DEFAULT_DIR, "highli.db");

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  type TEXT NOT NULL,
  ts INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  url TEXT,
  payload TEXT NOT NULL,
  ingested_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_ts_idx ON events(ts DESC);
CREATE INDEX IF NOT EXISTS events_source_idx ON events(source);

CREATE TABLE IF NOT EXISTS pulls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  scope TEXT NOT NULL,
  since TEXT NOT NULL,
  until TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  events_inserted INTEGER,
  error TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Stars are a separate signal — they never mutate the source-of-truth
-- expansive doc. Curation flows from this table; events stay append-only.
CREATE TABLE IF NOT EXISTS stars (
  event_id TEXT PRIMARY KEY,
  starred_at INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id)
);

-- Archives hide events from consolidated/curated views (highlights, weekly
-- digests, manager surfaces) WITHOUT removing them from the expansive doc.
-- "Suppression breaks the source-of-truth promise" per the redesign plan.
CREATE TABLE IF NOT EXISTS archives (
  event_id TEXT PRIMARY KEY,
  archived_at INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id)
);

-- Manual super-entries — engineer-confirmed groupings persisted across runs.
-- Distinct from the AI's ephemeral grouping suggestions, which are recomputed
-- per consolidation pass.
CREATE TABLE IF NOT EXISTS manual_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  framing TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS manual_group_members (
  group_id INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, event_id),
  FOREIGN KEY (group_id) REFERENCES manual_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id)
);
CREATE INDEX IF NOT EXISTS manual_group_members_event_idx
  ON manual_group_members(event_id);

-- Cache for AI-generated artifacts (highlights, groupings, insight). Keyed
-- by an arbitrary string the caller chooses — typically a fingerprint of the
-- inputs. Cheap to invalidate; expires in-place via TTL.
CREATE TABLE IF NOT EXISTS ai_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Career goal history. Every change is a new version; readers always
-- pick the row with the largest \`version\`. Solo-mode stand-in for the
-- /me/* partition that lands in build #7.
CREATE TABLE IF NOT EXISTS career_goals (
  version INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  level TEXT,
  skills TEXT,
  growth_areas TEXT,
  created_at INTEGER NOT NULL
);
`;

export function getDb(): Database.Database {
  if (_db) return _db;
  if (DEFAULT_PATH.startsWith(DEFAULT_DIR)) mkdirSync(DEFAULT_DIR, { recursive: true });
  _db = new Database(DEFAULT_PATH);
  _db.pragma("journal_mode = WAL");
  _db.exec(SCHEMA_SQL);
  return _db;
}

export function getDbPath(): string {
  return DEFAULT_PATH;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

const insertEventStmt = () =>
  getDb().prepare(`
    INSERT INTO events (id, source, type, ts, title, summary, url, payload, ingested_at)
    VALUES (@id, @source, @type, @ts, @title, @summary, @url, @payload, @ingested_at)
    ON CONFLICT(id) DO NOTHING
  `);

export function insertEvents(events: Event[]): number {
  if (events.length === 0) return 0;
  const stmt = insertEventStmt();
  const now = Date.now();
  const insertMany = getDb().transaction((batch: Event[]) => {
    let inserted = 0;
    for (const e of batch) {
      const result = stmt.run({
        id: e.id,
        source: e.source,
        type: e.type,
        ts: e.ts,
        title: e.title,
        summary: e.summary ?? null,
        url: e.url ?? null,
        payload: JSON.stringify(e.payload),
        ingested_at: now,
      });
      if (result.changes > 0) inserted++;
    }
    return inserted;
  });
  return insertMany(events);
}

export interface PullRecord {
  id: number;
  source: string;
  scope: string;
  since: string;
  until: string;
  started_at: number;
  completed_at: number | null;
  events_inserted: number | null;
  error: string | null;
}

export function recordPullStart(
  source: string,
  scope: string,
  since: string,
  until: string,
): number {
  const result = getDb()
    .prepare(
      `INSERT INTO pulls (source, scope, since, until, started_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(source, scope, since, until, Date.now());
  return Number(result.lastInsertRowid);
}

export function recordPullEnd(
  pullId: number,
  inserted: number,
  error?: string,
): void {
  getDb()
    .prepare(
      `UPDATE pulls SET completed_at = ?, events_inserted = ?, error = ? WHERE id = ?`,
    )
    .run(Date.now(), inserted, error ?? null, pullId);
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare<[string], { value: string }>(
      `SELECT value FROM settings WHERE key = ?`,
    )
    .get(key);
  return row?.value ?? null;
}

export interface EventsBetweenParams {
  since: string;
  until: string;
  source?: string;
  type?: string;
  limit?: number;
}

export function eventsBetween(params: EventsBetweenParams): Event[] {
  const sinceMs = new Date(params.since).getTime();
  const untilMs = new Date(params.until).getTime() + 24 * 60 * 60 * 1000;

  const conds: string[] = ["ts >= ?", "ts < ?"];
  const args: (string | number)[] = [sinceMs, untilMs];
  if (params.source) {
    conds.push("source = ?");
    args.push(params.source);
  }
  if (params.type) {
    conds.push("type = ?");
    args.push(params.type);
  }

  let sql = `SELECT * FROM events WHERE ${conds.join(" AND ")} ORDER BY ts DESC`;
  if (params.limit) sql += ` LIMIT ${params.limit}`;

  const rows = getDb().prepare(sql).all(...args) as any[];
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    type: r.type,
    ts: r.ts,
    title: r.title,
    summary: r.summary ?? undefined,
    url: r.url ?? undefined,
    payload: JSON.parse(r.payload),
  }));
}

export function eventCount(): number {
  const row = getDb()
    .prepare<[], { c: number }>(`SELECT COUNT(*) AS c FROM events`)
    .get();
  return row?.c ?? 0;
}

// ── Stars ──────────────────────────────────────────────────────────

export function star(eventId: string): void {
  getDb()
    .prepare(
      `INSERT INTO stars (event_id, starred_at) VALUES (?, ?)
       ON CONFLICT(event_id) DO NOTHING`,
    )
    .run(eventId, Date.now());
}

export function unstar(eventId: string): void {
  getDb().prepare(`DELETE FROM stars WHERE event_id = ?`).run(eventId);
}

export function isStarred(eventId: string): boolean {
  const row = getDb()
    .prepare<[string], { event_id: string }>(
      `SELECT event_id FROM stars WHERE event_id = ?`,
    )
    .get(eventId);
  return !!row;
}

export function listStars(): string[] {
  const rows = getDb()
    .prepare<[], { event_id: string }>(`SELECT event_id FROM stars`)
    .all();
  return rows.map((r) => r.event_id);
}

// ── Archives ──────────────────────────────────────────────────────

export function archive(eventId: string): void {
  getDb()
    .prepare(
      `INSERT INTO archives (event_id, archived_at) VALUES (?, ?)
       ON CONFLICT(event_id) DO NOTHING`,
    )
    .run(eventId, Date.now());
}

export function unarchive(eventId: string): void {
  getDb().prepare(`DELETE FROM archives WHERE event_id = ?`).run(eventId);
}

export function isArchived(eventId: string): boolean {
  const row = getDb()
    .prepare<[string], { event_id: string }>(
      `SELECT event_id FROM archives WHERE event_id = ?`,
    )
    .get(eventId);
  return !!row;
}

export function listArchives(): string[] {
  const rows = getDb()
    .prepare<[], { event_id: string }>(`SELECT event_id FROM archives`)
    .all();
  return rows.map((r) => r.event_id);
}

// ── Manual groups (engineer-confirmed super-entries) ─────────────

export interface ManualGroup {
  id: number;
  framing: string;
  createdAt: number;
  eventIds: string[];
}

export function createManualGroup(framing: string, eventIds: string[]): number {
  if (eventIds.length < 2) {
    throw new Error("a manual group needs at least 2 events");
  }
  const db = getDb();
  const now = Date.now();
  const tx = db.transaction(() => {
    const result = db
      .prepare(`INSERT INTO manual_groups (framing, created_at) VALUES (?, ?)`)
      .run(framing, now);
    const groupId = Number(result.lastInsertRowid);
    const insertMember = db.prepare(
      `INSERT INTO manual_group_members (group_id, event_id, added_at)
       VALUES (?, ?, ?)
       ON CONFLICT(group_id, event_id) DO NOTHING`,
    );
    for (const eventId of eventIds) {
      insertMember.run(groupId, eventId, now);
    }
    return groupId;
  });
  return tx();
}

export function addToManualGroup(groupId: number, eventId: string): void {
  getDb()
    .prepare(
      `INSERT INTO manual_group_members (group_id, event_id, added_at)
       VALUES (?, ?, ?)
       ON CONFLICT(group_id, event_id) DO NOTHING`,
    )
    .run(groupId, eventId, Date.now());
}

export function removeFromManualGroup(groupId: number, eventId: string): void {
  getDb()
    .prepare(
      `DELETE FROM manual_group_members WHERE group_id = ? AND event_id = ?`,
    )
    .run(groupId, eventId);
}

export function deleteManualGroup(groupId: number): void {
  // ON DELETE CASCADE handles members.
  getDb().prepare(`DELETE FROM manual_groups WHERE id = ?`).run(groupId);
}

export function listManualGroups(): ManualGroup[] {
  const db = getDb();
  const groups = db
    .prepare<[], { id: number; framing: string; created_at: number }>(
      `SELECT id, framing, created_at FROM manual_groups ORDER BY id DESC`,
    )
    .all();

  if (groups.length === 0) return [];

  const memberStmt = db.prepare<[number], { event_id: string }>(
    `SELECT event_id FROM manual_group_members WHERE group_id = ? ORDER BY added_at`,
  );

  return groups.map((g) => ({
    id: g.id,
    framing: g.framing,
    createdAt: g.created_at,
    eventIds: memberStmt.all(g.id).map((m) => m.event_id),
  }));
}

export function getManualGroupForEvent(eventId: string): ManualGroup | null {
  const db = getDb();
  const row = db
    .prepare<[string], { group_id: number }>(
      `SELECT group_id FROM manual_group_members WHERE event_id = ? LIMIT 1`,
    )
    .get(eventId);
  if (!row) return null;
  const group = db
    .prepare<[number], { id: number; framing: string; created_at: number }>(
      `SELECT id, framing, created_at FROM manual_groups WHERE id = ?`,
    )
    .get(row.group_id);
  if (!group) return null;
  const members = db
    .prepare<[number], { event_id: string }>(
      `SELECT event_id FROM manual_group_members WHERE group_id = ? ORDER BY added_at`,
    )
    .all(row.group_id)
    .map((m) => m.event_id);
  return {
    id: group.id,
    framing: group.framing,
    createdAt: group.created_at,
    eventIds: members,
  };
}

// ── AI cache ──────────────────────────────────────────────────────

export function aiCacheGet<T = unknown>(key: string): T | null {
  const row = getDb()
    .prepare<[string], { value: string; expires_at: number }>(
      `SELECT value, expires_at FROM ai_cache WHERE key = ?`,
    )
    .get(key);
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    getDb().prepare(`DELETE FROM ai_cache WHERE key = ?`).run(key);
    return null;
  }
  return JSON.parse(row.value) as T;
}

export function aiCacheSet(key: string, value: unknown, ttlMs: number): void {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO ai_cache (key, value, created_at, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         created_at = excluded.created_at,
         expires_at = excluded.expires_at`,
    )
    .run(key, JSON.stringify(value), now, now + ttlMs);
}

export async function aiCached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = aiCacheGet<T>(key);
  if (hit !== null) return hit;
  const fresh = await fn();
  aiCacheSet(key, fresh, ttlMs);
  return fresh;
}

// ── Career goal ────────────────────────────────────────────────────

export interface CareerGoal {
  version: number;
  text: string;
  level: string | null;
  skills: string | null;
  growthAreas: string | null;
  createdAt: number;
}

export function getCurrentGoal(): CareerGoal | null {
  const row = getDb()
    .prepare<[], any>(
      `SELECT version, text, level, skills, growth_areas, created_at
       FROM career_goals ORDER BY version DESC LIMIT 1`,
    )
    .get();
  if (!row) return null;
  return {
    version: row.version,
    text: row.text,
    level: row.level,
    skills: row.skills,
    growthAreas: row.growth_areas,
    createdAt: row.created_at,
  };
}

export function listGoalHistory(): CareerGoal[] {
  const rows = getDb()
    .prepare<[], any>(
      `SELECT version, text, level, skills, growth_areas, created_at
       FROM career_goals ORDER BY version DESC`,
    )
    .all();
  return rows.map((row) => ({
    version: row.version,
    text: row.text,
    level: row.level,
    skills: row.skills,
    growthAreas: row.growth_areas,
    createdAt: row.created_at,
  }));
}

export interface SaveGoalParams {
  text: string;
  level?: string;
  skills?: string;
  growthAreas?: string;
}

export function saveGoal(params: SaveGoalParams): CareerGoal {
  const now = Date.now();
  const result = getDb()
    .prepare(
      `INSERT INTO career_goals (text, level, skills, growth_areas, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      params.text,
      params.level ?? null,
      params.skills ?? null,
      params.growthAreas ?? null,
      now,
    );
  return {
    version: Number(result.lastInsertRowid),
    text: params.text,
    level: params.level ?? null,
    skills: params.skills ?? null,
    growthAreas: params.growthAreas ?? null,
    createdAt: now,
  };
}
