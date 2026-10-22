import { mkdirSync, lstatSync, existsSync, writeFileSync, chmodSync, realpathSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { get } from 'node:http';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function localUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password)
    throw new Error('Use an HTTP loopback application URL, never production or provider sites');
  return url;
}

export function requestSummary(request, status) {
  const url = new URL(request.url());
  return { method: request.method(), origin: url.origin, path: url.pathname, status };
}

export function options(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    url: { type: 'string' }, output: { type: 'string', default: 'dev/reproductions' },
    wait: { type: 'string' }, headed: { type: 'boolean', default: false },
    interactive: { type: 'boolean', default: false }, 'devtools-port': { type: 'string' },
    timeout: { type: 'string', default: '30000' }, help: { type: 'boolean' },
  } });
  if (values.help) return values;
  if (positionals.length > 1 || (values.url && positionals.length)) throw new Error('Pass exactly one local URL');
  values.url ??= positionals[0];
  if (!values.url) throw new Error('A local URL is required');
  values.url = localUrl(values.url).href;
  values.timeout = Number(values.timeout);
  if (!Number.isInteger(values.timeout) || values.timeout < 1000 || values.timeout > 120000)
    throw new Error('--timeout must be 1000..120000 milliseconds');
  if (values['devtools-port'] !== undefined) {
    if (!values.interactive) throw new Error('--devtools-port requires --interactive');
    if (!/^[0-9]+$/.test(values['devtools-port'])) throw new Error('--devtools-port must be an explicit port in 1024..65535');
    values.devtoolsPort = Number(values['devtools-port']);
    if (!Number.isInteger(values.devtoolsPort) || values.devtoolsPort < 1024 || values.devtoolsPort > 65535)
      throw new Error('--devtools-port must be an explicit port in 1024..65535');
  }
  return values;
}

// Probe by binding, never attach to or interrogate an existing listener.
export async function preflightDevtoolsPort(port, timeout, serverFactory = createServer) {
  for (const host of ['127.0.0.1', '::1']) {
    await new Promise((done, reject) => {
      const probe = serverFactory();
      const timer = setTimeout(() => { probe.close(); reject(new Error('DevTools port preflight timeout')); }, timeout);
      probe.once('error', error => {
        clearTimeout(timer);
        if (host === '::1' && ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) return done();
        reject(new Error('DevTools port is unavailable; choose another explicit port (no existing listener was attached)'));
      });
      probe.listen({ host, port, exclusive: true }, () => probe.close(() => { clearTimeout(timer); done(); }));
    });
  }
}

// Only read bounded discovery metadata after launching our own Chrome. A target ID
// obtained over Playwright's owned connection prevents advertising an unrelated listener.
export function devtoolsTargets(port, timeout, httpGet = get, path = '/json/list') {
  return new Promise((done, reject) => {
    const request = httpGet({ hostname: '127.0.0.1', port, path, agent: false }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
        if (body.length > 65536) request.destroy(new Error('DevTools discovery response too large'));
      });
      response.on('error', reject);
      response.on('aborted', () => reject(new Error('DevTools discovery response aborted')));
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error('DevTools discovery failed'));
        try { done(JSON.parse(body)); } catch { reject(new Error('Invalid DevTools discovery response')); }
      });
    });
    const timer = setTimeout(() => request.destroy(new Error('DevTools discovery timeout')), timeout);
    request.on('close', () => clearTimeout(timer));
    request.on('error', reject);
  });
}

export function loopbackDevtoolsWebsocket(value, port, path) {
  try {
    const endpoint = new URL(value);
    return endpoint.protocol === 'ws:' && endpoint.hostname === '127.0.0.1' &&
      endpoint.port === String(port) && !endpoint.username && !endpoint.password &&
      !endpoint.search && !endpoint.hash && (typeof path === 'string' ? endpoint.pathname === path : path.test(endpoint.pathname));
  } catch { return false; }
}

export async function verifyDevtoolsSession(context, page, port, timeout, discover = devtoolsTargets,
  discoverVersion = (port, timeout) => devtoolsTargets(port, timeout, get, '/json/version')) {
  let timer;
  const verify = async () => {
    const session = await context.newCDPSession(page);
    try {
      const { targetInfo } = await session.send('Target.getTargetInfo');
      const targets = await discover(port, timeout);
      if (!Array.isArray(targets) || !targets.some(target => {
        if (target.type !== 'page' || target.id !== targetInfo.targetId || target.url !== targetInfo.url) return false;
        return loopbackDevtoolsWebsocket(target.webSocketDebuggerUrl, port,
          `/devtools/page/${targetInfo.targetId}`);
      }))
        throw new Error('DevTools endpoint is not the owned Playwright session; do not attach');
      const version = await discoverVersion(port, timeout);
      if (!loopbackDevtoolsWebsocket(version?.webSocketDebuggerUrl, port, /^\/devtools\/browser\/[a-zA-Z0-9-]+$/))
        throw new Error('DevTools browser websocket is not the selected loopback endpoint; do not attach');
    } finally { await session.detach(); }
  };
  try {
    await Promise.race([verify(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('DevTools ownership verification timeout')), timeout);
    })]);
  } finally { clearTimeout(timer); }
}

export function privateOutput(path) {
  const input = resolve(path);
  if (existsSync(input) && lstatSync(input).isSymbolicLink()) throw new Error('Output directory must not be a symlink');
  // Resolve existing ancestors once (macOS /var and /tmp are system aliases).
  // Writes then use the canonical path, never a hidden symlink destination.
  let ancestor = input;
  const suffix = [];
  while (!existsSync(ancestor)) { suffix.unshift(ancestor.slice(dirname(ancestor).length + 1)); ancestor = dirname(ancestor); }
  const directory = resolve(realpathSync(ancestor), ...suffix);
  // A new subdirectory for each capture, never overwrite a previous screenshot.
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const run = resolve(directory, `capture-${randomUUID()}`);
  mkdirSync(run, { mode: 0o700 });
  return run;
}

