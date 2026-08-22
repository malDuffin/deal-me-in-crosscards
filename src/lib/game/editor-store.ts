import type { Level } from "./types";
import { isValidLevel } from "./endless";

const KEY = "crosscards-editor-v1";
const MAX = 40;

export type SavedTable = {
  id: string;
  savedAt: number;
  level: Level;
};

function read(): SavedTable[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedTable[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row) => row?.level && isValidLevel(row.level));
  } catch {
    return [];
  }
}

function write(rows: SavedTable[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX)));
}

export function loadSavedTables(): SavedTable[] {
  return read().sort((a, b) => b.savedAt - a.savedAt);
}

export function getTable(id: string): SavedTable | null {
  return read().find((r) => r.id === id) ?? null;
}

export function saveTable(level: Level): SavedTable {
  const rows = read();
  const id = level.id.startsWith("custom-") ? level.id : `custom-${Date.now().toString(36)}`;
  const saved: SavedTable = {
    id,
    savedAt: Date.now(),
    level: { ...level, id, campaign: "custom" },
  };
  const next = [saved, ...rows.filter((r) => r.id !== id)].slice(0, MAX);
  write(next);
  return saved;
}

export function deleteTable(id: string): void {
  write(read().filter((r) => r.id !== id));
}
