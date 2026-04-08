const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.API_KEY || '12341';
const DB_PATH = path.join(__dirname, 'data', 'players.json');

let db = { players: {}, updatedAt: null };
let writeQueue = Promise.resolve();

function requireApiKey(req, res, next) {
  const key = req.header('x-api-key');
  if (!key || key !== API_KEY) {
    return res.status(401).json({ ok: false, message: 'Invalid API key' });
  }
  next();
}

function normalizePayload(input) {
  const username = String(input?.username || '').trim();
  if (!username) return null;

  const coinsRaw = Number(input?.coins ?? 0);
  const coins = Number.isFinite(coinsRaw) ? Math.max(0, coinsRaw) : 0;
  const job = String(input?.job || 'builder').trim().toLowerCase();
  const roles = Array.isArray(input?.roles)
    ? input.roles.map((v) => String(v).trim()).filter(Boolean)
    : [];
  const statusRaw = String(input?.status || 'pending').toLowerCase();
  const status = ['pending', 'approved', 'rejected'].includes(statusRaw) ? statusRaw : 'pending';

  return { username, coins, job, roles, status };
}

async function ensureDb() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  try {
    const raw = await fs.readFile(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    db.players = parsed.players && typeof parsed.players === 'object' ? parsed.players : {};
    db.updatedAt = parsed.updatedAt || null;
  } catch {
    await persist();
  }
}

function persist() {
  db.updatedAt = new Date().toISOString();
  writeQueue = writeQueue
    .then(() => fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf8'))
    .catch((err) => {
      console.error('[Coinverse Backend] DB write failed:', err.message);
    });
  return writeQueue;
}

function upsertPlayer(payload) {
  const key = payload.username.toLowerCase();
  const prev = db.players[key] || {};
  db.players[key] = {
    username: payload.username,
    coins: payload.coins,
    job: payload.job,
    roles: payload.roles,
    status: payload.status,
    createdAt: prev.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  return db.players[key];
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'coinverse-backend', updatedAt: db.updatedAt });
});

app.post('/player/register', requireApiKey, async (req, res) => {
  const payload = normalizePayload(req.body);
  if (!payload) return res.status(400).json({ ok: false, message: 'username is required' });

  const key = payload.username.toLowerCase();
  const created = !db.players[key];
  const player = upsertPlayer(payload);
  await persist();
  res.json({ ok: true, created, player });
});

app.post('/player/update', requireApiKey, async (req, res) => {
  const payload = normalizePayload(req.body);
  if (!payload) return res.status(400).json({ ok: false, message: 'username is required' });

  const player = upsertPlayer(payload);
  await persist();
  res.json({ ok: true, player });
});

app.get('/player/:username', requireApiKey, (req, res) => {
  const key = String(req.params.username || '').toLowerCase();
  const player = db.players[key];
  if (!player) return res.status(404).json({ ok: false, message: 'Player not found' });
  res.json({ ok: true, player });
});

app.get('/admin/players', requireApiKey, (req, res) => {
  const players = Object.values(db.players).sort((a, b) => (b.coins || 0) - (a.coins || 0));
  res.json({ ok: true, count: players.length, updatedAt: db.updatedAt, players });
});

app.post('/admin/approve', requireApiKey, async (req, res) => {
  const username = String(req.body?.username || '').trim();
  if (!username) return res.status(400).json({ ok: false, message: 'username is required' });

  const key = username.toLowerCase();
  const player = db.players[key];
  if (!player) return res.status(404).json({ ok: false, message: 'Player not found' });

  player.status = 'approved';
  player.updatedAt = new Date().toISOString();
  await persist();
  res.json({ ok: true, player });
});

ensureDb().then(() => {
  app.listen(PORT, () => {
    console.log(`[Coinverse Backend] running on port ${PORT}`);
  });
});
