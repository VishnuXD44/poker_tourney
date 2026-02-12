const bots = new Map();
let nextId = 1;
const MAX_BOTS = 200;
const MAX_NAME_LENGTH = 80;

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
  return bot;
}

export function deleteBot(id) {
  const key = String(id);
  const bot = bots.get(key);
  if (!bot) return null;
  bots.delete(key);
  return bot;
}
