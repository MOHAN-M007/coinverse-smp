const keyStore = 'coinverse_api_key';

const apiKeyInput = document.getElementById('apiKey');
const saveKeyBtn = document.getElementById('saveKey');
const refreshBtn = document.getElementById('refreshBtn');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const playersTable = document.getElementById('playersTable');
const lastSync = document.getElementById('lastSync');
const totalPlayersEl = document.getElementById('totalPlayers');
const totalCoinsEl = document.getElementById('totalCoins');
const pendingCountEl = document.getElementById('pendingCount');
const bannedCountEl = document.getElementById('bannedCount');
const profileState = document.getElementById('profileState');
const profileEmpty = document.getElementById('profileEmpty');
const profileContent = document.getElementById('profileContent');
const profileName = document.getElementById('profileName');
const profileStatus = document.getElementById('profileStatus');
const profileBan = document.getElementById('profileBan');
const profileUuid = document.getElementById('profileUuid');
const profileJoinDate = document.getElementById('profileJoinDate');
const profileCoins = document.getElementById('profileCoins');
const profileJob = document.getElementById('profileJob');
const profileJobs = document.getElementById('profileJobs');
const profileUpdated = document.getElementById('profileUpdated');
const rolesInput = document.getElementById('rolesInput');
const saveRolesBtn = document.getElementById('saveRolesBtn');
const approveBtn = document.getElementById('approveBtn');
const rejectBtn = document.getElementById('rejectBtn');
const kickBtn = document.getElementById('kickBtn');
const banBtn = document.getElementById('banBtn');
const unbanBtn = document.getElementById('unbanBtn');

const state = {
  players: [],
  selected: null
};

apiKeyInput.value = localStorage.getItem(keyStore) || '';

function getApiKey() {
  return (localStorage.getItem(keyStore) || '').trim();
}

function headers(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': getApiKey(),
    ...extra
  };
}

function fmtDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function fmtCoins(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function roleList(player) {
  return Array.isArray(player.roles) ? player.roles : [];
}

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: headers(options.headers || {})
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new Error(body?.message || `HTTP ${response.status}`);
  }

  return body;
}

function renderSummary(players) {
  totalPlayersEl.textContent = String(players.length);
  totalCoinsEl.textContent = fmtCoins(players.reduce((sum, player) => sum + Number(player.coins || 0), 0));
  pendingCountEl.textContent = String(players.filter((player) => player.status === 'pending').length);
  bannedCountEl.textContent = String(players.filter((player) => player.banned).length);
}

function filteredPlayers() {
  const term = searchInput.value.trim().toLowerCase();
  const filter = statusFilter.value;

  return state.players.filter((player) => {
    const matchesTerm = !term || player.username.toLowerCase().includes(term) || roleList(player).join(', ').includes(term);
    const matchesFilter = filter === 'all'
      ? true
      : filter === 'banned'
        ? Boolean(player.banned)
        : player.status === filter;
    return matchesTerm && matchesFilter;
  });
}

function statusBadge(player) {
  if (player.banned) return '<span class="badge banned">banned</span>';
  return `<span class="badge ${escapeHtml(player.status || 'pending')}">${escapeHtml(player.status || 'pending')}</span>`;
}

function renderRows() {
  const rows = filteredPlayers();
  playersTable.innerHTML = rows.length
    ? rows.map((player) => `
      <tr data-user="${escapeHtml(player.username)}" class="${state.selected?.username === player.username ? 'active-row' : ''}">
        <td>
          <strong>${escapeHtml(player.username)}</strong>
          <small>${escapeHtml(player.uuid || '')}</small>
        </td>
        <td>${fmtCoins(player.coins)}</td>
        <td>${escapeHtml(player.job || 'none')}</td>
        <td>${roleList(player).length ? roleList(player).map((role) => `<span class="pill">${escapeHtml(role)}</span>`).join(' ') : '-'}</td>
        <td>${statusBadge(player)}</td>
        <td><button class="row-btn" data-open="${escapeHtml(player.username)}">Manage</button></td>
      </tr>
    `).join('')
    : '<tr><td colspan="6" class="empty-row">No players match the current filter.</td></tr>';

  playersTable.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      selectPlayer(button.dataset.open);
    });
  });

  playersTable.querySelectorAll('tr[data-user]').forEach((row) => {
    row.addEventListener('click', () => selectPlayer(row.dataset.user));
  });
}

