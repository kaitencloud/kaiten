import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { localUrl, options, privateOutput, requestSummary, capture, preflightDevtoolsPort, verifyDevtoolsSession as verifySession, devtoolsTargets, loopbackDevtoolsWebsocket } from './local-browser.mjs';
import { configuration } from './local-dev.mjs';
const ownedVersion = async () => ({ webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/owned-browser' });
const verifyDevtoolsSession = (context, page, port, timeout, discover) =>
  verifySession(context, page, port, timeout, discover, ownedVersion);

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

test('frontend platform flag wiring reads only the selected real stack token', async () => {
  const { writeFileSync } = await import('node:fs');
  const credentials = mkdtempSync(resolve(tmpdir(), 'local-flags-fixture-'));
  const flagsFile = resolve(credentials, 'platform-flags-token');
  const args = ['--mode', 'real', '--credentials', credentials, '--api-url', 'http://127.0.0.1:6060/api'];
  const inherited = { VITE_KAITEN_PLATFORM_API_URL: 'https://unselected.example/api', VITE_KAITEN_PLATFORM_FLAGS_TOKEN: 'do-not-inherit' };
  try {
    const absent = configuration(args, inherited);
    assert.equal(absent.env.VITE_KAITEN_PLATFORM_API_URL, '');
    assert.equal(absent.env.VITE_KAITEN_PLATFORM_FLAGS_TOKEN, '');
    writeFileSync(flagsFile, 'synthetic-read-only-token\n', { mode: 0o600 });
    const real = configuration(args, inherited);
    assert.equal(real.env.VITE_KAITEN_PLATFORM_API_URL, 'http://127.0.0.1:6060/api');
    assert.equal(real.env.VITE_KAITEN_PLATFORM_FLAGS_TOKEN, 'synthetic-read-only-token');
    const mock = configuration(['--mode', 'mock', '--credentials', credentials], inherited);
    assert.equal(mock.env.VITE_KAITEN_PLATFORM_API_URL, '');
    assert.equal(mock.env.VITE_KAITEN_PLATFORM_FLAGS_TOKEN, '');
    writeFileSync(flagsFile, '');
    assert.throws(() => configuration(args, inherited), /empty or malformed/);
    writeFileSync(flagsFile, 'synthetic invalid token');
    assert.throws(() => configuration(args, inherited), /empty or malformed/);
    const check = configuration([...args, '--check'], inherited);
    assert.equal(check.env.VITE_KAITEN_PLATFORM_FLAGS_TOKEN, '');
  } finally { rmSync(credentials, { recursive: true, force: true }); }
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


test('DevTools port is explicit, nonprivileged and interactive only; defaults stay unchanged', () => {
  const url = 'http://localhost:3000';
  assert.equal(options([url]).devtoolsPort, undefined);
  assert.equal(options([url, '--interactive', '--devtools-port', '9222']).devtoolsPort, 9222);
  for (const port of ['0', '1023', '65536', '-1', 'NaN', '9222.5', '9e3', '0x2406', '', ' 9222'])
    assert.throws(() => options([url, '--interactive', '--devtools-port', port]));
  assert.throws(() => options([url, '--devtools-port', '9222']), /requires --interactive/);
  assert.throws(() => options([url, '--headed', '--devtools-port', '9222']), /requires --interactive/);
  assert.throws(() => options([url, '--interactive', '--devtools-port']));
  assert.throws(() => options([url, '--unknown']));
});

test('DevTools preflight checks both loopback families without connecting to listeners', async () => {
  const { EventEmitter } = await import('node:events');
  const hosts = [];
  const factory = (errorHost) => () => {
    const probe = new EventEmitter();
    probe.listen = ({ host, port, exclusive }, done) => {
      hosts.push(host);
      assert.equal(port, 9222);
      assert.equal(exclusive, true);
      if (host === errorHost) probe.emit('error', { code: 'EADDRINUSE' });
      else done();
    };
    probe.close = done => done?.();
    return probe;
  };
  await preflightDevtoolsPort(9222, 1000, factory());
  assert.deepEqual(hosts, ['127.0.0.1', '::1']);
  await assert.rejects(() => preflightDevtoolsPort(9222, 1000, factory('127.0.0.1')), /unavailable/);
  await assert.rejects(() => preflightDevtoolsPort(9222, 1000, factory('::1')), /unavailable/);
});

test('DevTools discovery must match the unique target from the owned Playwright connection', async () => {
  let detached = 0;
  const context = { async newCDPSession() { return {
    async send(method) { assert.equal(method, 'Target.getTargetInfo'); return { targetInfo: { targetId: 'owned', url: 'about:blank#unique' } }; },
    async detach() { detached++; },
  }; } };
  const discover = async (port, timeout) => {
    assert.equal(port, 9222); assert.equal(timeout, 1000);
    return [{ type: 'page', id: 'owned', url: 'about:blank#unique', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/owned' }];
  };
  await verifyDevtoolsSession(context, {}, 9222, 1000, discover);
  for (const targets of [[], {}, [{ type: 'page', id: 'foreign', url: 'about:blank#unique' }],
    [{ type: 'page', id: 'owned', url: 'about:blank#foreign' }]])
    await assert.rejects(() => verifyDevtoolsSession(context, {}, 9222, 1000, async () => targets), /not the owned/);
  await assert.rejects(() => verifyDevtoolsSession(context, {}, 9222, 1000, async () => { throw new Error('timeout'); }), /timeout/);
  assert.equal(detached, 6);
  for (const endpoint of ['ws://0.0.0.0:9222/devtools/page/owned', 'ws://example.com:9222/devtools/page/owned',
    'ws://127.0.0.1:9333/devtools/page/owned', 'wss://127.0.0.1:9222/devtools/page/owned',
    'ws://user:secret@127.0.0.1:9222/devtools/page/owned', 'ws://127.0.0.1:9222/devtools/page/foreign',
    'ws://127.0.0.1:9222/devtools/page/owned?token=secret', undefined])
    await assert.rejects(() => verifyDevtoolsSession(context, {}, 9222, 1000, async () => [{
      type: 'page', id: 'owned', url: 'about:blank#unique', webSocketDebuggerUrl: endpoint,
    }]), /not the owned/);
});

test('interactive DevTools uses installed Chrome and removes its isolated profile on failure', async () => {
  const parent = mkdtempSync(resolve(tmpdir(), 'local-devtools-fixture-'));
  let profile, closed = 0, launches = 0;
  // No browser or listener starts: inject the preflight by running a fixture copy.
  const { copyFileSync, writeFileSync } = await import('node:fs');
  const script = resolve(parent, 'fixture.mjs');
  copyFileSync(new URL('./local-browser.mjs', import.meta.url), script);
  writeFileSync(script, readFileSync(script, 'utf8').replace(
    'await preflightDevtoolsPort(values.devtoolsPort, values.timeout);', '/* fixture: no listener */').replace(
      'await verifyDevtoolsSession(context, page, values.devtoolsPort, values.timeout);',
      'await verifyDevtoolsSession(context, page, values.devtoolsPort, values.timeout, async () => [{type: "page", id: "owned", url: page.url(), webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/owned"}], async () => ({webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/browser/owned-browser"}));'));
  const fixture = await import(new URL('file://' + script));
  const chromium = { async launchPersistentContext(path, opts) {
    profile = path; launches++;
    assert.equal(existsSync(profile), true);
    assert.equal(opts.channel, 'chrome'); assert.equal(opts.headless, false); assert.equal(opts.chromiumSandbox, true);
    assert.equal(opts.timeout, 1000); assert.equal(opts.serviceWorkers, 'block');
    assert.deepEqual(opts.args, ['--remote-debugging-port=9222', '--remote-debugging-address=127.0.0.1']);
    return { browser: () => ({}), async close() { closed++; }, async newPage() { throw new Error('synthetic page failure'); } };
  }, async launchServer() { assert.fail('must not launch Playwright server'); }, async connect() { assert.fail('must not attach a foreign browser'); } };
  try {
    await assert.rejects(() => fixture.capture({ url: 'http://localhost:3000', interactive: true,
      devtoolsPort: 9222, output: parent, timeout: 1000 }, chromium), /synthetic page failure/);
    assert.equal(launches, 1); assert.equal(closed, 1); assert.equal(existsSync(profile), false);
    await assert.rejects(() => fixture.capture({ url: 'http://localhost:3000', interactive: true,
      devtoolsPort: 9222, output: parent, timeout: 1000 }, { async launchPersistentContext(path) {
        profile = path; throw new Error('Chrome not installed');
      } }), /Chrome not installed/);
    assert.equal(existsSync(profile), false);
    const { EventEmitter } = await import('node:events');
    const page = new EventEmitter();
    let currentUrl, routes = 0, initialClosed = 0;
    page.setDefaultTimeout = page.setDefaultNavigationTimeout = () => {};
    page.url = () => currentUrl;
    page.goto = async url => {
      currentUrl = url;
      if (url.startsWith('http:')) setImmediate(() => { page.closed = true; page.emit('close'); });
      return { ok: () => true };
    };
    page.isClosed = () => !!page.closed;
    page.locator = () => ({ waitFor: async () => {} });
    const browser = new EventEmitter();
    const context = new EventEmitter();
    context.browser = () => browser;
    context.close = async () => { closed++; context.emit('close'); };
    context.newPage = async () => page;
    context.pages = () => [page, { close: async () => { initialClosed++; } }];
    context.newCDPSession = async () => ({ send: async () => ({ targetInfo: { targetId: 'owned', url: currentUrl } }), detach: async () => {} });
    context.route = async (_pattern, handler) => {
      for (const [url, allowed] of [['http://localhost:3000/api', true], ['https://provider.example', false]])
        await handler({ request: () => ({ url: () => url }), continue: () => { assert.equal(allowed, true); routes++; },
          abort: () => { assert.equal(allowed, false); routes++; } });
    };
    const result = await fixture.capture({ url: 'http://localhost:3000', interactive: true,
      devtoolsPort: 9222, output: parent, timeout: 1000 }, { async launchPersistentContext(path) { profile = path; return context; } });
    assert.equal(result, 0); assert.equal(closed, 2); assert.equal(routes, 2); assert.equal(initialClosed, 1);
    assert.equal(existsSync(profile), false);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});


test('DevTools ownership verification is bounded even if the Playwright connection stalls', async () => {
  await assert.rejects(() => verifyDevtoolsSession({ newCDPSession: () => new Promise(() => {}) }, {}, 9222, 20), /verification timeout/);
});

test('DevTools discovery is loopback-only, bounded and rejects invalid metadata', async () => {
  const { EventEmitter } = await import('node:events');
  const factory = (body, status = 200, stall = false) => (opts, respond) => {
    assert.deepEqual(opts, { hostname: '127.0.0.1', port: 9222, path: '/json/list', agent: false });
    const request = new EventEmitter();
    request.destroy = error => { request.emit('error', error); request.emit('close'); };
    queueMicrotask(() => {
      const response = new EventEmitter();
      response.statusCode = status; response.setEncoding = () => {};
      respond(response);
      if (stall === 'abort') { response.emit('aborted'); request.emit('close'); }
      else if (!stall) { response.emit('data', body); response.emit('end'); request.emit('close'); }
    });
    return request;
  };
  assert.deepEqual(await devtoolsTargets(9222, 1000, factory('[{"id":"owned"}]')), [{ id: 'owned' }]);
  await assert.rejects(() => devtoolsTargets(9222, 1000, factory('{}', 302)), /discovery failed/);
  await assert.rejects(() => devtoolsTargets(9222, 1000, factory('not json')), /Invalid/);
  await assert.rejects(() => devtoolsTargets(9222, 1000, factory('x'.repeat(65537))), /too large/);
  await assert.rejects(() => devtoolsTargets(9222, 20, factory('', 200, true)), /discovery timeout/);
  await assert.rejects(() => devtoolsTargets(9222, 1000, factory('', 200, 'abort')), /response aborted/);
});


test('MCP browser websocket discovery must stay on selected loopback port', async () => {
  assert.equal(loopbackDevtoolsWebsocket('ws://127.0.0.1:9222/devtools/browser/owned', 9222, /^\/devtools\/browser\/[a-zA-Z0-9-]+$/), true);
  const context = { newCDPSession: async () => ({ send: async () => ({ targetInfo: { targetId: 'owned', url: 'about:blank#unique' } }), detach: async () => {} }) };
  const targets = async () => [{ type: 'page', id: 'owned', url: 'about:blank#unique', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/owned' }];
  for (const endpoint of ['ws://0.0.0.0:9222/devtools/browser/owned', 'ws://external.example:9222/devtools/browser/owned',
    'ws://127.0.0.1:9333/devtools/browser/owned', 'ws://user:secret@127.0.0.1:9222/devtools/browser/owned',
    'ws://127.0.0.1:9222/devtools/page/owned', undefined])
    await assert.rejects(() => verifySession(context, {}, 9222, 1000, targets,
      async () => ({ webSocketDebuggerUrl: endpoint })), /browser websocket/);
});
