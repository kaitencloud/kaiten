import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Compose config needs only the client, never a daemon, credentials or .env.
test('synthetic Compose render preserves ordering, escaping and loopback-only ports', () => {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME,
    KAITEN_PORT: '6060', KAITEN_APP_URL: 'http://localhost:3000',
    KAITEN_DEV_JWT_SECRET: 'synthetic-fixture', KAITEN_DATABASE_USER: 'fixture',
    KAITEN_DATABASE_PASSWORD: 'fixture', KAITEN_DATABASE: 'fixture' };
  const config = JSON.parse(execFileSync('docker', ['compose', '--env-file', '/dev/null', '--profile', '*', 'config', '--format', 'json'],
    { env, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }));
  const { services } = config;
  // Compose's canonical JSON preserves $$ for subsequent interpolation.
  assert.match(services['api-ready'].command.at(-1), /\[ "\$\$i" -ge 30 \]/);
  assert.match(services['api-ready'].command.at(-1), /wget -T 1/);
  assert.equal(services['api-ready'].depends_on.api.condition, 'service_started');
  assert.equal(services.api.depends_on.bootstrap.condition, 'service_completed_successfully');
  assert.equal(services.api.depends_on.tokens.required, false);
  const sidecar = services['api-dapr-sidecar'];
  assert.equal(sidecar.network_mode, undefined);
  assert.equal(sidecar.ports, undefined);
  assert.equal(sidecar.command[sidecar.command.indexOf('--app-channel-address') + 1], 'api');
  for (const service of Object.values(services)) for (const port of service.ports ?? []) assert.equal(port.host_ip, '127.0.0.1');
  assert.equal(services.api.image, 'kaiten-local-api');
  assert.equal(services.bootstrap.image, 'kaiten-local-admin-shell');
});

test('destructive reset explicitly migrates and rotates before normal startup', () => {
  const task = readFileSync(new URL('../Taskfile.yml', import.meta.url), 'utf8');
  const section = task.slice(task.indexOf('  reset:'), task.indexOf('  restart:'));
  assert(section.indexOf('one-shots migrate --no-http') < section.indexOf('bootstrap rotate'));
  assert(section.indexOf('bootstrap rotate') < section.indexOf('task: quickstart'));
  assert(section.includes('--no-deps --no-build --pull never'));
});