function selectPlayer(username) {
  loadProfile(username).catch((error) => {
    alert(error.message);
  });
}

function setProfile(player) {
  state.selected = player;
  renderRows();

  if (!player) {
    profileEmpty.hidden = false;
    profileContent.hidden = true;
    profileState.textContent = 'Select a player to manage';
    return;
  }

  profileEmpty.hidden = true;
  profileContent.hidden = false;
  profileState.textContent = `Managing ${player.username}`;
  profileName.textContent = player.username;
  profileStatus.className = `badge ${player.status || 'pending'}`;
  profileStatus.textContent = player.status || 'pending';
  profileBan.className = `badge ${player.banned ? 'banned' : 'muted'}`;
  profileBan.textContent = player.banned ? `Banned${player.banReason ? `: ${player.banReason}` : ''}` : 'Not banned';
  profileUuid.textContent = player.uuid || '-';
  profileJoinDate.textContent = fmtDate(player.joinDate || player.createdAt);
  profileCoins.textContent = fmtCoins(player.coins);
  profileJob.textContent = player.job || 'none';
  profileJobs.textContent = Array.isArray(player.jobs) && player.jobs.length ? player.jobs.join(', ') : '-';
  profileUpdated.textContent = fmtDate(player.updatedAt);
  rolesInput.value = roleList(player).join(', ');
}

async function loadProfile(username) {
  const data = await api(`/admin/player/${encodeURIComponent(username)}`);
  setProfile(data.player || null);
}

async function loadDashboard(preserveSelection = true) {
  if (!getApiKey()) {
    lastSync.textContent = 'Set API key to connect';
    return;
  }

  try {
    const data = await api('/admin/players');
    state.players = Array.isArray(data.players) ? data.players : [];
    renderSummary(state.players);
    renderRows();
    lastSync.textContent = `Last sync: ${fmtDate(data.updatedAt)}`;

    if (preserveSelection && state.selected) {
      const exists = state.players.find((player) => player.username.toLowerCase() === state.selected.username.toLowerCase());
      if (exists) {
        await loadProfile(exists.username);
        return;
      }
    }

    if (!state.selected && state.players.length) {
      await loadProfile(state.players[0].username);
    } else if (!state.players.length) {
      setProfile(null);
    }
  } catch (error) {
    lastSync.textContent = `Error: ${error.message}`;
  }
}

async function performAction(path, payload = {}, successText = 'Saved') {
  if (!state.selected) return;
  try {
    await api(path, {
      method: 'POST',
      body: JSON.stringify({ username: state.selected.username, ...payload })
    });
    profileState.textContent = successText;
    await loadDashboard(true);
  } catch (error) {
    alert(error.message);
  }
}

saveKeyBtn.addEventListener('click', async () => {
  localStorage.setItem(keyStore, apiKeyInput.value.trim());
  await loadDashboard(false);
});

refreshBtn.addEventListener('click', () => loadDashboard(true));
searchInput.addEventListener('input', renderRows);
statusFilter.addEventListener('change', renderRows);

saveRolesBtn.addEventListener('click', async () => {
  const roles = rolesInput.value
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  await performAction('/admin/roles', { roles }, 'Roles updated');
});

approveBtn.addEventListener('click', () => performAction('/admin/approve', {}, 'Player approved'));
rejectBtn.addEventListener('click', () => performAction('/admin/reject', {}, 'Player rejected'));

kickBtn.addEventListener('click', async () => {
  if (!state.selected) return;
  const reason = window.prompt(`Kick reason for ${state.selected.username}?`, 'Moderator action');
  if (reason === null) return;
  await performAction('/admin/kick', { reason }, 'Kick queued');
});

banBtn.addEventListener('click', async () => {
  if (!state.selected) return;
  const reason = window.prompt(`Ban reason for ${state.selected.username}?`, 'Rule violation');
  if (reason === null) return;
  await performAction('/admin/ban', { reason }, 'Player banned');
});

unbanBtn.addEventListener('click', () => performAction('/admin/unban', {}, 'Player unbanned'));

loadDashboard(false);
setInterval(() => loadDashboard(true), 5000);
