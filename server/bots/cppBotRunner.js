import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = path.join(__dirname, '..', 'runtime', 'bots');
const SRC_DIR = path.join(RUNTIME_DIR, 'src');
const BIN_DIR = path.join(RUNTIME_DIR, 'bin');

const COMPILE_TIMEOUT_MS = 12000;
const ACTION_TIMEOUT_MS = 500;
const MAX_CPP_CODE_LENGTH = 120000;

const ALLOWED_EXTENSIONS = ['.cpp', '.cc', '.cxx'];
const FORBIDDEN_PATTERNS = [
  /\bsystem\s*\(/i,
  /\bpopen\s*\(/i,
  /\bCreateProcess[A-Za-z0-9_]*\s*\(/i,
  /\bfork\s*\(/i,
  /\bexec[vle]?\s*\(/i,
  /#include\s*<\s*windows\.h\s*>/i,
  /#include\s*<\s*filesystem\s*>/i,
  /#include\s*<\s*thread\s*>/i,
  /#include\s*<\s*future\s*>/i,
  /#include\s*<\s*sys\/socket\.h\s*>/i,
  /#include\s*<\s*winsock2\.h\s*>/i,
];

export const CPP_BOT_CONSTRAINTS = {
  maxCodeLength: MAX_CPP_CODE_LENGTH,
  allowedExtensions: ALLOWED_EXTENSIONS,
  protocol: {
    input: 'One line JSON from stdin with table state fields: stage,pot,currentBet,minRaise,toCall,myChips,myCards,communityCards,opponents',
    output: 'One line JSON to stdout: {"action":"fold|call|check|raise|all-in","amount"?:number}',
    timeoutMs: ACTION_TIMEOUT_MS,
  },
  required: [
    'C++17 source file',
    'Define int main()',
    'Write exactly one JSON response line to stdout',
  ],
  disallowed: [
    'Spawning child processes',
    'Threading and networking headers',
    'Host/system shell execution',
  ],
};

function sanitizeName(name) {
  return String(name || 'bot')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'bot';
}

export function validateCppBotSource(code, filename = '') {
  if (typeof code !== 'string') return { valid: false, error: 'code must be a string' };
  if (!code.trim()) return { valid: false, error: 'code cannot be empty' };
  if (code.length > MAX_CPP_CODE_LENGTH) {
    return { valid: false, error: `code must be at most ${MAX_CPP_CODE_LENGTH} characters` };
  }

  if (filename) {
    const ext = path.extname(String(filename)).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return { valid: false, error: `file extension must be one of: ${ALLOWED_EXTENSIONS.join(', ')}` };
    }
  }

  if (!/\bint\s+main\s*\(/.test(code)) {
    return { valid: false, error: 'C++ bot must define int main(...)' };
  }

  if (!/(std::cout|printf\s*\()/.test(code)) {
    return { valid: false, error: 'C++ bot must write a JSON action to stdout' };
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      return { valid: false, error: 'code contains disallowed APIs or headers' };
    }
  }

  return { valid: true };
}

async function ensureRuntimeDirs() {
  await fs.mkdir(SRC_DIR, { recursive: true });
  await fs.mkdir(BIN_DIR, { recursive: true });
}

function runProcess(command, args, input, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        if (child.killed) return;
        child.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
      } catch (_) {}
      resolve(result);
    };

    timer = setTimeout(() => {
      finish({ ok: false, timeout: true, stdout, stderr });
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (err) => finish({ ok: false, stdout, stderr, error: err.message || String(err) }));
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({ ok: code === 0, code, signal, stdout, stderr });
    });

    if (input) {
      try {
        child.stdin.write(input, (err) => {
          if (err && !settled) finish({ ok: false, stdout, stderr, error: err.message || String(err) });
        });
        child.stdin.end();
      } catch (e) {
        finish({ ok: false, stdout, stderr, error: (e && e.message) || String(e) });
      }
    }
  });
}

export async function compileCppBotSource(code, botName) {
  await ensureRuntimeDirs();
  const base = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitizeName(botName)}`;
  const sourcePath = path.join(SRC_DIR, `${base}.cpp`);
  const binaryPath = path.join(BIN_DIR, process.platform === 'win32' ? `${base}.exe` : base);

  await fs.writeFile(sourcePath, code, 'utf8');
  const compile = await runProcess(
    'g++',
    ['-std=c++17', '-O2', sourcePath, '-o', binaryPath],
    '',
    COMPILE_TIMEOUT_MS
  );

  if (!compile.ok) {
    try { await fs.unlink(sourcePath); } catch (_) {}
    try { await fs.unlink(binaryPath); } catch (_) {}
    const reason = compile.timeout
      ? 'compile timed out'
      : (compile.stderr || compile.stdout || compile.error || 'compile failed').trim();
    return { ok: false, error: reason };
  }

  return { ok: true, sourcePath, binaryPath };
}

function normalizeBotAction(raw) {
  if (!raw || typeof raw !== 'object') return { action: 'fold' };
  const action = String(raw.action || '').toLowerCase().trim();
  const amount = Number.isFinite(raw.amount) ? raw.amount : parseInt(raw.amount, 10) || 0;
  if (action === 'check') return { action: 'check' };
  if (action === 'call') return { action: 'call' };
  if (action === 'all-in' || action === 'allin') return { action: 'all-in' };
  if (action === 'raise') return { action: 'raise', amount };
  return { action: 'fold' };
}

export function createGetActionFromCppExecutable(binaryPath) {
  return async function getAction(state) {
    const payload = JSON.stringify(state) + '\n';
    const run = await runProcess(binaryPath, [], payload, ACTION_TIMEOUT_MS);
    if (!run.ok || !run.stdout) return { action: 'fold' };
    const firstLine = run.stdout.split('\n').find((line) => line.trim().length > 0);
    if (!firstLine) return { action: 'fold' };
    try {
      return normalizeBotAction(JSON.parse(firstLine));
    } catch {
      return { action: 'fold' };
    }
  };
}

export async function removeBotArtifacts(bot) {
  const files = [bot?.sourcePath, bot?.binaryPath].filter(Boolean);
  await Promise.all(
    files.map(async (filePath) => {
      try {
        await fs.unlink(filePath);
      } catch (_) {}
    })
  );
}
