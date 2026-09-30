// Decides whether a North Star edited directly in Mighty (Settings > Private
// responses) should be adopted as a new app version. Pure: no I/O.
import { MAX_CHARS, charCount } from './content';

export type AdoptInput = {
  active: { statement: string; createdAt: string } | null;
  /** True when every sync of the active version to Mighty has succeeded. */
  activeSynced: boolean;
  mighty: { text: string; lastEditedAt: string | null } | null;
};

const norm = (s: string) => s.replace(/\r\n/g, '\n').trim();

export function mightyNorthStarToAdopt(i: AdoptInput): string | null {
  // Only after the member has done the North Star exercise in the app.
  if (!i.active || !i.mighty) return null;
  // Never while our own latest version is still on its way to Mighty: Mighty
  // would hold the older text and we would pull it back.
  if (!i.activeSynced) return null;
  const text = norm(i.mighty.text);
  if (!text || charCount(text) > MAX_CHARS) return null;
  if (text === norm(i.active.statement)) return null;
  // Mighty's copy must be newer than the app's current version.
  if (i.mighty.lastEditedAt) {
    const edited = Date.parse(i.mighty.lastEditedAt);
    const saved = Date.parse(i.active.createdAt);
    if (Number.isFinite(edited) && Number.isFinite(saved) && edited <= saved) return null;
  }
  return text;
}
