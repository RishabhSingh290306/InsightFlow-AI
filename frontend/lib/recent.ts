// Client-side "last opened" tracking for projects. The backend's ProjectRead
// has no opened-at field, so we record the timestamp locally when a project
// workspace is opened. Mirrors the localStorage conventions in lib/auth.ts.

const KEY = "insightflow_last_opened";

type RawMap = Record<string, number>;

function read(): RawMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RawMap) : {};
  } catch {
    return {};
  }
}

/** Record that a project was just opened (now). */
export function recordProjectOpened(id: number): void {
  if (typeof window === "undefined") return;
  try {
    const map = read();
    map[String(id)] = Date.now();
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable (private mode / quota) — opening history is best-effort.
  }
}

/** Map of projectId -> epoch ms of last open. Empty until something is opened. */
export function getLastOpenedMap(): Record<number, number> {
  const map = read();
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(map)) out[Number(k)] = v;
  return out;
}
