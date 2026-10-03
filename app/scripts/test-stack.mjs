import { randomBytes, createHmac, createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(app, '..');
const dir = mkdtempSync(resolve(tmpdir(), 'kaiten-stack-'));
const credentials = resolve(dir, 'credentials');
mkdirSync(credentials);
const project = `kaiten-test-${randomBytes(4).toString('hex')}`;
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
const ports = {};
for (const key of portKeys) {
  const server = createServer();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  ports[key] = String(server.address().port);
  await new Promise((done) => server.close(done));
}
const env = {
  ...process.env,
  ...parseEnv(readFileSync(resolve(root, '.env.example'), 'utf8')),
  ...ports,
  KAITEN_CONTAINER_PREFIX: project,
  KAITEN_DEV_DIR: credentials,
  KAITEN_DEV_UID: String(process.getuid()),
  KAITEN_DEV_GID: String(process.getgid()),
  KAITEN_DEV_JWT_SECRET: randomBytes(32).toString('hex'),
  KAITEN_APP_URL: `http://127.0.0.1:${ports.KAITEN_APP_PORT}`,
  STACK_APP_PORT: ports.KAITEN_APP_PORT,
  STACK_API_URL: `http://127.0.0.1:${ports.KAITEN_PORT}`,
  STACK_TOKENS_FILE: resolve(credentials, 'tokens.json'),
};
const composeArgs = [
  'compose',
  '--project-name',
  project,
  '--env-file',
  resolve(root, '.env.example'),
  '-f',
  resolve(root, 'compose.yml'),
];
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} exited ${result.status}: ${result.error ?? ''}`,
    );
}
let exit = 1;
try {
  run('docker', [
    ...composeArgs,
    '--profile',
    'accounts',
    'up',
    '-d',
    '--build',
  ]);
  for (let attempt = 0; ; attempt++) {
    if (
      await fetch(`${env.STACK_API_URL}/api/healthz`)
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    if (attempt >= 120)
      throw new Error('Stack did not become ready in 120 seconds');
    await new Promise((done) => setTimeout(done, 1000));
  }
  run('docker', [
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
  function uuidV5(namespace, name) {
    const hash = createHash('sha1')
      .update(Buffer.from(namespace.replaceAll('-', ''), 'hex'))
      .update(name)
      .digest()
      .subarray(0, 16);
    hash[6] = (hash[6] & 15) | 80;
    hash[8] = (hash[8] & 63) | 128;
    const hex = hash.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
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
  tokens.push({
    ...tokens[0],
    org_external_id: orgExternalId,
    org_name: 'Stack Second Organization',
    org_id: uuidV5(
      uuidV5('eb025416-6f74-4684-97e9-83e99784aaa5', 'organization'),
      orgExternalId,
    ),
    token,
  });
  // JIT provisions the second test tenant through the authenticated API itself.
  const provision = await fetch(`${env.STACK_API_URL}/api/customers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!provision.ok)
    throw new Error(`Second tenant provisioning failed: ${provision.status}`);
  writeFileSync(tokenFile, JSON.stringify(tokens), { mode: 0o600 });
  const scopedPayload = Buffer.from(JSON.stringify({ ...claims, scopes: ['read:customers'] })).toString('base64url');
  const scopedInput = `${header}.${scopedPayload}`;
  env.STACK_READ_ONLY_TOKEN = `${scopedInput}.${createHmac('sha256', env.KAITEN_DEV_JWT_SECRET).update(scopedInput).digest('base64url')}`;
  run(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      '-c',
      'playwright.stack.config.ts',
      ...process.argv.slice(2),
    ],
    { cwd: app },
  );
  exit = 0;
} catch (error) {
  console.error(error.message);
  // Credentials never enter logs; the server and gateway diagnostics do.
  spawnSync(
    'docker',
    [...composeArgs, 'logs', '--no-color', '--tail', '150', 'api', 'envoy'],
    { cwd: root, env, stdio: 'inherit' },
  );
} finally {
  spawnSync(
    'docker',
    [...composeArgs, '--profile', '*', 'down', '--volumes', '--remove-orphans'],
    { cwd: root, env, stdio: 'inherit' },
  );
  rmSync(dir, { recursive: true, force: true });
}
process.exitCode = exit;
