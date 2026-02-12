const API = '/api';

let bots = [];
let editingBotId = null;
let lastResult = null;

const tabEls = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
const botListEl = document.getElementById('bot-list');
const botEditorWrap = document.getElementById('bot-editor-wrap');
const botNameInput = document.getElementById('bot-name');
const botCodeEl = document.getElementById('bot-code');
const matchBotCheckboxes = document.getElementById('match-bot-checkboxes');
const resultsPlaceholder = document.getElementById('results-placeholder');
const resultsContent = document.getElementById('results-content');
const resultsSummary = document.getElementById('results-summary');
const chipStandings = document.getElementById('chip-standings');
const handLogsInner = document.getElementById('hand-logs-inner');

tabEls.forEach(tab => {
  tab.addEventListener('click', () => {
    const t = tab.dataset.tab;
    tabEls.forEach(x => x.classList.toggle('active', x.dataset.tab === t));
    panels.forEach(p => {
      const id = p.id.replace('panel-', '');
      p.classList.toggle('active', id === t);
    });
    if (t === 'results' && lastResult) renderResults(lastResult);
  });
});

document.getElementById('btn-new-bot').addEventListener('click', () => {
  editingBotId = null;
  botNameInput.value = '';
  botCodeEl.value = `#include <iostream>

int main() {
  // TODO: Implement your poker bot according to the engine protocol.
  // Read game state from stdin and write a single JSON line with your action.
  return 0;
}`;
  botEditorWrap.hidden = false;
});

document.getElementById('btn-cancel-bot').addEventListener('click', () => {
  editingBotId = null;
  botEditorWrap.hidden = true;
});

document.getElementById('btn-save-bot').addEventListener('click', saveBot);

async function saveBot() {
  const name = botNameInput.value.trim();
  const code = botCodeEl.value.trim();
  if (!name) return alert('Enter a bot name');
  if (!code) return alert('Enter bot source code');

  const existingBot = editingBotId ? bots.find(b => b.id === editingBotId) : null;
  const safeBase =
    (name || 'bot')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/gi, '_') || 'bot';
  const filename = existingBot?.filename || `${safeBase}.cpp`;

  try {
    if (editingBotId) {
      await fetch(`${API}/bots/${editingBotId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, code, filename })
      });
    } else {
      await fetch(`${API}/bots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, code, filename })
      });
    }
    editingBotId = null;
    botEditorWrap.hidden = true;
    loadBots();
  } catch (e) {
    alert('Failed to save: ' + e.message);
  }
}

function editBot(id) {
  const bot = bots.find(b => b.id === id);
  if (!bot) return;
  editingBotId = id;
  botNameInput.value = bot.name;
  botCodeEl.value = '';
  botEditorWrap.hidden = false;
}

async function deleteBot(id) {
  if (!confirm('Delete this bot?')) return;
  try {
    await fetch(`${API}/bots/${id}`, { method: 'DELETE' });
    if (editingBotId === id) {
      editingBotId = null;
      botEditorWrap.hidden = true;
    }
    loadBots();
  } catch (e) {
    alert('Failed to delete: ' + e.message);
  }
}

async function loadBots() {
  try {
    const res = await fetch(`${API}/bots`);
    bots = await res.json();
    renderBotList();
    renderMatchCheckboxes();
  } catch (e) {
    console.error(e);
    bots = [];
    renderBotList();
  }
}

function renderBotList() {
  botListEl.innerHTML = bots.length
    ? bots.map(b => `
      <li>
        <span class="bot-name">${escapeHtml(b.name)}</span>
        <div class="bot-actions">
          <button type="button" class="btn btn-ghost" data-edit="${b.id}">Edit</button>
          <button type="button" class="btn btn-danger" data-delete="${b.id}">Delete</button>
        </div>
      </li>
    `).join('')
    : '<li class="empty">No bots yet. Click “New Bot” to add one.</li>';
  botListEl.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => editBot(btn.dataset.edit)));
  botListEl.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', () => deleteBot(btn.dataset.delete)));
}

function renderMatchCheckboxes() {
  matchBotCheckboxes.innerHTML = bots.map(b => `
    <label><input type="checkbox" value="${b.id}" name="match-bot"> ${escapeHtml(b.name)}</label>
  `).join('');
}

document.getElementById('btn-run-match').addEventListener('click', async () => {
  const checked = Array.from(document.querySelectorAll('input[name="match-bot"]:checked')).map(c => c.value);
  if (checked.length < 2) return alert('Select at least 2 bots');
  const numHands = parseInt(document.getElementById('match-hands').value, 10) || 50;
  const smallBlind = parseInt(document.getElementById('match-sb').value, 10) || 10;
  const bigBlind = parseInt(document.getElementById('match-bb').value, 10) || 20;
  const startingChips = parseInt(document.getElementById('match-chips').value, 10) || 1000;

  const btn = document.getElementById('btn-run-match');
  btn.disabled = true;
  btn.textContent = 'Running…';
  try {
    const res = await fetch(`${API}/matches/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botIds: checked, numHands, smallBlind, bigBlind, startingChips })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    lastResult = data;
    document.querySelector('.tab[data-tab="results"]').click();
    renderResults(data);
  } catch (e) {
    alert('Match failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Match';
  }
});

function renderResults(data) {
  resultsPlaceholder.hidden = true;
  resultsContent.hidden = false;
  resultsSummary.textContent = data.winner
    ? `Winner: ${data.winner} (after ${data.numHandsPlayed} hands)`
    : `Match ended after ${data.numHandsPlayed} hands.`;
  const sorted = [...data.chipCounts].sort((a, b) => b.chips - a.chips);
  chipStandings.innerHTML = `
    <h3>Chip count</h3>
    <ul>
      ${sorted.map((p, i) => `
        <li class="${i === 0 && data.winner ? 'winner' : ''}">
          <span>${escapeHtml(p.name)}</span>
          <span>${p.chips}</span>
        </li>
      `).join('')}
    </ul>
  `;
  handLogsInner.innerHTML = data.handLogs.slice(0, 20).map(h => `
    <div class="hand-block">
      <strong>Hand ${h.hand}</strong>
      ${h.events.map(ev => renderLogEvent(ev)).join('')}
    </div>
  `).join('');
  if (data.handLogs.length > 20) {
    handLogsInner.innerHTML += `<p class="event">… and ${data.handLogs.length - 20} more hands.</p>`;
  }
}

function renderLogEvent(ev) {
  const c = ev.type === 'action' ? 'event-action' : ev.type === 'win' ? 'event-win' : ev.type === 'error' ? 'event-error' : 'event';
  if (ev.type === 'action') return `<div class="${c}">${escapeHtml(ev.player)} ${ev.action}${ev.amount != null ? ' ' + ev.amount : ''}</div>`;
  if (ev.type === 'win') return `<div class="${c}">${escapeHtml(ev.player)} wins ${ev.amount}</div>`;
  if (ev.type === 'error') return `<div class="${c}">${escapeHtml(ev.player)}: ${escapeHtml(ev.message)}</div>`;
  if (ev.type === 'street') return `<div class="${c}">${ev.street}: ${(ev.cards || []).join(' ')}</div>`;
  if (ev.type === 'showdown') return `<div class="${c}">Showdown — winners: ${(ev.winners || []).join(', ')}</div>`;
  return `<div class="${c}">${JSON.stringify(ev)}</div>`;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

loadBots();
