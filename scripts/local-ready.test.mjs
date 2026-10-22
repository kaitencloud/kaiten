import { test } from 'node:test';
import assert from 'node:assert/strict';
import { options, parseServices, inspect, waitReady } from './local-ready.mjs';

const config = { services: ['api'], oneShots: ['bootstrap'], urls: ['http://localhost:6060/api/healthz'], timeout: 1000 };
const ready = [{ Service: 'api', State: 'running' }, { Service: 'bootstrap', State: 'exited', ExitCode: 0 }];

test('Compose JSON supports both array and JSON-lines output', () => {
  assert.deepEqual(parseServices(JSON.stringify(ready)), ready);
  assert.deepEqual(parseServices(ready.map(row => JSON.stringify(row)).join('\n')), ready);
  assert.deepEqual(parseServices(''), []);
});

test('failed one-shots/unhealthy/exited applications never become ready', () => {
  assert.deepEqual(inspect(ready, config), []);
  for (const rows of [
    [{ ...ready[0], State: 'exited', ExitCode: 1 }, ready[1]],
    [{ ...ready[0], Health: 'unhealthy' }, ready[1]],
    [ready[0], { ...ready[1], ExitCode: 2 }],
  ]) assert.throws(() => inspect(rows, config));
  assert.deepEqual(inspect([], config), ['api', 'bootstrap']);
});

test('fake clock bounds startup and actual HTTP result gates readiness', async () => {
  let clock = 0, calls = 0;
  await assert.rejects(waitReady(config, {
    now: () => clock, sleep: async ms => { clock += ms; }, snapshot: async () => ready,
    probe: async () => { calls++; return false; },
  }), /Startup timed out.*healthz/);
  assert.equal(clock, 1000);
  assert.equal(calls, 2);
  clock = 0;
  assert.equal(await waitReady(config, {
    now: () => clock, sleep: async ms => { clock += ms; }, snapshot: async () => ready,
    probe: async () => clock >= 500,
  }), true);
});

test('status never waits and rejects unsafe URLs/timeout configuration', async () => {
  await assert.rejects(waitReady({ ...config, status: true }, {
    snapshot: async () => [], probe: async () => false,
    sleep: async () => { throw new Error('status must not wait'); },
  }), /Not ready/);
  for (const args of [['--urls', 'https://production.example'], ['--timeout', 'Infinity'], ['--urls', 'http://token@localhost/']])
    assert.throws(() => options(args));
});

test('migration-only gate explicitly disables HTTP but cannot omit all services', async () => {
  const config = options(['--services','db','--one-shots','migrate','--no-http']);
  assert.deepEqual(config.urls, []);
  assert.throws(() => options(['--services','','--no-http']));
  assert.equal(await waitReady(config, { snapshot: () => [{Service:'db',State:'running'}, {Service:'migrate',State:'exited',ExitCode:0}] }), true);
});
