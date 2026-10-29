/**
 * OS-level isolation for compiling and running untrusted C++ bots.
 *
 * - macOS: sandbox-exec profile (no network, no writes outside the job dir, reads limited to the toolchain).
 * - Linux: bubblewrap (bwrap) with all namespaces unshared and only /usr, /lib* mounted read-only.
 * - Elsewhere, or when the sandbox self-test fails: no isolation (a warning is logged).
 *
 * BOT_SANDBOX=auto (default) | required (refuse to start without a sandbox) | off
 * CXX overrides the compiler (default: g++, or the Xcode clang++ on macOS).
 */
import { execFile, execFileSync } from 'child_process';
import { promises as fs } from 'fs';

const MODE = (process.env.BOT_SANDBOX || 'auto').toLowerCase();
const RUN_LIMITS = { cpuSeconds: 2, memoryKb: 512 * 1024 };
const COMPILE_LIMITS = { cpuSeconds: 30, memoryKb: 2 * 1024 * 1024 };
const PATH_ENV = '/usr/bin:/bin';

let kind = null; // 'sandbox-exec' | 'bwrap' | null
let compiler = { command: process.env.CXX || 'g++', extraArgs: [] };

function resolveMacCompiler() {
  if (process.env.CXX) return;
  try {
    const cxx = execFileSync('xcrun', ['-f', 'clang++'], { encoding: 'utf8' }).trim();
    const sdk = execFileSync('xcrun', ['--show-sdk-path'], { encoding: 'utf8' }).trim();
    // Calling clang++ directly avoids the xcrun shim, which needs access outside the sandbox.
    if (cxx && sdk) compiler = { command: cxx, extraArgs: ['-isysroot', sdk] };
  } catch (_) {}
}

function sbString(s) {
  return JSON.stringify(s);
}

function macProfile({ readPaths = [], writePaths = [], execPath, allowFork }) {
  const reads = ['(literal "/")', '(subpath "/usr/lib")', '(subpath "/System")', '(subpath "/private/var/db/dyld")',
    '(subpath "/dev")', ...readPaths.map(p => `(subpath ${sbString(p)})`)];
  const writes = ['(literal "/dev/null")', ...writePaths.map(p => `(subpath ${sbString(p)})`)];
  return [
    '(version 1)',
    '(deny default)',
    execPath ? `(allow process-exec (literal ${sbString(execPath)}))` : '(allow process-exec)',
    allowFork ? '(allow process-fork)(allow signal (target same-sandbox))(allow mach-lookup)' : '',
    '(allow file-read-metadata)',
    '(allow sysctl-read)',
    `(allow file-read* ${reads.join(' ')})`,
    `(allow file-write* ${writes.join(' ')})`,
  ].join('');
}

const BWRAP_SYSTEM = [
  '--ro-bind', '/usr', '/usr',
  '--ro-bind-try', '/lib', '/lib',
  '--ro-bind-try', '/lib64', '/lib64',
  '--ro-bind-try', '/lib32', '/lib32',
  '--ro-bind-try', '/bin', '/bin',
  '--ro-bind-try', '/etc/ld.so.cache', '/etc/ld.so.cache',
  '--ro-bind-try', '/etc/alternatives', '/etc/alternatives',
  '--dev', '/dev',
  '--tmpfs', '/tmp',
  '--unshare-all',
  '--die-with-parent',
  '--new-session',
  '--clearenv',
  '--setenv', 'PATH', PATH_ENV,
];

/** Wraps a command in /bin/sh so ulimits apply before exec. */
function withLimits(limits, command, args) {
  if (process.platform === 'win32') return { command, args };
  const ulimits = [`-t ${limits.cpuSeconds}`, '-c 0'];
  // macOS does not support RLIMIT_AS; the sandbox and action timeout bound bots there instead.
  if (process.platform === 'linux') ulimits.push(`-v ${limits.memoryKb}`);
  return { command: '/bin/sh', args: ['-c', `ulimit ${ulimits.join(' ')} && exec "$@"`, 'sh', command, ...args] };
}

/** Command that compiles `bot.cpp` into `bot` inside jobDir (cwd must be jobDir). */
export function compileCommand(jobDir, args) {
  const cxxArgs = [...compiler.extraArgs, ...args];
  if (kind === 'sandbox-exec') {
    const profile = macProfile({
      readPaths: ['/usr', '/Library/Developer', '/Applications/Xcode.app', '/opt/homebrew', '/usr/local', '/private/var/db', jobDir],
      writePaths: [jobDir],
      allowFork: true,
    });
    return withLimits(COMPILE_LIMITS, '/usr/bin/sandbox-exec', ['-p', profile, compiler.command, ...cxxArgs]);
  }
  if (kind === 'bwrap') {
    return withLimits(COMPILE_LIMITS, 'bwrap', [
      ...BWRAP_SYSTEM, '--bind', jobDir, jobDir, '--chdir', jobDir, '--setenv', 'TMPDIR', '/tmp',
      compiler.command, ...cxxArgs,
    ]);
  }
  return withLimits(COMPILE_LIMITS, compiler.command, cxxArgs);
}

/** Command that runs a compiled bot binary. */
export function runCommand(binaryPath) {
  if (kind === 'sandbox-exec') {
    const profile = macProfile({ readPaths: [binaryPath], execPath: binaryPath, allowFork: false });
    return withLimits(RUN_LIMITS, '/usr/bin/sandbox-exec', ['-p', profile, binaryPath]);
  }
  if (kind === 'bwrap') {
    return withLimits(RUN_LIMITS, 'bwrap', [...BWRAP_SYSTEM, '--ro-bind', binaryPath, '/bot', '/bot']);
  }
  return withLimits(RUN_LIMITS, binaryPath, []);
}

/** Minimal environment for compiler and bot processes. */
export function sandboxEnv(tmpDir) {
  if (process.platform === 'win32') return process.env;
  return { PATH: PATH_ENV, ...(tmpDir ? { TMPDIR: tmpDir } : {}) };
}

export function compilerCommand() {
  return compiler;
}

export function sandboxKind() {
  return kind;
}

function selfTest(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 5000 }, (err) => resolve(!err));
  });
}

/** Detects and self-tests the sandbox. Call once at startup. */
export async function initSandbox() {
  if (process.platform === 'darwin') resolveMacCompiler();
  if (MODE !== 'off') {
    if (process.platform === 'darwin') {
      const ok = await fs.access('/usr/bin/sandbox-exec').then(() => true, () => false);
      if (ok && await selfTest('/usr/bin/sandbox-exec', ['-p', macProfile({ readPaths: ['/usr/bin/true'], execPath: '/usr/bin/true' }), '/usr/bin/true'])) kind = 'sandbox-exec';
    } else if (process.platform === 'linux') {
      if (await selfTest('bwrap', [...BWRAP_SYSTEM, '/usr/bin/true'])) kind = 'bwrap';
    }
  }
  if (kind) {
    console.log(`Bot sandbox: ${kind}`);
  } else if (MODE === 'required') {
    throw new Error('BOT_SANDBOX=required but no working sandbox (sandbox-exec on macOS, bwrap on Linux) is available');
  } else {
    console.warn('WARNING: bots are compiled and run WITHOUT an OS sandbox. Only accept bots from people you trust.' +
      (process.platform === 'linux' ? ' Install bubblewrap (bwrap) to enable isolation.' : ''));
  }
  return kind;
}
