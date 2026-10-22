import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { localUrl, options, privateOutput, requestSummary, capture } from './local-browser.mjs';
import { configuration } from './local-dev.mjs';

test('only local app URLs and bounded capture timeouts are accepted', () => {
  assert.equal(localUrl('http://127.0.0.1:3102/customers').port, '3102');
  for (const url of ['https://kaiten.sh', 'file:///tmp/test', 'http://user:token@localhost/'])
    assert.throws(() => localUrl(url));
  assert.throws(() => options(['--url', 'http://localhost:3102', '--timeout', 'NaN']));
  assert.throws(() => options([]));
});

test('request summaries omit tokens, queries, headers and body', () => {
  const request = { url: () => 'http://localhost:6060/api/customers?token=SECRET', method: () => 'GET' };
  assert.deepEqual(requestSummary(request, 500), { method: 'GET', origin: 'http://localhost:6060', path: '/api/customers', status: 500 });
});

test('frontend mode is explicit and does not inherit provider secrets', () => {
  const mock = configuration([], { PATH: '/bin', HOME: '/tmp', SVIX_API_KEY: 'secret', VITE_CLERK_PUBLISHABLE_KEY: 'real' });
  assert.equal(mock.env.VITE_MOCK_API, 'true');
  assert.equal(mock.env.SVIX_API_KEY, undefined);
  assert.equal(mock.env.VITE_CLERK_PUBLISHABLE_KEY, '');
  assert.throws(() => configuration(['--mode', 'real']));
  const real = configuration(['--mode', 'real', '--credentials', 'dev', '--enterprise']);
  assert.equal(real.env.VITE_LOCAL_AUTH, 'true');
  assert.equal(real.env.VITE_MOCK_API, 'false');
  assert.equal(real.env.VITE_ENABLE_DEMO_SANDBOX, 'true');
  assert.throws(() => configuration(['--api-url', 'https://production.example']));
});

test('capture retains private failure summary and closes only its own browser', async () => {
  const parent = mkdtempSync(resolve(tmpdir(), 'local-capture-fixture-'));
  let closed = 0;
  const page = { setDefaultTimeout() {}, setDefaultNavigationTimeout() {}, on() {},
    async goto() { throw new Error('synthetic failure'); } };
  const browser = { async close() { closed++; }, async newContext() { return { async newPage() { return page; }, async route() {} }; } };
  try {
    await assert.rejects(() => capture({ url: 'http://localhost:3102', output: parent, timeout: 1000 }, { async launchServer() { return { wsEndpoint: () => 'ws://fixture', async close() {}, process: () => ({ kill() {} }) }; }, async connect() { return browser; } }));
    assert.equal(closed, 1);
    const { readdirSync } = await import('node:fs');
    const summary = resolve(parent, readdirSync(parent)[0], 'capture.json');
    assert.equal(JSON.parse(readFileSync(summary)).completed, false);
    assert.equal(existsSync(summary), true);
    const one = privateOutput(parent); const two = privateOutput(parent);
    assert.notEqual(one, two);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test('frontend CLI uses owned mock credentials and no dotenv loading', async () => {
  const { mkdirSync, copyFileSync, writeFileSync, chmodSync, readdirSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const root = mkdtempSync(resolve(tmpdir(), 'local-dev-cli-'));
  try {
    for (const path of ['app/scripts', 'app/node_modules/playwright', 'app/src/api-client', 'node_modules/.bin'])
      mkdirSync(resolve(root, path), { recursive: true });
    copyFileSync(new URL('./local-dev.mjs', import.meta.url), resolve(root, 'app/scripts/local-dev.mjs'));
    writeFileSync(resolve(root, 'package.json'), '{"packageManager":"pnpm@12.4.1"}');
    const binary = resolve(root, 'node_modules/.bin/vp');
    writeFileSync(binary, '#!' + process.execPath + '\n' + `
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const args = process.argv.slice(2);
      const config = args[args.indexOf('--config') + 1];
      assert(fs.readFileSync(config, 'utf8').includes('envDir: false'));
      assert(process.env.KAITEN_DEV_DIR.includes('frontend-'));
      assert(!fs.existsSync(process.env.KAITEN_DEV_DIR + '/tokens.json'));
      assert.equal(process.env.SVIX_API_KEY, undefined);
      assert.equal(process.env.VITE_MOCK_API, 'true');
    `);
    chmodSync(binary, 0o700);
    const result = spawnSync(process.execPath, [resolve(root, 'app/scripts/local-dev.mjs')],
      { env: { ...process.env, SVIX_API_KEY: 'must-not-inherit' }, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readdirSync(resolve(root, 'dev/agent')), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('frontend SIGTERM closes its owned process group and removes temporary config', async () => {
  const { mkdirSync, copyFileSync, writeFileSync, chmodSync, readdirSync } = await import('node:fs');
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const root = mkdtempSync(resolve(tmpdir(), 'local-dev-signal-'));
  let child, descendant;
  try {
    for (const path of ['app/scripts', 'app/src/api-client', 'node_modules/.bin']) mkdirSync(resolve(root, path), { recursive: true });
    copyFileSync(new URL('./local-dev.mjs', import.meta.url), resolve(root, 'app/scripts/local-dev.mjs'));
    writeFileSync(resolve(root, 'package.json'), '{"packageManager":"pnpm@12.4.1"}');
    const binary = resolve(root, 'node_modules/.bin/vp');
    writeFileSync(binary, '#!' + process.execPath + '\n' + `
      const { spawn } = require('node:child_process');
      const kid = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"]);
      kid.on('spawn',()=>console.log('FIXTURE_PID=' + kid.pid));
      process.on('SIGTERM',()=>process.exit(0));
      setInterval(()=>{},1000);
    `);
    chmodSync(binary, 0o700);
    child = spawn(process.execPath, [resolve(root, 'app/scripts/local-dev.mjs')], { stdio: ['ignore', 'pipe', 'pipe'] });
    const exit = once(child, 'exit');
    descendant = await new Promise((done, reject) => {
      const timer = setTimeout(()=>reject(new Error('fixture launch timeout')), 5000);
      let output = '';
      child.stdout.on('data', data => {
        output += data;
        const match = output.match(/FIXTURE_PID=(\d+)/);
        if (match) { clearTimeout(timer); done(Number(match[1])); }
      });
    });
    child.kill('SIGTERM');
    const timer = setTimeout(()=>child.kill('SIGKILL'), 5000);
    await exit;
    clearTimeout(timer);
    assert.deepEqual(readdirSync(resolve(root, 'dev/agent')), []);
    assert.throws(() => process.kill(descendant, 0), /ESRCH/);
  } finally {
    child?.kill('SIGKILL');
    if (descendant) { try { process.kill(descendant, 'SIGKILL'); } catch {} }
    rmSync(root, { recursive: true, force: true });
  }
});
