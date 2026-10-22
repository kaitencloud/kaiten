import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

// One owned process group per command, including pnpm/Playwright/Vite descendants.
export function terminateGroup(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

export function runOwned(command, args, options = {}) {
  const { timeout = 60_000, signal, input, ...spawnOptions } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...spawnOptions,
      detached: true,
    });
    let output = '';
    let bytes = 0;
    let failure;
    let escalation;
    let finished = false;
    function stop(reason) {
      if (finished || failure) return;
      failure = reason;
      if (child.pid) terminateGroup(child, 'SIGTERM');
      escalation = setTimeout(() => {
        if (child.pid) terminateGroup(child, 'SIGKILL');
      }, 1000);
    }
    const timer = setTimeout(() => stop('timeout'), timeout);
    const abort = () => stop('interrupted');
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 131072) stop('output_limit');
      else output += chunk.toString();
    });
    // stderr may contain credentials. Never forward/capture arbitrary diagnostics.
    child.stderr.on('data', () => {});
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    child.on('error', () => { failure = 'unavailable'; });
    child.on('close', (code) => {
      finished = true;
      clearTimeout(timer);
      clearTimeout(escalation);
      signal?.removeEventListener('abort', abort);
      // A child may leave descendants behind even on success.
      if (child.pid) terminateGroup(child, 'SIGKILL');
      if (failure || code !== 0) {
        const error = new Error(`${command}: ${failure ?? 'command_failed'}`);
        error.exitCode = code;
        error.reason = failure ?? 'command_failed';
        reject(error);
      }
      else resolve(output);
    });
  });
}

export async function cleanupOwned(run, composeArgs, options, directory, remove) {
  let status = 'passed';
  try {
    await run('docker', [...composeArgs, '--profile', '*', 'down', '--volumes', '--remove-orphans'],
      { ...options, timeout: 45_000 });
  } catch {
    status = 'failed';
  }
  try {
    remove(directory);
  } catch {
    status = 'failed';
  }
  return status;
}

// Reject low/browser-restricted ports and duplicates within this run. Binding is
// released before Docker starts, so a later host collision remains a startup failure.
export async function allocatePort(used, candidate = async () => {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}) {
  const restricted = new Set([3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666,
    6667, 6668, 6669, 6697, 10080]);
  for (let attempt = 0; attempt < 20; attempt++) {
    const port = await candidate();
    if (Number.isInteger(port) && port >= 1024 && port <= 65535 && !restricted.has(port) && !used.has(port)) {
      used.add(port);
      return port;
    }
  }
  throw new Error('port_allocation_exhausted');
}
