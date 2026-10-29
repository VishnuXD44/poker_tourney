/**
 * Bots for the in-browser arena: house bots built from the builder templates, plus the
 * visitor's own saved strategies, which live only in this browser's localStorage.
 */
import { TEMPLATES } from "./strategy";

const KEY = "poker_tourney.bots";
const MAX_SAVED = 30;
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export const HOUSE_BOTS = Object.entries(TEMPLATES)
  .filter(([name]) => name !== "blank")
  .map(([name, graph]) => ({ id: `house-${name.replace(/\s+/g, "-")}`, name: titleCase(name), filename: "house bot", graph, house: true }));

export function loadMyBots() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(list) ? list.filter((b) => b?.id && b?.name && Array.isArray(b?.graph?.nodes)) : [];
  } catch {
    return [];
  }
}

function store(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Saves (or overwrites by name) a strategy. Returns the saved bot, or null if storage is unavailable. */
export function saveMyBot(rawName, graph) {
  let name = String(rawName).trim().slice(0, 40) || "my strategy";
  if (HOUSE_BOTS.some((b) => b.name.toLowerCase() === name.toLowerCase())) name = `${name} (mine)`;
  const list = loadMyBots();
  const existing = list.find((b) => b.name === name);
  const bot = { id: existing?.id ?? `mine-${Date.now().toString(36)}`, name, filename: "my strategy", graph, savedAt: Date.now() };
  const next = [bot, ...list.filter((b) => b.id !== bot.id)].slice(0, MAX_SAVED);
  return store(next) ? bot : null;
}

export function deleteMyBot(id) {
  store(loadMyBots().filter((b) => b.id !== id));
}
