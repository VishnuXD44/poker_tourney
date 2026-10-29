import express from 'express';
import http from 'http';
import crypto from 'crypto';
import cors from 'cors';
import { Server } from 'socket.io';
import { listBots, getBot, createBot, updateBot, deleteBot } from './bots/botStore.js';
import { runMatch } from './match/matchRunner.js';
import {
  CPP_BOT_CONSTRAINTS,
  compileCppBotSource,
  removeBotArtifacts,
  validateCppBotSource,
} from './bots/cppBotRunner.js';
import { initSandbox } from './bots/sandbox.js';

// Comma-separated list of origins allowed to call the API (the dashboard).
const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:3001,http://127.0.0.1:3001')
  .split(',').map(s => s.trim()).filter(Boolean);
// When set, mutating API calls and socket connections must present this token.
const API_TOKEN = process.env.API_TOKEN || '';

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: CORS_ORIGINS } });

app.use(cors({ origin: CORS_ORIGINS }));
app.use(express.json({ limit: '250kb' }));

function tokenMatches(given) {
  if (!API_TOKEN) return true;
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(API_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireToken(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!tokenMatches(token)) return res.status(401).json({ error: 'Missing or invalid API token' });
  next();
}

const BOT_NAME_MAX = 80;
const MATCH_RATE_WINDOW_MS = 60 * 1000;
const MATCH_RATE_MAX = 15;
const BOT_CREATE_RATE_MAX = 30;

const matchRateLimit = new Map();
function checkMatchRateLimit(ip) {
  const now = Date.now();
  const key = ip || 'default';
  let entries = matchRateLimit.get(key) || [];
  entries = entries.filter(t => now - t < MATCH_RATE_WINDOW_MS);
  if (entries.length >= MATCH_RATE_MAX) return false;
  entries.push(now);
  matchRateLimit.set(key, entries);
  return true;
}

const botCreateRateLimit = new Map();
function checkBotCreateRateLimit(ip) {
  const now = Date.now();
  const key = ip || 'default';
  let entries = botCreateRateLimit.get(key) || [];
  entries = entries.filter(t => now - t < MATCH_RATE_WINDOW_MS);
  if (entries.length >= BOT_CREATE_RATE_MAX) return false;
  entries.push(now);
  botCreateRateLimit.set(key, entries);
  return true;
}

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || '';
}

function toPublicBot(bot) {
  if (!bot) return null;
  return {
    id: bot.id,
    name: bot.name,
    language: bot.language,
    filename: bot.filename,
    constraints: bot.constraints,
    createdAt: bot.createdAt,
  };
}

app.get('/api/bots', (req, res) => {
  res.json(listBots().map(toPublicBot));
});

app.get('/api/bots/constraints', (req, res) => {
  res.json(CPP_BOT_CONSTRAINTS);
});

app.get('/api/bots/:id', (req, res) => {
  const bot = getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  res.json(toPublicBot(bot));
});

app.post('/api/bots', requireToken, (req, res) => {
  (async () => {
    if (!checkBotCreateRateLimit(getClientIp(req))) {
      return res.status(429).json({ error: 'Too many bots created; try again later' });
    }
    const { name, code, filename } = req.body;
    if (name == null || typeof code !== 'string') {
      return res.status(400).json({ error: 'name and code required' });
    }
    const trimmedName = String(name).trim().slice(0, BOT_NAME_MAX);
    if (!trimmedName) return res.status(400).json({ error: 'name cannot be empty' });

    const validation = validateCppBotSource(code, filename);
    if (!validation.valid) return res.status(400).json({ error: validation.error });

    const compile = await compileCppBotSource(code, trimmedName);
    if (!compile.ok) return res.status(400).json({ error: compile.error });

    const bot = createBot(trimmedName, code, {
      language: 'cpp',
      filename: filename || `${trimmedName}.cpp`,
      sourcePath: compile.sourcePath,
      binaryPath: compile.binaryPath,
      constraints: {
        validatedAt: new Date().toISOString(),
        compileStatus: 'ok',
      },
    });
    if (!bot) {
      await removeBotArtifacts(compile);
      return res.status(503).json({ error: 'Maximum number of bots reached' });
    }

    return res.status(201).json(toPublicBot(bot));
  })().catch((err) => {
    console.error('Bot upload failed:', err);
    return res.status(500).json({ error: 'Failed to upload bot' });
  });
});

