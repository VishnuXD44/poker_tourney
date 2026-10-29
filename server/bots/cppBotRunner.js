import { spawn, execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { compileCommand, runCommand, sandboxEnv, compilerCommand } from './sandbox.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RUNTIME_DIR = path.join(__dirname, '..', 'runtime', 'bots');
const SRC_DIR = path.join(RUNTIME_DIR, 'src');
const BIN_DIR = path.join(RUNTIME_DIR, 'bin');
const JOB_DIR = path.join(RUNTIME_DIR, 'jobs');

const COMPILE_TIMEOUT_MS = 20000;
const ACTION_TIMEOUT_MS = 500;
const MAX_CPP_CODE_LENGTH = 120000;
const MAX_ERROR_LENGTH = 4000;
const MAX_BOT_OUTPUT = 4096;

const ALLOWED_EXTENSIONS = ['.cpp', '.cc', '.cxx'];
/**
 * Source-level checks. These are a first line of defence only: the OS sandbox (see sandbox.js)
 * and the include allowlist below are what actually stop a bot reaching the host.
 * Token pasting (## and its digraph %:%:) is banned because it can assemble any identifier.
 */
const FORBIDDEN_PATTERNS = [
  /##/,
  /%:/,
  /\b_Pragma\b/,
  /#\s*pragma\s+(GCC\s+)?(dependency|system_header|push_macro|include)/i,
  /#\s*(embed|import|include_next)\b/,
  /\b__has_(include|include_next|embed)\b/,
  /\b(__)?asm(__)?\b/,
  /\bincbin\b/i,
  /\bsystem\s*\(/i,
  /\bpopen\s*\(/i,
  /\bCreateProcess[A-Za-z0-9_]*\s*\(/i,
  /\bfork\s*\(/i,
  /\bexec[vlep]*\s*\(/i,
  /\bsyscall\s*\(/,
  /\bdl(open|sym)\s*\(/,
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
    output: 'One line JSON to stdout: {"action":"fold|call|check|raise|all-in","amount"?:number}. For "raise", amount is how much to raise BY on top of calling (at least minRaise).',
    timeoutMs: ACTION_TIMEOUT_MS,
  },
  required: [
    'C++17 source file',
    'Define int main()',
    'Write exactly one JSON response line to stdout',
    'Only standard library / system headers may be included',
  ],
  disallowed: [
    'Spawning child processes',
    'Threading and networking headers',
    'Host/system shell execution',
    'Inline assembly, token pasting (##), #embed and __has_include',
  ],
};

function sanitizeName(name) {
  return String(name || 'bot')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'bot';
}

/** Undo backslash-newline line splicing so patterns can't be split across lines. */
function spliceLines(code) {
  return code.replace(/\\[ \t]*\r?\n/g, '');
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

  const spliced = spliceLines(code);
  if (!/\bint\s+main\s*\(/.test(spliced)) {
    return { valid: false, error: 'C++ bot must define int main(...)' };
  }

  if (!/(std::cout|printf\s*\(|puts\s*\()/.test(spliced)) {
    return { valid: false, error: 'C++ bot must write a JSON action to stdout' };
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(spliced)) {
      return { valid: false, error: `code contains a disallowed construct (${pattern.source})` };
    }
  }

  return { valid: true };
}

async function ensureRuntimeDirs() {
  await fs.mkdir(SRC_DIR, { recursive: true });
  await fs.mkdir(BIN_DIR, { recursive: true });
  await fs.mkdir(JOB_DIR, { recursive: true });
}

function runProcess(command, args, input, timeoutMs, { cwd, env, maxOutput = Infinity } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
      env,
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
        if (!child.killed && child.exitCode === null) {
          child.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
        }
      } catch (_) {}
      resolve(result);
    };

    timer = setTimeout(() => {
      finish({ ok: false, timeout: true, stdout, stderr });
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > maxOutput) finish({ ok: false, stdout: stdout.slice(0, maxOutput), stderr, error: 'output too large' });
    });
    child.stderr.on('data', (chunk) => { if (stderr.length < 64 * 1024) stderr += chunk; });
    child.stdin.on('error', () => {}); // bot exited without reading stdin
    child.on('error', (err) => finish({ ok: false, stdout, stderr, error: err.message || String(err) }));
    child.on('close', (code, signal) => finish({ ok: code === 0, code, signal, stdout, stderr }));

    try {
      child.stdin.end(input || '');
    } catch (e) {
      finish({ ok: false, stdout, stderr, error: (e && e.message) || String(e) });
    }
  });
}

let systemIncludeDirs = null;

/** Directories the compiler searches for <...> headers, resolved to real paths. */
async function getSystemIncludeDirs() {
  if (systemIncludeDirs) return systemIncludeDirs;
  const { command, extraArgs } = compilerCommand();
  const stderr = await new Promise((resolve) => {
    const child = execFile(command, [...extraArgs, '-std=c++17', '-E', '-x', 'c++', '-v', '-'], { timeout: 10000 },
      (_err, _stdout, err) => resolve(err || ''));
    child.stdin.end('');
  });
  const lines = stderr.split(/\r?\n/);
  const start = lines.findIndex(l => l.includes('#include <...> search starts here'));
  const end = lines.findIndex(l => l.startsWith('End of search list'));
  const dirs = start === -1 ? [] : lines.slice(start + 1, end === -1 ? undefined : end)
    .map(l => l.replace(/\(framework directory\)$/, '').trim())
    .filter(Boolean);
  // clang records the SDK's own settings file as a dependency.
  const sysroot = extraArgs.indexOf('-isysroot');
  if (sysroot !== -1) dirs.push(extraArgs[sysroot + 1]);
  systemIncludeDirs = (await Promise.all(dirs.map(d => fs.realpath(d).catch(() => null)))).filter(Boolean);
  return systemIncludeDirs;
}

/** Parses a Makefile-style dependency file written by `-M -MF`. */
function parseDepFile(text) {
  const tokens = text.replace(/\\\r?\n/g, ' ').match(/(?:\\.|[^\s\\])+/g) || [];
  return tokens.slice(1).map(t => t.replace(/\\(.)/g, '$1'));
}

const isInside = (file, dir) => file === dir || file.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep);

/**
 * Rejects sources that include anything other than the bot itself and system headers
 * (e.g. `#include "/etc/passwd"`), which would otherwise leak file contents in compile errors.
 */
async function checkIncludes(jobDir) {
  const depFile = path.join(jobDir, 'deps.d');
  const { command, args } = compileCommand(jobDir, ['-std=c++17', '-M', '-MF', depFile, 'bot.cpp']);
  const run = await runProcess(command, args, '', COMPILE_TIMEOUT_MS, { cwd: jobDir, env: sandboxEnv(jobDir) });
  const text = await fs.readFile(depFile, 'utf8').catch(() => null);
  if (run.timeout) return { ok: false, error: 'compile timed out' };
  if (text == null) return { ok: false, error: 'preprocessing failed (check your #include lines)' };

  const allowed = await getSystemIncludeDirs();
  const source = await fs.realpath(path.join(jobDir, 'bot.cpp'));
  for (const dep of parseDepFile(text)) {
    const real = await fs.realpath(path.resolve(jobDir, dep)).catch(() => null);
    if (real === source) continue;
    if (!real || !allowed.some(dir => isInside(real, dir))) {
      return { ok: false, error: 'only standard library / system headers may be included' };
    }
  }
  if (!run.ok) return { ok: false, error: sanitizeCompilerOutput(run.stderr || 'preprocessing failed', jobDir) };
  return { ok: true };
}

function sanitizeCompilerOutput(text, jobDir) {
  let out = String(text).split(jobDir + path.sep).join('').split(jobDir).join('.');
  if (out.length > MAX_ERROR_LENGTH) out = out.slice(0, MAX_ERROR_LENGTH) + '\n… (truncated)';
  return out.trim();
}

export async function compileCppBotSource(code, botName) {
  await ensureRuntimeDirs();
  const base = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitizeName(botName)}`;
  const sourcePath = path.join(SRC_DIR, `${base}.cpp`);
  const binaryPath = path.join(BIN_DIR, process.platform === 'win32' ? `${base}.exe` : base);
  const jobDir = await fs.realpath(await fs.mkdtemp(path.join(JOB_DIR, 'job-')));
  const jobBinary = process.platform === 'win32' ? 'bot.exe' : 'bot';

  try {
    await fs.writeFile(path.join(jobDir, 'bot.cpp'), code, 'utf8');

    const includes = await checkIncludes(jobDir);
    if (!includes.ok) return { ok: false, error: includes.error };

    const { command, args } = compileCommand(jobDir, ['-std=c++17', '-O2', 'bot.cpp', '-o', jobBinary]);
    const compile = await runProcess(command, args, '', COMPILE_TIMEOUT_MS, { cwd: jobDir, env: sandboxEnv(jobDir) });
    if (!compile.ok) {
      const reason = compile.timeout
        ? 'compile timed out'
        : (compile.stderr || compile.stdout || compile.error || 'compile failed');
      return { ok: false, error: sanitizeCompilerOutput(reason, jobDir) };
    }

    await fs.copyFile(path.join(jobDir, jobBinary), binaryPath);
    await fs.chmod(binaryPath, 0o755);
    await fs.writeFile(sourcePath, code, 'utf8');
    await warmUpBinary(binaryPath);
    return { ok: true, sourcePath, binaryPath };
  } finally {
    await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});
  }
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

const WARM_UP_STATE = {
  stage: 'pre-flop', pot: 30, currentBet: 20, minRaise: 20, toCall: 20, myChips: 1000,
  myCards: ['Ah', 'Kd'], communityCards: [], opponents: [{ name: 'warmup', chips: 980, currentBet: 20, allIn: false }],
};

/**
 * The first launch of a new executable can be slow (macOS verifies it), which would blow
 * the per-action timeout on the bot's first decision. Run it once up front instead.
 */
async function warmUpBinary(binaryPath) {
  const { command, args } = runCommand(binaryPath);
  await runProcess(command, args, JSON.stringify(WARM_UP_STATE) + '\n', 5000, {
    cwd: path.dirname(binaryPath),
    env: sandboxEnv(),
    maxOutput: MAX_BOT_OUTPUT,
  });
}

export function createGetActionFromCppExecutable(binaryPath) {
  return async function getAction(state) {
    const payload = JSON.stringify(state) + '\n';
    const { command, args } = runCommand(binaryPath);
    const run = await runProcess(command, args, payload, ACTION_TIMEOUT_MS, {
      cwd: path.dirname(binaryPath),
      env: sandboxEnv(),
      maxOutput: MAX_BOT_OUTPUT,
    });
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
