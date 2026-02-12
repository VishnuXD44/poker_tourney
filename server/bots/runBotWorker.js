/**
 * Worker process: reads one JSON line from stdin { code, state }, runs getAction(state)
 * in a minimal vm context, writes one JSON line to stdout { action, amount? }.
 * No require, process, or host access. Killed by parent on timeout.
 */
import vm from 'vm';
import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  let payload;
  try {
    payload = JSON.parse(line);
  } catch {
    output({ action: 'fold', error: 'Invalid input' });
    return;
  }
  const { code, state } = payload;
  if (typeof code !== 'string' || !state || typeof state !== 'object') {
    output({ action: 'fold', error: 'Missing code or state' });
    return;
  }
  try {
    const sandbox = createSandbox(state);
    const script = new vm.Script(`
      (function() {
        ${code}
        if (typeof getAction !== 'function') throw new Error('getAction(state) is required');
        return getAction(state);
      })();
    `);
    const result = script.runInContext(vm.createContext(sandbox), { timeout: 4500 });
    output(normalizeAction(result));
  } catch (err) {
    output({ action: 'fold', error: err.message || String(err) });
  }
  rl.close();
});

function createSandbox(state) {
  const sandbox = Object.create(null);
  sandbox.state = state;
  sandbox.getAction = undefined;
  sandbox.Math = Math;
  sandbox.JSON = JSON;
  sandbox.Array = Array;
  sandbox.Object = Object;
  sandbox.Number = Number;
  sandbox.String = String;
  sandbox.Boolean = Boolean;
  sandbox.parseInt = parseInt;
  sandbox.parseFloat = parseFloat;
  sandbox.isNaN = isNaN;
  sandbox.isFinite = isFinite;
  sandbox.console = Object.create(null);
  sandbox.console.log = () => {};
  sandbox.console.warn = () => {};
  sandbox.console.error = () => {};
  return sandbox;
}

function normalizeAction(raw) {
  if (!raw || typeof raw !== 'object') return { action: 'fold' };
  const a = (raw.action != null ? raw.action : raw).toString().toLowerCase().trim();
  const amount = typeof raw.amount === 'number' ? raw.amount : parseInt(raw.amount, 10) || 0;
  const out = { action: 'fold' };
  if (a === 'fold') return out;
  if (a === 'check') return { action: 'check' };
  if (a === 'call') return { action: 'call' };
  if (a === 'all-in' || a === 'allin') return { action: 'all-in' };
  if (a === 'raise') return { action: 'raise', amount };
  return out;
}

function output(obj) {
  console.log(JSON.stringify(obj));
}
