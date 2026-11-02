import i18n from './i18n';
import { getCache, setCache } from './cache';

export interface NamedItem {
  itemId: number | null;
  name: string;
}

const XIV_BASE = 'https://v2.xivapi.com/api/sheet/Item';
const CHUNK = 200; // shortcut: keeps the rows= URL under typical length caps
const NAMES_TTL = 7 * 24 * 60 * 60 * 1000; // in-game renames appear on cache expiry / reload

/** Per language: English catalog name → verbatim in-game item name. */
const maps: Record<string, Record<string, string>> = {};
/** Per language: itemIds we already have a name for (or tried). */
const loadedIds: Record<string, Set<number>> = {};

async function fetchLocalizedNames(ids: number[], lang: string): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  for (let i = 0; i < ids.length; i += CHUNK) {
    const res = await fetch(
      `${XIV_BASE}?rows=${ids.slice(i, i + CHUNK).join(',')}&language=${lang}&fields=Name`
    );
    if (!res.ok) throw new Error(`xivapi responded ${res.status}`);
    const json: { rows?: { row_id?: number; fields?: { Name?: string } }[] } = await res.json();
    for (const row of json.rows ?? []) {
      if (typeof row.row_id === 'number' && typeof row.fields?.Name === 'string') {
        out[row.row_id] = row.fields.Name;
      }
    }
  }
  return out;
}

/**
 * Loads verbatim in-game item names for the current language and re-renders
 * consumers (via a languageChanged emit). No-op for English.
 */
export async function localizeItemNames(items: NamedItem[]): Promise<void> {
  const lang = i18n.language;
  if (lang === 'en') return;

  const wanted = new Map<number, string>(); // itemId → English catalog name
  for (const it of items) {
    if (typeof it.itemId === 'number') wanted.set(it.itemId, it.name);
  }

  let done = loadedIds[lang];
  if (!done) {
    done = new Set<number>();
    loadedIds[lang] = done;
    const cached = getCache<Record<string, string>>(`ff14_xivnames_${lang}`, NAMES_TTL);
    if (cached) {
      maps[lang] = { ...maps[lang], ...cached };
      for (const id of wanted.keys()) done.add(id);
    }
  }

  const missing = [...wanted.keys()].filter((id) => !done.has(id));
  if (missing.length === 0) return;
  for (const id of missing) done.add(id);

  try {
    const localized = await fetchLocalizedNames(missing, lang);
    if (i18n.language !== lang) return; // language switched mid-flight
    const map = (maps[lang] ??= {});
    for (const [id, enName] of wanted) {
      const name = localized[id];
      if (name) map[enName] = name;
    }
    setCache(`ff14_xivnames_${lang}`, map);
    // react-i18next only re-renders on languageChanged — names arrive async, so poke it.
    i18n.emit('languageChanged');
  } catch (e) {
    console.warn('xivapi item names unavailable, keeping English:', e);
  }
}

/** Localized in-game name for an English catalog name (identity when none). */
export function itemName(name: string): string {
  const lang = i18n.language;
  if (lang === 'en') return name;
  return maps[lang]?.[name] ?? name;
}
