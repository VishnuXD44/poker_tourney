import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_FILE = process.env.BOT_STORE_FILE || path.join(__dirname, '..', 'runtime', 'bots', 'bots.json');

const bots = new Map();
let nextId = 1;
const MAX_BOTS = 200;
const MAX_NAME_LENGTH = 80;

/**
 * Saved paths are absolute; if the project folder was moved, look for the file
 * under the same subfolder (bin/ or src/) next to the store file instead.
 */
function relocate(savedPath, subdir) {
  if (!savedPath || fs.existsSync(savedPath)) return savedPath;
  const moved = path.join(path.dirname(STORE_FILE), subdir, path.basename(savedPath));
  return fs.existsSync(moved) ? moved : savedPath;
}

/** Loads bots saved by a previous run, skipping any whose compiled binary is gone. */
function load() {
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch (_) {
    return;
  }
  for (const bot of saved.bots || []) {
    if (!bot?.id) continue;
    bot.binaryPath = relocate(bot.binaryPath, 'bin');
    bot.sourcePath = relocate(bot.sourcePath, 'src');
    if (bot.binaryPath && fs.existsSync(bot.binaryPath)) bots.set(String(bot.id), bot);
  }
  nextId = Math.max(Number(saved.nextId) || 1, ...Array.from(bots.keys(), id => Number(id) + 1));
}

function save() {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    const tmp = `${STORE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ nextId, bots: Array.from(bots.values()) }, null, 2));
    fs.renameSync(tmp, STORE_FILE);
  } catch (err) {
    console.error('Failed to save bot store:', err.message);
  }
}

load();

export function listBots() {
  return Array.from(bots.values());
}

export function getBot(id) {
  return bots.get(String(id)) || null;
}

export function createBot(name, code, options = {}) {
  if (bots.size >= MAX_BOTS) return null;
  const id = String(nextId++);
  const safeName = String(name).slice(0, MAX_NAME_LENGTH).trim() || 'Unnamed Bot';
  const bot = {
    id,
    name: safeName,
    code,
    language: options.language || 'cpp',
    filename: options.filename || null,
    sourcePath: options.sourcePath || null,
    binaryPath: options.binaryPath || null,
    constraints: options.constraints || null,
    createdAt: new Date().toISOString(),
  };
  bots.set(id, bot);
  save();
  return bot;
}

export function updateBot(id, updates = {}) {
  const bot = bots.get(String(id));
  if (!bot) return null;
  if (updates.name !== undefined) {
    bot.name = String(updates.name).slice(0, MAX_NAME_LENGTH).trim() || bot.name;
  }
  if (updates.code !== undefined) bot.code = updates.code;
  if (updates.filename !== undefined) bot.filename = updates.filename;
  if (updates.sourcePath !== undefined) bot.sourcePath = updates.sourcePath;
  if (updates.binaryPath !== undefined) bot.binaryPath = updates.binaryPath;
  if (updates.constraints !== undefined) bot.constraints = updates.constraints;
  save();
  return bot;
}

export function deleteBot(id) {
  const key = String(id);
  const bot = bots.get(key);
  if (!bot) return null;
  bots.delete(key);
  save();
  return bot;
}
