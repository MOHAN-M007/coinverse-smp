const keyStore = 'coinverse_api_key';

const apiKeyInput = document.getElementById('apiKey');
const saveKeyBtn = document.getElementById('saveKey');
const playersTable = document.getElementById('playersTable');
const lastSync = document.getElementById('lastSync');

const totalPlayersEl = document.getElementById('totalPlayers');
const totalCoinsEl = document.getElementById('totalCoins');
const pendingCountEl = document.getElementById('pendingCount');

apiKeyInput.value = localStorage.getItem(keyStore) || '';

saveKeyBtn.addEventListener('click', () => {
  localStorage.setItem(keyStore, apiKeyInput.value.trim());
  loadData();
});

function headers() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': localStorage.getItem(keyStore) || ''
  };
}

function fmtDate(value) {
  return value ? new Date(value).toLocaleString() : '-';
}

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) }
  });

  let body = null;
  try { body = await response.json(); } catch { body = null; }

  if (!response.ok) {
    const reason = body?.message || `HTTP ${response.status}`;
    throw new Error(reason);
  }
  return body;
}

async function approve(username) {
  try {
    await api('/admin/approve', {
      method: 'POST',
      body: JSON.stringify({ username })
    });
    await loadData();
  } catch (err) {
    alert(`Approve failed: ${err.message}`);
  }
}

function renderRows(players) {
  playersTable.innerHTML = '';

  for (const p of players) {
    const tr = document.createElement('tr');
    const canApprove = p.status !== 'approved';

    tr.innerHTML = `
      <td>${p.username}</td>
      <td>${Number(p.coins || 0).toFixed(2)}</td>
      <td>${p.job || 'builder'}</td>
      <td class="status-${p.status || 'pending'}">${p.status || 'pending'}</td>
      <td>${canApprove ? `<button data-user="${p.username}">Approve</button>` : '-'}</td>
    `;

    const btn = tr.querySelector('button[data-user]');
    if (btn) {
      btn.addEventListener('click', () => approve(btn.dataset.user));
    }

    playersTable.appendChild(tr);
  }
}

async function loadData() {
  const key = localStorage.getItem(keyStore);
  if (!key) {
    lastSync.textContent = 'set API key';
    return;
  }

  try {
    const data = await api('/admin/players');
    const players = data.players || [];
    const totalCoins = players.reduce((sum, p) => sum + (Number(p.coins) || 0), 0);
    const pendingCount = players.filter((p) => (p.status || 'pending') === 'pending').length;

    totalPlayersEl.textContent = String(players.length);
    totalCoinsEl.textContent = totalCoins.toFixed(2);
    pendingCountEl.textContent = String(pendingCount);

    renderRows(players);
    lastSync.textContent = `last sync: ${fmtDate(data.updatedAt)}`;
  } catch (err) {
    lastSync.textContent = `error: ${err.message}`;
  }
}

loadData();
setInterval(loadData, 5000);
