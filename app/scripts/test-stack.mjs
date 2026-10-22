import { randomBytes, createHmac } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  lstatSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { runOwned, cleanupOwned, allocatePort } from './stack-process.mjs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(app, '..');
const startedAt = new Date().toISOString();
const controller = new AbortController();
let exit = 1;
let interrupted = 0;
let env;
let composeArgs;
let evidence;
const ports = {};
let imageIdentities = [];
let teardown = 'skipped';
const statuses = [];
for (const [name, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.on(name, () => { interrupted = code; controller.abort(); });
}
const dir = mkdtempSync(resolve(tmpdir(), 'kaiten-stack-'));
const credentials = resolve(dir, 'credentials');
const project = `kaiten-test-${randomBytes(4).toString('hex')}`;
try {
  chmodSync(dir, 0o700);
  mkdirSync(credentials, { mode: 0o700 });
  const base = resolve(root, '.audit');
  mkdirSync(base, { recursive: true, mode: 0o700 });
  if (lstatSync(base).isSymbolicLink() || (lstatSync(base).mode & 0o077)) throw new Error('unsafe_evidence');
  evidence = mkdtempSync(resolve(base, 'stack-'));
  chmodSync(evidence, 0o700);
  const portKeys = [
    'KAITEN_PORT',
    'KAITEN_PLATFORM_PORT',
    'KAITEN_APP_PORT',
    'KAITEN_DATABASE_PORT',
    'ENVOY_ADMIN_PORT',
    'JAEGER_UI_PORT',
    'JAEGER_OTLP_GRPC_PORT',
    'JAEGER_OTLP_HTTP_PORT',
    'RABBITMQ_AMQP_PORT',
    'RABBITMQ_MANAGEMENT_PORT',
  ];
  const usedPorts = new Set();
  for (const key of portKeys) ports[key] = String(await allocatePort(usedPorts));
  env = {
    // Only tool location and non-secret CI/browser settings are inherited.
    ...Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'CI', 'PLAYWRIGHT_BROWSERS_PATH'].filter((key) => process.env[key]).map((key) => [key, process.env[key]])),
    COREPACK_ENABLE_NETWORK: '0',
    COREPACK_ENABLE_AUTO_PIN: '0',
    ...parseEnv(readFileSync(resolve(root, '.env.example'), 'utf8')),
    ...ports,
    // Explicit overrides prevent Vite's local dotenv files selecting real providers.
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
    OTEL_EXPORTER_OTLP_AUTHORIZATION: '',
    VITE_CLERK_PUBLISHABLE_KEY: '',
    VITE_KAITEN_PLATFORM_API_URL: '',
    VITE_KAITEN_PLATFORM_FLAGS_TOKEN: '',
    KAITEN_CONTAINER_PREFIX: project,
    KAITEN_DATABASE_PASSWORD: randomBytes(24).toString('hex'),
    KAITEN_DEV_DIR: credentials,
    KAITEN_DEV_UID: String(process.getuid()),
    KAITEN_DEV_GID: String(process.getgid()),
    KAITEN_DEV_JWT_SECRET: randomBytes(32).toString('hex'),
    KAITEN_APP_URL: `http://127.0.0.1:${ports.KAITEN_APP_PORT}`,
    STACK_APP_PORT: ports.KAITEN_APP_PORT,
    STACK_API_URL: `http://127.0.0.1:${ports.KAITEN_PORT}`,
    STACK_TOKENS_FILE: resolve(credentials, 'tokens.json'),
    STACK_REPORT_DIR: resolve(evidence, 'playwright-report'),
    STACK_RESULTS_DIR: resolve(evidence, 'test-results'),
    STACK_JSON_REPORT: resolve(evidence, 'playwright.json'),
  };
  // Override every published port without changing ordinary developer-stack defaults.
  const bindings = {
    envoy: [['KAITEN_PORT', 80], ['ENVOY_ADMIN_PORT', 8080]],
    jaeger: [['JAEGER_UI_PORT', 16686], ['JAEGER_OTLP_GRPC_PORT', 4317], ['JAEGER_OTLP_HTTP_PORT', 4318]],
    db: [['KAITEN_DATABASE_PORT', 5432]],
    api: [['KAITEN_PLATFORM_PORT', Number(ports.KAITEN_PLATFORM_PORT)]],
    rabbitmq: [['RABBITMQ_AMQP_PORT', 5672], ['RABBITMQ_MANAGEMENT_PORT', 15672]],
  };
  const override = resolve(dir, 'loopback.yml');
  writeFileSync(override, 'services:\n' + Object.entries(bindings).map(([service, entries]) =>
    `  ${service}:\n    ports: !override\n` + entries.map(([key, target]) => `      - "127.0.0.1:${ports[key]}:${target}"\n`).join('')).join(''), { mode: 0o600 });
  composeArgs = [
    'compose',
    '--project-name',
    project,
    '--env-file',
    resolve(root, '.env.example'),
    '-f',
    resolve(root, 'compose.yml'),
    '-f', override,
  ];
  async function run(command, args, options = {}) {
    const tick = Date.now();
    const started = new Date().toISOString();
    const operation = args[args.lastIndexOf('-f') + 2];
    const id = command + ':' + (command === 'docker' ? operation === '--profile' ? 'startup' : operation : 'playwright');
    try {
      const output = await runOwned(command, args, { cwd: root, env, signal: controller.signal, ...options });
      statuses.push({ id, status: 'passed', reason: 'command_passed', exit_code: 0, started_at: started, ended_at: new Date().toISOString(), duration_ms: Date.now() - tick });
      return output;
    } catch (error) {
      statuses.push({ id, status: 'failed', reason: error.reason ?? 'command_failed', exit_code: error.exitCode ?? null, started_at: started, ended_at: new Date().toISOString(), duration_ms: Date.now() - tick });
      throw error;
    }
  }
  await run('docker', [
    ...composeArgs,
    '--profile',
    'accounts',
    'up',
    '-d',
    '--build',
  ], { timeout: 360_000 });
  const deadline = Date.now() + 120_000;
  while (true) {
    if (controller.signal.aborted) throw new Error('interrupted');
    if (Date.now() >= deadline) throw new Error('readiness_timeout');
    if (await fetch(`${env.STACK_API_URL}/api/healthz`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(2000)]),
      redirect: 'error',
    }).then((r) => r.ok).catch(() => false)) break;
    await new Promise((done) => setTimeout(done, 500));
  }
  await run('docker', [
    ...composeArgs,
    'run',
    '--rm',
    '--no-deps',
    'tokens',
    'tokens',
    '--out',
    '/credentials/tokens.json',
  ]);
  const tokenFile = env.STACK_TOKENS_FILE;
  const tokens = JSON.parse(readFileSync(tokenFile, 'utf8'));
  const claims = JSON.parse(
    Buffer.from(tokens[0].token.split('.')[1], 'base64url'),
  );
  const orgExternalId = 'org_stack_second';
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      ...claims,
      kaiten_external_org_id: orgExternalId,
      kaiten_org_name: 'Stack Second Organization',
    }),
  ).toString('base64url');
  const input = `${header}.${payload}`;
  const token = `${input}.${createHmac('sha256', env.KAITEN_DEV_JWT_SECRET).update(input).digest('base64url')}`;
  // JIT provisions the second test tenant through the authenticated API itself.
  const provision = await fetch(`${env.STACK_API_URL}/api/customers`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
    redirect: 'error',
  });
  if (!provision.ok)
    throw new Error(`Second tenant provisioning failed: ${provision.status}`);
  // Read the ID JIT actually assigned; the test must not duplicate the API's
  // UUID derivation or treat an identity hash as a cryptographic operation.
  const orgId = (await run(
    'docker',
    [
      ...composeArgs,
      'exec', '-T', 'db',
      'psql', '-U', env.KAITEN_DATABASE_USER, '-d', env.KAITEN_DATABASE,
      '-At', '-v', 'ON_ERROR_STOP=1', '-v', `org_external_id=${orgExternalId}`,
    ],
    {
      input: "SELECT id FROM organization WHERE external_id = :'org_external_id';\n",
      timeout: 10_000,
    },
  )).trim();
  if (!orgId) throw new Error('Second tenant was not provisioned');
  tokens.push({
    ...tokens[0],
    org_external_id: orgExternalId,
    org_name: 'Stack Second Organization',
    org_id: orgId,
    token,
  });
  writeFileSync(tokenFile, JSON.stringify(tokens), { mode: 0o600 });
  chmodSync(tokenFile, 0o600);
  const scopedPayload = Buffer.from(JSON.stringify({ ...claims, scopes: ['read:customers'] })).toString('base64url');
  const scopedInput = `${header}.${scopedPayload}`;
  env.STACK_READ_ONLY_TOKEN = `${scopedInput}.${createHmac('sha256', env.KAITEN_DEV_JWT_SECRET).update(scopedInput).digest('base64url')}`;
  await run(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      '-c',
      'playwright.stack.config.ts',
      ...process.argv.slice(2),
    ],
    { cwd: app, timeout: 480_000 },
  );
  exit = 0;
} catch {
  // No raw logs/errors: API, gateway and Playwright output may contain tokens.
  statuses.push({ id: 'stack:run', status: 'failed' });
  console.error('Authenticated stack run failed; private status evidence retained');
} finally {
  // Preserve safe image content identities before deleting only our own stack.
  if (env) {
    try {
      const ids = (await runOwned('docker', ['container', 'ls', '--all', '--filter',
        `label=com.docker.compose.project=${project}`, '--format', '{{.ID}}'],
        { cwd: root, env, timeout: 5000 })).trim().split(/\s+/);
      if (!ids.length || ids.length > 40 || !ids.every((id) => /^[a-f0-9]{12,64}$/.test(id))) throw new Error('invalid_ids');
      const output = await runOwned('docker', ['container', 'inspect', '--format',
        '{{index .Config.Labels "com.docker.compose.service"}}|{{.Image}}', ...ids],
        { cwd: root, env, timeout: 5000 });
      const allowed = ['api', 'envoy', 'local-jwks', 'db', 'migrate', 'bootstrap', 'api-ready',
        'seed-accounts', 'tokens', 'seed-data', 'rabbitmq', 'debezium', 'api-dapr-sidecar', 'jaeger'];
      imageIdentities = output.trim().split('\n').map((row) => {
        const [service, image_id, extra] = row.split('|');
        if (!allowed.includes(service) || extra || !/^sha256:[a-f0-9]{64}$/.test(image_id)) throw new Error('invalid_metadata');
        return { service, image_id };
      });
    } catch {
      imageIdentities = [];
      statuses.push({ id: 'stack:image-identity', status: 'blocked', reason: 'Allowlisted image identity unavailable' });
    }
  }
  const cleanupStarted = new Date().toISOString();
  const cleanupTick = Date.now();
  teardown = composeArgs
    ? await cleanupOwned(runOwned, composeArgs, { cwd: root, env }, dir,
      (owned) => rmSync(owned, { recursive: true, force: true }))
    : (() => { rmSync(dir, { recursive: true, force: true }); return 'passed'; })();
  if (teardown !== 'passed') exit = 1;
  statuses.push({ id: 'stack:teardown', status: teardown, reason: teardown === 'passed' ? 'cleanup_passed' : 'cleanup_failed', exit_code: null, started_at: cleanupStarted, ended_at: new Date().toISOString(), duration_ms: Date.now() - cleanupTick });
  try {
    if (!evidence) throw new Error('evidence_unavailable');
    const { createHash } = await import('node:crypto');
    const key = statuses.filter((item) => item.status === 'failed').map((item) => item.id).sort();
    let revision = null;
    let dirty = null;
    try {
      const head = (await runOwned('git', ['rev-parse', 'HEAD'], { cwd: root, timeout: 5000 })).trim();
      if (/^[a-f0-9]{40,64}$/.test(head)) revision = head;
      dirty = Boolean(await runOwned('git', ['status', '--porcelain'], { cwd: root, timeout: 5000 }));
    } catch { /* Unknown identity is not invented. */ }
    writeFileSync(resolve(evidence, 'manifest.json'), JSON.stringify({
      schema_version: 1, profile: 'authenticated-stack', private: true,
      repository: { revision, dirty }, started_at: startedAt, ended_at: new Date().toISOString(),
      status: exit !== 0 || interrupted ? 'failed' : statuses.some((item) => item.status === 'blocked') ? 'blocked' : 'passed',
      commands: statuses.map((item) => ({
        reason: item.status === 'passed' ? 'command_passed' : 'command_failed',
        exit_code: null, started_at: startedAt, ended_at: new Date().toISOString(), duration_ms: null, ...item,
      })),
      image_identities: imageIdentities, project, ports: typeof ports === 'undefined' ? {} : ports,
      finding_key: 'kaiten-stack-v1-' + createHash('sha256').update(JSON.stringify(key)).digest('hex').slice(0, 24),
      artifacts: ['playwright-report', 'test-results', 'playwright.json'],
      tool_versions: { node: process.versions.node },
      limitation: 'Content image IDs recorded when available; cached base image provenance/pins still require runtime pilot validation',
    }, null, 2), { mode: 0o600 });
  } catch {
    console.error('Cannot safely retain private status evidence');
    if (exit === 0) exit = 1;
  }
}
process.exitCode = interrupted || exit || (statuses.some((item) => item.status === 'blocked') ? 2 : 0);
