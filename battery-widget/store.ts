// ---------------------------------------------------------------------------
// Persistence helpers built on the Storage API (synchronous get/set).
// Storage is per-project-private, so index.tsx, widget.tsx and
// app_intents.tsx of THIS project all read/write the same values.
// ---------------------------------------------------------------------------
import { Storage } from "scripting"
import {
  DEFAULT_SETTINGS,
  Settings,
  Snapshot,
  SNAPSHOT_VERSION,
  STORAGE_KEYS,
} from "./model"

export function loadSettings(): Settings {
  const saved = Storage.get<Partial<Settings>>(STORAGE_KEYS.settings)
  // Merge so new fields added in updates get sane defaults.
  return { ...DEFAULT_SETTINGS, ...(saved ?? {}) }
}

export function saveSettings(settings: Settings): void {
  Storage.set<Settings>(STORAGE_KEYS.settings, settings)
}

export function loadSnapshot(): Snapshot | null {
  const snap = Storage.get<Snapshot>(STORAGE_KEYS.snapshot)
  if (!snap || snap.version !== SNAPSHOT_VERSION || !Array.isArray(snap.items)) {
    return null
  }
  return snap
}

export function saveSnapshot(items: Snapshot["items"]): Snapshot {
  const snap: Snapshot = {
    version: SNAPSHOT_VERSION,
    builtAt: Date.now(),
    items,
  }
  Storage.set<Snapshot>(STORAGE_KEYS.snapshot, snap)
  return snap
}
