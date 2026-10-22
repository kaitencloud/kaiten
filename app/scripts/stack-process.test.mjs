import test from 'node:test';
import assert from 'node:assert/strict';
import { runOwned, cleanupOwned, allocatePort } from './stack-process.mjs';

// No Docker invocation: synthetic child processes and injected teardown only.
test('owned process timeout, interruption, failures and bounded output', async () => {
  await assert.rejects(runOwned(process.execPath, ['-e', 'setTimeout(()=>{}, 20000)'], { timeout: 50 }), /timeout/);
  const controller = new AbortController();
  const running = runOwned(process.execPath, ['-e', 'setTimeout(()=>{}, 20000)'], { signal: controller.signal });
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(running, /interrupted/);
  await assert.rejects(runOwned(process.execPath, ['-e', 'process.exit(17)']), /command_failed/);
  await assert.rejects(runOwned(process.execPath, ['-e', 'console.log("x".repeat(200000))']), /output_limit/);
});

test('private stderr never enters captured output or error', async () => {
  const output = await runOwned(process.execPath, ['-e', 'console.error("Authorization: Bearer planted-secret"); console.log("safe")']);
  assert.equal(output.trim(), 'safe');
  await assert.rejects(runOwned(process.execPath, ['-e', 'console.error("postgres://user:secret@host/db?token=private"); process.exit(1)']), (error) => !error.message.includes('secret') && !error.message.includes('token'));
});

test('two concurrent runs clean only their owned resources, failure still removes credentials', async () => {
  const projects = ['kaiten-test-a', 'kaiten-test-b'];
  const calls = [];
  const removed = [];
  const statuses = await Promise.all(projects.map((project, index) => cleanupOwned(async (command, args, options) => {
    calls.push({ command, args, options });
    if (!index) throw new Error('fixture cleanup failure');
  }, ['compose', '--project-name', project], {}, `/owned/${project}`, (directory) => removed.push(directory))));
  assert.deepEqual(statuses, ['failed', 'passed']);
  assert.equal(calls.length, 2);
  assert.equal(removed.length, 2);
  calls.forEach(({ command, args, options }, index) => {
    assert.equal(command, 'docker');
    assert.ok(args.includes(projects[index]));
    assert.ok(args.includes('down'));
    assert.ok(!args.includes('prune'));
    assert.equal(options.timeout, 45000);
  });
});

test('timeout kills a TERM-resistant grandchild retaining pipes', async () => {
  const started = Date.now();
  const body = `const {spawn} = require('node:child_process');
    spawn(process.execPath, ['-e', 'process.on("SIGTERM", ()=>{}); setInterval(()=>{},1000)'], {stdio:'inherit'});
    setInterval(()=>{},1000);`;
  await assert.rejects(runOwned(process.execPath, ['-e', body], { timeout: 200 }), /timeout/);
  assert.ok(Date.now() - started < 4000);
});

test('bounded port retries avoid browser restrictions and same-run duplicates', async () => {
  const used = new Set([49152]);
  const candidates = [6000, 6667, 10080, 80, 49152, 49153];
  assert.equal(await allocatePort(used, async () => candidates.shift()), 49153);
  assert.ok(used.has(49153));
  let attempts = 0;
  await assert.rejects(allocatePort(used, async () => { attempts++; return 6667; }), /port_allocation_exhausted/);
  assert.equal(attempts, 20);
});