app.put('/api/bots/:id', requireToken, (req, res) => {
  (async () => {
    const existing = getBot(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Bot not found' });

    const { name, code, filename } = req.body;
    const updates = {};
    if (name !== undefined) {
      const newName = String(name).trim().slice(0, BOT_NAME_MAX);
      if (!newName) return res.status(400).json({ error: 'name cannot be empty' });
      updates.name = newName;
    }

    if (code !== undefined) {
      if (typeof code !== 'string') return res.status(400).json({ error: 'code must be a string' });
      const validation = validateCppBotSource(code, filename || existing.filename || '');
      if (!validation.valid) return res.status(400).json({ error: validation.error });
      const compile = await compileCppBotSource(code, updates.name || existing.name);
      if (!compile.ok) return res.status(400).json({ error: compile.error });
      await removeBotArtifacts(existing);
      updates.code = code;
      updates.sourcePath = compile.sourcePath;
      updates.binaryPath = compile.binaryPath;
      updates.constraints = {
        validatedAt: new Date().toISOString(),
        compileStatus: 'ok',
      };
    }

    if (filename !== undefined) updates.filename = filename;
    const bot = updateBot(req.params.id, updates);
    return res.json(toPublicBot(bot));
  })().catch((err) => {
    console.error('Bot update failed:', err);
    return res.status(500).json({ error: 'Failed to update bot' });
  });
});

app.delete('/api/bots/:id', requireToken, (req, res) => {
  (async () => {
    const removed = deleteBot(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Bot not found' });
    await removeBotArtifacts(removed);
    return res.status(204).end();
  })().catch((err) => {
    console.error('Bot delete failed:', err);
    return res.status(500).json({ error: 'Failed to delete bot' });
  });
});

// Updates go only to sockets in the match's room: the one that started it, plus any `watch_match` subscribers.
function createMatchOnUpdate(matchId) {
  return (payload) => {
    io.to(matchId).emit('MATCH_UPDATE', { matchId, ...payload });
  };
}

io.use((socket, next) => {
  if (tokenMatches(socket.handshake.auth?.token)) return next();
  next(new Error('Missing or invalid API token'));
});

io.on('connection', (socket) => {
  socket.on('watch_match', (matchId) => {
    if (typeof matchId === 'string' && matchId.startsWith('match-')) socket.join(matchId);
  });

  socket.on('new_match', async (payload, ack) => {
    if (!checkMatchRateLimit(socket.handshake.address)) {
      ack?.({ error: 'Too many matches; try again in a minute' });
      return;
    }
    const matchId = `match-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const { botIds, numHands, smallBlind, bigBlind, startingChips } = payload || {};
    if (!Array.isArray(botIds) || botIds.length < 2) {
      ack?.({ error: 'botIds array with at least 2 ids required' });
      return;
    }
    if (botIds.length > 9) {
      ack?.({ error: 'At most 9 bots per match' });
      return;
    }
    if (botIds.some(id => typeof id !== 'string' && typeof id !== 'number')) {
      ack?.({ error: 'Invalid bot id in botIds' });
      return;
    }
    socket.join(matchId);
    ack?.({ matchId });
    try {
      const result = await runMatch(botIds, {
        matchId,
        numHands: numHands ?? 50,
        smallBlind,
        bigBlind,
        startingChips,
        onUpdate: createMatchOnUpdate(matchId)
      });
      if (result.error) io.to(matchId).emit('MATCH_UPDATE', { matchId, type: 'MATCH_ERROR', error: result.error });
    } catch (err) {
      console.error('Match error:', err);
      io.to(matchId).emit('MATCH_UPDATE', { matchId, type: 'MATCH_ERROR', error: String(err.message) });
    }
  });
});

app.post('/api/matches/run', requireToken, async (req, res) => {
  if (!checkMatchRateLimit(getClientIp(req))) {
    return res.status(429).json({ error: 'Too many matches; try again in a minute' });
  }
  const { botIds, numHands, smallBlind, bigBlind, startingChips } = req.body;
  if (!Array.isArray(botIds) || botIds.length < 2) {
    return res.status(400).json({ error: 'botIds array with at least 2 ids required' });
  }
  if (botIds.length > 9) return res.status(400).json({ error: 'At most 9 bots per match' });
  if (botIds.some(id => typeof id !== 'string' && typeof id !== 'number')) {
    return res.status(400).json({ error: 'Invalid bot id in botIds' });
  }
  const matchId = `match-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  try {
    const result = await runMatch(botIds, {
      matchId,
      numHands,
      smallBlind,
      bigBlind,
      startingChips,
      onUpdate: createMatchOnUpdate(matchId)
    });
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    console.error('Match error:', err);
    res.status(500).json({ error: 'Match failed' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 3000;
// Listen on localhost only unless HOST is set explicitly (e.g. HOST=0.0.0.0).
const HOST = process.env.HOST || '127.0.0.1';

await initSandbox();
if (!API_TOKEN && !['127.0.0.1', 'localhost', '::1'].includes(HOST)) {
  console.warn('WARNING: listening on a public interface without API_TOKEN set; anyone who can reach this port can upload and run bots.');
}
httpServer.listen(PORT, HOST, () => {
  console.log(`Poker Bot Simulator running at http://${HOST}:${PORT}`);
});
