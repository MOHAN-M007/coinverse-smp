const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.API_KEY || '12341';
const DB_PATH = path.join(__dirname, 'data', 'players.json');

let db = { players: {}, actions: [], updatedAt: null };
let writeQueue = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function requireApiKey(req, res, next) {
  const key = req.header('x-api-key');
  if (!key || key !== API_KEY) {
    return res.status(401).json({ ok: false, message: 'Invalid API key' });
  }
  next();
}

function uniqueStrings(input) {
  const items = Array.isArray(input) ? input : [];
  return [...new Set(items.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))];
}

function normalizeStatus(status, fallback = 'pending') {
  const value = String(status || fallback).trim().toLowerCase();
  return ['pending', 'approved', 'rejected'].includes(value) ? value : fallback;
}

function normalizePlayerRecord(input, existing = {}, usernameFromKey = '') {
  const username = String(input?.username || existing.username || usernameFromKey || '').trim();
  if (!username) return null;

  const coinsCandidate = input?.coins !== undefined ? Number(input.coins) : Number(existing.coins ?? 0);
  const coins = Number.isFinite(coinsCandidate) ? Math.max(0, coinsCandidate) : 0;

  const job = String(input?.job ?? existing.job ?? 'builder').trim().toLowerCase() || 'builder';
  const jobs = input?.jobs !== undefined
    ? uniqueStrings(input.jobs)
    : uniqueStrings(existing.jobs || (job ? [job] : []));
  const roles = input?.roles !== undefined
    ? uniqueStrings(input.roles)
    : uniqueStrings(existing.roles || ['player']);

  return {
    username,
    uuid: String(input?.uuid ?? existing.uuid ?? '').trim(),
    joinDate: String(input?.joinDate ?? existing.joinDate ?? '').trim(),
    coins,
    job,
    jobs,
    roles,
    status: normalizeStatus(input?.status, existing.status || 'pending'),
    banned: input?.banned !== undefined ? Boolean(input.banned) : Boolean(existing.banned),
    banReason: String(input?.banReason ?? existing.banReason ?? '').trim(),
    bannedAt: existing.bannedAt || null,
    kickReason: String(existing.kickReason || ''),
    lastKickAt: existing.lastKickAt || null,
    kickCount: Number(existing.kickCount || 0),
    createdAt: existing.createdAt || nowIso(),
    updatedAt: nowIso()
  };
}

function hydrateDb(parsed) {
  const rawPlayers = parsed?.players && typeof parsed.players === 'object' ? parsed.players : parsed;
  const players = {};

  if (rawPlayers && typeof rawPlayers === 'object') {
    for (const [key, value] of Object.entries(rawPlayers)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const record = normalizePlayerRecord(value, {}, key);
      if (!record) continue;
      players[record.username.toLowerCase()] = record;
    }
  }

  const actions = Array.isArray(parsed?.actions)
    ? parsed.actions.filter((entry) => entry && typeof entry === 'object')
    : [];

  db = {
    players,
    actions,
    updatedAt: parsed?.updatedAt || nowIso()
  };
}

async function ensureDb() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  try {
    const raw = await fs.readFile(DB_PATH, 'utf8');
    hydrateDb(JSON.parse(raw));
  } catch {
    await persist();
  }
}

