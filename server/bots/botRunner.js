import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_SCRIPT = path.join(__dirname, 'runBotWorker.js');
const ACTION_TIMEOUT_MS = 5000;
const MAX_CODE_LENGTH = 50000;

const FORBIDDEN_PATTERNS = [
  /\brequire\s*\(/,
  /\bimport\s*\(/,
  /\bimport\s+[\s\w{},*]+\s+from\s+/,
  /\bprocess\./,
  /\bglobal\b/,
  /\bglobalThis\b/,
  /\bBuffer\b/,
  /\bchild_process\b/,
  /\bworker_threads\b/,
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /\bconstructor\s*\(/,
  /\b__proto__\b/,
  /\b__dirname\b/,
  /\b__filename\b/,
  /\bfs\./,
  /\brequire\s*\./,
  /\bmodule\b/,
  /\bexports\b/,
  /\bReflect\b/,
  /\bProxy\b/,
  /\bSymbol\s*\./,
  /\bSymbol\s*\(/,
];

/**
 * Reject code that clearly tries to access Node/host. Not a full security boundary;
 * the child process + timeout is the real isolation.
 */
export function validateBotCode(code) {
  if (typeof code !== 'string') return { valid: false, error: 'Code must be a string' };
  if (code.length > MAX_CODE_LENGTH) return { valid: false, error: `Code must be at most ${MAX_CODE_LENGTH} characters` };
  if (code.length === 0) return { valid: false, error: 'Code cannot be empty' };
  const trimmed = code.trim();
  if (!trimmed.includes('getAction')) return { valid: false, error: 'Code must define getAction(state)' };
  for (const re of FORBIDDEN_PATTERNS) {
    if (re.test(code)) return { valid: false, error: 'Code contains disallowed pattern' };
  }
  return { valid: true };
}

/**
 * Run bot in a separate process. Returns { action, amount? } or defaults to fold on timeout/error.
 */
export function runBotCode(code, state) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ code, state }) + '\n';
    const child = spawn(process.execPath, [WORKER_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let resolved = false;
    const done = (result) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      try { child.kill('SIGKILL'); } catch (_) {}
      resolve(result);
    };

    const timer = setTimeout(() => {
      done({ action: 'fold' });
    }, ACTION_TIMEOUT_MS);

    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stdout.on('end', () => {
      const line = stdout.split('\n')[0];
      if (!line) return done({ action: 'fold' });
      try {
        const out = JSON.parse(line);
        if (out.error) return done({ action: 'fold' });
        done({ action: out.action || 'fold', amount: out.amount });
      } catch {
        done({ action: 'fold' });
      }
    });

    child.stderr.on('data', () => {});
    child.on('error', () => done({ action: 'fold' }));
    child.on('close', (code, signal) => {
      if (!resolved) done({ action: 'fold' });
    });

    child.stdin.write(payload, (err) => {
      if (err) done({ action: 'fold' });
      try { child.stdin.end(); } catch (_) {}
    });
  });
}

/**
 * Returns an async getAction(state) that runs the bot in a child process.
 */
export function createGetActionFromCode(code) {
  const validation = validateBotCode(code);
  if (!validation.valid) {
    return async function getAction() {
      throw new Error(validation.error);
    };
  }
  return async function getAction(state) {
    return runBotCode(code, state);
  };
}
