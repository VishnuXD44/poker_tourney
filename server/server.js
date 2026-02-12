import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '250kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

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

app.post('/api/bots', (req, res) => {
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

app.put('/api/bots/:id', (req, res) => {
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

app.delete('/api/bots/:id', (req, res) => {
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

function createMatchOnUpdate(matchId) {
  return (payload) => {
    io.emit('MATCH_UPDATE', { matchId, ...payload });
  };
}

io.on('connection', (socket) => {
  socket.on('new_match', async (payload, ack) => {
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
      if (result.error) io.emit('MATCH_UPDATE', { matchId, type: 'MATCH_ERROR', error: result.error });
    } catch (err) {
      console.error('Match error:', err);
      io.emit('MATCH_UPDATE', { matchId, type: 'MATCH_ERROR', error: String(err.message) });
    }
  });
});

app.post('/api/matches/run', async (req, res) => {
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Poker Bot Simulator running at http://localhost:${PORT}`);
});