function persist() {
  db.updatedAt = nowIso();
  writeQueue = writeQueue
    .then(() => fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf8'))
    .catch((err) => {
      console.error('[Coinverse Backend] DB write failed:', err.message);
    });
  return writeQueue;
}

function getPlayer(username) {
  return db.players[String(username || '').trim().toLowerCase()] || null;
}

function savePlayer(record) {
  db.players[record.username.toLowerCase()] = record;
  db.updatedAt = nowIso();
  return record;
}

function upsertFromPlugin(input) {
  const username = String(input?.username || '').trim();
  if (!username) return null;
  const existing = getPlayer(username) || {};
  const record = normalizePlayerRecord(input, existing, username);
  if (!record) return null;
  if (record.banned && !record.bannedAt) {
    record.bannedAt = existing.bannedAt || nowIso();
  }
  return savePlayer(record);
}

function queueAction(type, username, reason = '') {
  const action = {
    id: crypto.randomUUID(),
    type,
    username,
    reason: String(reason || '').trim(),
    createdAt: nowIso(),
    handled: false
  };
  db.actions.unshift(action);
  db.actions = db.actions.slice(0, 100);
  return action;
}

function sortedPlayers() {
  return Object.values(db.players).sort((a, b) => {
    if (Boolean(a.banned) !== Boolean(b.banned)) return a.banned ? -1 : 1;
    if ((a.status || '') !== (b.status || '')) {
      const order = { pending: 0, rejected: 1, approved: 2 };
      return (order[a.status] ?? 3) - (order[b.status] ?? 3);
    }
    return (b.coins || 0) - (a.coins || 0);
  });
}

function playerProfileView(player) {
  return {
    ...player,
    roles: Array.isArray(player.roles) ? player.roles : [],
    jobs: Array.isArray(player.jobs) ? player.jobs : []
  };
}

app.get('/health', (_req, res) => {
  const players = Object.values(db.players);
  res.json({
    ok: true,
    service: 'coinverse-backend',
    updatedAt: db.updatedAt,
    players: players.length,
    pending: players.filter((player) => player.status === 'pending').length,
    banned: players.filter((player) => player.banned).length
  });
});

app.post('/player/register', requireApiKey, async (req, res) => {
  const wasExisting = Boolean(getPlayer(req.body?.username));
  const player = upsertFromPlugin({
    username: req.body?.username,
    uuid: req.body?.uuid,
    joinDate: req.body?.joinDate,
    coins: req.body?.coins,
    job: req.body?.job,
    jobs: req.body?.jobs,
    roles: req.body?.roles,
    status: req.body?.status
  });

  if (!player) {
    return res.status(400).json({ ok: false, message: 'username is required' });
  }

  await persist();
  res.json({ ok: true, created: !wasExisting, player: playerProfileView(player) });
});

app.post('/player/update', requireApiKey, async (req, res) => {
  const player = upsertFromPlugin(req.body);
  if (!player) {
    return res.status(400).json({ ok: false, message: 'username is required' });
  }
  await persist();
  res.json({ ok: true, player: playerProfileView(player) });
});

app.get('/player/:username', requireApiKey, (req, res) => {
  const player = getPlayer(req.params.username);
  if (!player) {
    return res.status(404).json({ ok: false, message: 'Player not found' });
  }
  res.json({ ok: true, player: playerProfileView(player) });
});

app.get('/admin/players', requireApiKey, (req, res) => {
  const players = sortedPlayers();
  res.json({ ok: true, count: players.length, updatedAt: db.updatedAt, players });
});

app.get('/admin/player/:username', requireApiKey, (req, res) => {
  const player = getPlayer(req.params.username);
  if (!player) {
    return res.status(404).json({ ok: false, message: 'Player not found' });
  }
  res.json({ ok: true, player: playerProfileView(player) });
});

app.post('/admin/approve', requireApiKey, async (req, res) => {
  const player = getPlayer(req.body?.username);
  if (!player) {
    return res.status(404).json({ ok: false, message: 'Player not found' });
  }

  player.status = 'approved';
  player.updatedAt = nowIso();
  savePlayer(player);
  await persist();
  res.json({ ok: true, player: playerProfileView(player) });
});

app.post('/admin/reject', requireApiKey, async (req, res) => {
  const player = getPlayer(req.body?.username);
  if (!player) {
    return res.status(404).json({ ok: false, message: 'Player not found' });
  }

  player.status = 'rejected';
  player.updatedAt = nowIso();
  savePlayer(player);
  await persist();
  res.json({ ok: true, player: playerProfileView(player) });
});

app.post('/admin/roles', requireApiKey, async (req, res) => {
  const player = getPlayer(req.body?.username);
  if (!player) {
    return res.status(404).json({ ok: false, message: 'Player not found' });
  }

  player.roles = uniqueStrings(req.body?.roles);
  player.updatedAt = nowIso();
  savePlayer(player);
  await persist();
  res.json({ ok: true, player: playerProfileView(player) });
});

app.post('/admin/ban', requireApiKey, async (req, res) => {
  const player = getPlayer(req.body?.username);
  if (!player) {
    return res.status(404).json({ ok: false, message: 'Player not found' });
  }

  player.banned = true;
  player.banReason = String(req.body?.reason || '').trim();
  player.bannedAt = nowIso();
  player.updatedAt = nowIso();
  savePlayer(player);
  queueAction('ban', player.username, player.banReason);
  await persist();
  res.json({ ok: true, player: playerProfileView(player) });
});

app.post('/admin/unban', requireApiKey, async (req, res) => {
  const player = getPlayer(req.body?.username);
  if (!player) {
    return res.status(404).json({ ok: false, message: 'Player not found' });
  }

  player.banned = false;
  player.banReason = '';
  player.bannedAt = null;
  player.updatedAt = nowIso();
  savePlayer(player);
  queueAction('unban', player.username, '');
  await persist();
  res.json({ ok: true, player: playerProfileView(player) });
});

app.post('/admin/kick', requireApiKey, async (req, res) => {
  const player = getPlayer(req.body?.username);
  if (!player) {
    return res.status(404).json({ ok: false, message: 'Player not found' });
  }

  player.kickReason = String(req.body?.reason || '').trim();
  player.lastKickAt = nowIso();
  player.kickCount = Number(player.kickCount || 0) + 1;
  player.updatedAt = nowIso();
  savePlayer(player);
  const action = queueAction('kick', player.username, player.kickReason);
  await persist();
  res.json({ ok: true, queued: true, action, player: playerProfileView(player) });
});

app.get('/admin/actions', requireApiKey, (req, res) => {
  res.json({ ok: true, count: db.actions.length, actions: db.actions });
});

ensureDb().then(() => {
  app.listen(PORT, () => {
    console.log(`[Coinverse Backend] running on port ${PORT}`);
  });
});