export async function capture(values, chromium) {
  const url = localUrl(values.url);
  const output = privateOutput(values.output);
  const failures = [];
  let browser;
  let server;
  let context;
  let profile;
  let interrupted = false;
  const interrupt = () => { interrupted = true; server?.process()?.kill('SIGTERM'); void (profile ? context?.close() : browser?.close())?.catch(() => {}); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  let page;
  let completed = false;
  try {
    const contextOptions = { viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' };
    if (values.devtoolsPort !== undefined) {
      await preflightDevtoolsPort(values.devtoolsPort, values.timeout);
      if (interrupted) throw new Error('Browser launch interrupted');
      profile = mkdtempSync(resolve(tmpdir(), 'kaiten-devtools-'));
      chmodSync(profile, 0o700);
      try {
        context = await chromium.launchPersistentContext(profile, { ...contextOptions, channel: 'chrome', headless: false,
          chromiumSandbox: true, timeout: values.timeout, args: [`--remote-debugging-port=${values.devtoolsPort}`, '--remote-debugging-address=127.0.0.1'] });
      } catch (error) {
        throw new Error(`Owned Chrome launch failed. Installed Google Chrome is required; no automatic install or fallback performed. ${error.message}`);
      }
      browser = context.browser();
    } else {
      server = await chromium.launchServer({ headless: !(values.headed || values.interactive), timeout: values.timeout });
      browser = await chromium.connect(server.wsEndpoint(), { timeout: values.timeout });
      context = await browser.newContext(contextOptions);
    }
    page = await context.newPage();
    page.setDefaultTimeout(values.timeout);
    page.setDefaultNavigationTimeout(values.timeout);
    // Guard accidental external requests; do not attach to a personal profile.
    await context.route('**/*', route => {
      const target = new URL(route.request().url());
      if (target.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) return route.continue();
      return route.abort();
    });
    page.on('pageerror', () => { if (failures.length < 100) failures.push({ kind: 'pageerror', reason: 'Uncaught page error; inspect locally in the browser' }); });
    page.on('console', message => {
      if (message.type() === 'error' && failures.length < 100) failures.push({ kind: 'console', reason: 'Console error; raw text is deliberately not saved' });
    });
    page.on('response', response => {
      if (response.status() >= 400 && failures.length < 100)
        failures.push({ kind: 'http', ...requestSummary(response.request(), response.status()) });
    });
    page.on('requestfailed', request => {
      if (failures.length < 100) failures.push({ kind: 'request', ...requestSummary(request, null) });
    });
    if (values.devtoolsPort !== undefined) {
      // A unique local blank target proves that discovery sees this exact context.
      await page.goto(`about:blank#kaiten-${randomUUID()}`);
      await verifyDevtoolsSession(context, page, values.devtoolsPort, values.timeout);
      for (const initialPage of context.pages()) if (initialPage !== page) await initialPage.close();
    }
    const response = await page.goto(url.href);
    if (!response?.ok()) throw new Error('Local application navigation failed');
    if (values.wait) await page.locator(values.wait).first().waitFor({ state: 'visible' });
    else await page.locator('body').waitFor({ state: 'visible' });
    if (values.interactive) {
      if (values.devtoolsPort !== undefined)
        console.log(`Private DevTools control endpoint: http://127.0.0.1:${values.devtoolsPort} (CDP, not a Playwright websocket). Attach only the separately authorized DevTools MCP; never publish this endpoint.`);
      console.log(`Explore the selected local app at ${url.origin}${url.pathname}; close its window or press Ctrl-C to finish. No personal browser profile is used.`);
      await new Promise(done => {
        if (interrupted || page.isClosed()) return done();
        page.once('close', done);
        browser.once('disconnected', done);
        context.once('close', done);
      });
    } else {
      await page.screenshot({ path: resolve(output, 'page.png'), fullPage: true, timeout: values.timeout });
      chmodSync(resolve(output, 'page.png'), 0o600);
    }
    completed = true;
  } finally {
    try {
      await Promise.race([(async () => {
        if (profile) await context?.close();
        else { await browser?.close(); await server?.close(); }
        if (profile) { rmSync(profile, { recursive: true, force: true }); profile = undefined; }
      })(),
        new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Browser close timeout')), 5000); timer.unref(); })]);
    } catch {
      interrupted = true;
      if (profile) console.error(`Chrome cleanup did not complete; close the owned Chrome window and remove only its temporary profile at ${profile}. Do not attach MCP.`);
    }
    finally { server?.process()?.kill('SIGKILL'); }
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    const summary = { url: url.origin + url.pathname, screenshot: completed && !values.interactive ? 'page.png' : null,
      completed, interrupted, failures: failures.slice(0, 100),
      note: 'Private local reproduction capture; not a regression assertion or backend verification' };
    writeFileSync(resolve(output, 'capture.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
    console.log(`Local capture: ${output}`);
  }
  return completed && !interrupted && failures.length === 0 ? 0 : 1;
}

async function main() {
  const values = options(process.argv.slice(2));
  if (values.help) {
    console.log('node app/scripts/local-browser.mjs http://localhost:3000/customers [--interactive [--devtools-port 9222]] [--wait SELECTOR] [--output dev/reproductions]');
    return 0;
  }
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { throw new Error('Playwright is not installed. Explicitly run the repository setup task first; no automatic install performed'); }
  return capture(values, chromium);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
