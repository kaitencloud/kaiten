import { execSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// A bounded gate over the existing Compose graph, not another runtime manager.
export function options(args) {
  const { values } = parseArgs({ args, options: {
    services: { type: 'string', default: 'api envoy db rabbitmq api-dapr-sidecar debezium local-jwks jaeger' },
    'one-shots': { type: 'string', default: 'migrate bootstrap api-ready' },
    urls: { type: 'string', default: 'http://localhost:6060/api/healthz' },
    timeout: { type: 'string', default: '180000' }, status: { type: 'boolean' }, 'no-http': { type: 'boolean' },
  } });
  const timeout = Number(values.timeout);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 600000) throw new Error('--timeout must be 1000..600000 milliseconds');
  const words = value => value.trim().split(/\s+/).filter(Boolean);
  const urls = (values['no-http'] ? [] : words(values.urls)).map(value => {
    const url = new URL(value);
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password)
      throw new Error('Readiness URLs must be HTTP loopback URLs');
    return url.href;
  });
  const services = words(values.services);
  if (!services.length || (!urls.length && !values['no-http'])) throw new Error('At least one service and readiness URL (or explicit --no-http) are required');
  return { services, oneShots: words(values['one-shots']), urls, timeout, status: values.status };
}

export function parseServices(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed.startsWith('[') ? JSON.parse(trimmed) : trimmed.split('\n').map(line => JSON.parse(line));
}

export function inspect(rows, config) {
  const pending = [];
  for (const service of config.services) {
    const row = rows.find(row => row.Service === service);
    if (!row) { pending.push(service); continue; }
    if (['exited', 'dead', 'removing'].includes(row.State) || row.Health === 'unhealthy')
      throw new Error(`${service} failed (${row.State}, health ${row.Health || 'none'}); run task logs -- ${service}`);
    if (row.State !== 'running' || (row.Health && row.Health !== 'healthy')) pending.push(service);
  }
  for (const service of config.oneShots) {
    const row = rows.find(row => row.Service === service);
    if (row?.State === 'exited' && Number(row.ExitCode) !== 0)
      throw new Error(`${service} exited ${row.ExitCode}; run task logs -- ${service}`);
    if (!row || row.State !== 'exited' || Number(row.ExitCode) !== 0) pending.push(service);
  }
  return pending;
}

export async function waitReady(config, dependencies = {}) {
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? (ms => new Promise(done => setTimeout(done, ms)));
  const snapshot = dependencies.snapshot ?? (budget => {
    if (!process.env.LOCAL_COMPOSE) throw new Error('LOCAL_COMPOSE must contain the selected Compose command');
    try {
      return parseServices(execSync(`${process.env.LOCAL_COMPOSE} --profile '*' ps -a --format json`,
        { encoding: 'utf8', timeout: Math.max(1, Math.min(5000, budget)), maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
    } catch {
      throw new Error('Cannot inspect selected Compose services within 5s. Check Docker/Compose and the selected configuration; no runtime changes made');
    }
  });
  const probe = dependencies.probe ?? (async (url, budget) => {
    try { return (await fetch(url, { signal: AbortSignal.timeout(Math.max(1, Math.min(2000, budget))), redirect: 'error' })).ok; }
    catch { return false; }
  });
  const deadline = now() + config.timeout;
  let pending;
  do {
    const rows = await snapshot(deadline - now());
    pending = inspect(rows, config);
    for (const url of config.urls) {
      const remaining = deadline - now();
      if (remaining <= 0 || !await probe(url, remaining)) pending.push(url);
    }
    if (config.status) {
      for (const row of rows) console.log(`${row.Service}: ${row.State}${row.Health ? ` (${row.Health})` : ''}${row.State === 'exited' ? ` exit ${row.ExitCode}` : ''}`);
    }
    if (!pending.length) return true;
    if (config.status) throw new Error(`Not ready: ${pending.join(', ')}`);
    if (now() >= deadline) break;
    await sleep(Math.min(500, deadline - now()));
  } while (now() < deadline);
  throw new Error(`Startup timed out; not ready: ${pending.join(', ')}. Run task status and task logs -- <service>`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  waitReady(options(process.argv.slice(2))).then(() => console.log('Selected local stack is ready')).catch(error => {
    console.error(error.message); process.exitCode = 1;
  });
}
