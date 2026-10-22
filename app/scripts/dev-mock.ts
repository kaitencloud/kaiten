/**
 * Starts the dev server for `pnpm run dev:mock`, on port 3000 unless a port is
 * asked for.
 *
 * The script used to spell `vp dev --port 3000`, so `pnpm run dev:mock -- --port
 * 3200` ran `vp dev --port 3000 -- --port 3200`: pnpm hands the `--` on, Vite
 * stops reading flags there, and the port stayed 3000 (or, taken, fell to 3001,
 * where the worktrees of the team serve). Here the port is a default, the `--`
 * separator is dropped, and every other flag goes to `vp dev` as typed.
 *
 * Run with: `pnpm run dev:mock [-- --port 3200 --strictPort]`
 */
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const DEFAULT_DEV_MOCK_PORT = 3000;

function asksForPort(args: readonly string[]): boolean {
  return args.some((arg) => arg === '--port' || arg.startsWith('--port='));
}

/**
 * The arguments of `vp dev` for what was typed after the script name: the
 * `--` separators go, the port is the one asked for, or 3000.
 */
export function devMockArgs(typed: readonly string[]): string[] {
  const args = typed.filter((arg) => arg !== '--');
  if (asksForPort(args)) {
    return ['dev', ...args];
  }

  return ['dev', '--port', String(DEFAULT_DEV_MOCK_PORT), ...args];
}

function run() {
  const child = spawn('vp', devMockArgs(process.argv.slice(2)), {
    stdio: 'inherit',
  });
  const forward = (signal: NodeJS.Signals) => child.kill(signal);
  process.on('SIGINT', forward);
  process.on('SIGTERM', forward);
  child.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
  child.on('error', (error) => {
    console.error(`[dev:mock] could not start vp: ${error.message}`);
    process.exit(1);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
