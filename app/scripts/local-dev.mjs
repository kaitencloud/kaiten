import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(app, '..');
export function configuration(args, inherited = process.env) {
  const { values } = parseArgs({ args, options: {
    mode: { type: 'string', default: 'mock' }, port: { type: 'string', default: '3102' },
    'api-url': { type: 'string', default: 'http://127.0.0.1:6060/api' },
    credentials: { type: 'string' }, enterprise: { type: 'boolean' }, check: { type: 'boolean' },
  } });
  if (!['mock', 'real'].includes(values.mode)) throw new Error('--mode must be mock or real');
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use an unprivileged port 1024..65535');
  const api = new URL(values['api-url']);
  if (api.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(api.hostname) || api.username || api.password)
    throw new Error('API URL must refer to a local HTTP gateway');
  if (values.mode === 'real' && !values.credentials) throw new Error('Real mode requires --credentials for the selected local stack');
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR'].filter(key => inherited[key]).map(key => [key, inherited[key]]));
  Object.assign(env, {
    NODE_ENV: 'development', COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_AUTO_PIN: '0',
    VITE_API_URL: values.mode === 'mock' ? '/api' : api.href.replace(/\/$/, ''),
    VITE_LOCAL_AUTH: String(values.mode === 'real'), VITE_E2E_BYPASS_AUTH: String(values.mode === 'mock'),
    VITE_MOCK_API: String(values.mode === 'mock'), VITE_E2E_MSW: 'false', VITE_MOCK_NOTIFICATIONS: String(values.mode === 'mock'),
    VITE_ENABLE_DEMO_SANDBOX: String(Boolean(values.enterprise)), VITE_CLERK_PUBLISHABLE_KEY: '',
    VITE_KAITEN_PLATFORM_API_URL: '', VITE_KAITEN_PLATFORM_FLAGS_TOKEN: '',
  });
  if (values.credentials) env.KAITEN_DEV_DIR = resolve(values.credentials);
  return { values, port, env };
}

async function main() {
  const { values, port, env } = configuration(process.argv.slice(2));
  const manager = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).packageManager;
  const required = ['node_modules/.bin/vp', 'app/src/api-client'];
  const missing = required.filter(path => !existsSync(resolve(root, path)));
  if (Number(process.versions.node.split('.')[0]) < 24) missing.push('Node 24');

  if (missing.length) throw new Error(`Local setup missing: ${missing.join(', ')}. Explicitly install ${manager} workspace dependencies and run app generate; this command never installs`);
  if (values.check) { console.log(`Local ${values.mode} prerequisites available; browser URL http://127.0.0.1:${port}`); return; }
  // Use a temporary Vite wrapper to disable automatic developer dotenv loading,
  // while reusing the real config/plugins and existing generated clients.
  const localRoot = resolve(root, 'dev/agent');
  mkdirSync(localRoot, { recursive: true, mode: 0o700 });
  const empty = mkdtempSync(resolve(localRoot, 'frontend-'));
  if (values.mode === 'real' && !existsSync(resolve(env.KAITEN_DEV_DIR, 'tokens.json'))) {
    rmSync(empty, { recursive: true });
    throw new Error('Selected stack dev tokens are absent; run task up for local accounts first (no credential contents read)');
  }
  if (values.mode === 'mock') {
    mkdirSync(resolve(empty, 'credentials'), { mode: 0o700 });
    env.KAITEN_DEV_DIR = resolve(empty, 'credentials');
  }
  const { writeFileSync } = await import('node:fs');
  const config = resolve(empty, 'vite.config.mjs');
  writeFileSync(config, `import config from ${JSON.stringify(resolve(app, 'vite.config.ts'))};\nexport default { ...config, envDir: false };\n`);
  console.log(`Local ${values.mode}${values.enterprise ? ' Enterprise' : ' OSS'} console: http://127.0.0.1:${port}`);
  const child = spawn(resolve(root, 'node_modules/.bin/vp'), ['dev', '--config', config, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: app, env, stdio: 'inherit', detached: true });
  let escalation;
  let stopped = false;
  const stop = () => {
    if (!child.pid) return;
    stopped = true;
    try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    escalation ??= setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 2000);
  };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  child.on('error', () => { console.error('Cannot launch installed Vite+'); process.exitCode = 1; });
  await new Promise(done => child.once('close', (code, signal) => { process.exitCode = signal ? 1 : code ?? 1; done(); }));
  if (stopped && escalation) {
    // The child may exit before a stubborn descendant. Kill only our owned group
    // before cancelling escalation; never leave that descendant behind.
    try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  clearTimeout(escalation);
  process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  rmSync(empty, { recursive: true });
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 2; });
}
