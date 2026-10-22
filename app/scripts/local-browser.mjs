import { mkdirSync, lstatSync, existsSync, writeFileSync, chmodSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

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
    interactive: { type: 'boolean', default: false },
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
  return values;
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
  let interrupted = false;
  const interrupt = () => { interrupted = true; server?.process()?.kill('SIGTERM'); void browser?.close().catch(() => {}); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  let page;
  let completed = false;
  try {
    server = await chromium.launchServer({ headless: !(values.headed || values.interactive), timeout: values.timeout });
    browser = await chromium.connect(server.wsEndpoint(), { timeout: values.timeout });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
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
    const response = await page.goto(url.href);
    if (!response?.ok()) throw new Error('Local application navigation failed');
    if (values.wait) await page.locator(values.wait).first().waitFor({ state: 'visible' });
    else await page.locator('body').waitFor({ state: 'visible' });
    if (values.interactive) {
      console.log(`Explore the selected local app at ${url.origin}${url.pathname}; close its window or press Ctrl-C to finish. No personal browser profile is used.`);
      await new Promise(done => {
        if (interrupted || page.isClosed()) return done();
        page.once('close', done);
        browser.once('disconnected', done);
      });
    } else {
      await page.screenshot({ path: resolve(output, 'page.png'), fullPage: true, timeout: values.timeout });
      chmodSync(resolve(output, 'page.png'), 0o600);
    }
    completed = true;
  } finally {
    try {
      await Promise.race([(async () => { await browser?.close(); await server?.close(); })(),
        new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Browser close timeout')), 5000); timer.unref(); })]);
    } catch { interrupted = true; }
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
    console.log('node app/scripts/local-browser.mjs http://localhost:3000/customers [--interactive] [--wait SELECTOR] [--output dev/reproductions]');
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
