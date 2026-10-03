import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const sha = process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const summary = existsSync('coverage/coverage-summary.json') ? JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8')) : null;
const metric = (entry) => `${entry.covered}/${entry.total} (${entry.pct}%)`;
const sensitive = Object.entries(summary ?? {}).filter(([file, data]) => data.lines.total > 0 && /schemas\/|\.shared\.ts|payload|invalidation|auth-token|local-auth|feature-flags\.ts|pagination\.ts|graphql-client|notification.*\.(ts|tsx)$/.test(file));
let report = `# Console test report\n\nSHA: \`${sha}\`\nGenerated: ${new Date().toISOString()}\n\n`;
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '';
report += `Working tree: ${dirty ? 'modified (measurements include uncommitted changes)' : 'clean'}.\n\n`;
report += summary ? `Unit lines: ${metric(summary.total.lines)}; branches: ${metric(summary.total.branches)}.\n\n` : 'Unit coverage not collected in this job.\n\n';
report += 'Scope excludes generated clients, router tree, routes, UI primitives, stories and e2e handlers/dev world. This is unit coverage, not a unit/E2E line union.\n\n';
report += '| Sensitive file | Lines | Branches |\n| --- | --- | --- |\n';
for (const [file, data] of sensitive) report += `| ${file.replace(/^.*\/app\//, '')} | ${metric(data.lines)} | ${metric(data.branches)} |\n`;
for (const path of process.argv.slice(2)) {
  const result = JSON.parse(readFileSync(path, 'utf8'));
  let first = 0, retried = 0, failed = 0, skipped = 0;
  function walk(suites) {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
        if (test.status === 'skipped') skipped++;
        else if (test.results?.length > 1) retried++;
        else if (test.results?.[0]?.status === test.expectedStatus) first++;
        if (test.status === 'unexpected') failed++;
      }
      walk(suite.suites);
    }
  }
  if (result.suites) walk(result.suites);
  else {
    // Vitest JSON represents the result of one invocation; shard reruns are
    // recorded separately by the workflow, not counted as first-attempt passes.
    let collectionFailures = 0;
    for (const file of result.testResults ?? []) {
      const assertions = file.assertionResults ?? [];
      const failedAssertions = assertions.filter((test) => test.status === 'failed');
      if (file.status === 'failed' && failedAssertions.length === 0) collectionFailures++;
      for (const test of assertions) {
        if (test.status === 'pending' || test.status === 'skipped') skipped++;
        else if (test.status === 'passed') first++;
        else if (test.status === 'failed') failed++;
      }
      if (failedAssertions.length || file.status === 'failed') {
        report += `\nFailure in \`${file.name}\`: ${failedAssertions.length ? 'assertion' : 'collection/import/setup'}.\n`;
        for (const test of failedAssertions) report += `- ${test.fullName ?? test.title}\n`;
      }
    }
    report += `\n${path}: ${collectionFailures} collection/import/setup failures, ${failed} failed assertions.\n`;
    if (result.numTotalTests === 0) report += 'No tests collected; this invocation is not a successful test pass.\n';
  }
  report += `\n${path}: ${first} passed without retry in this invocation, ${retried} retried, ${failed} unexpected, ${skipped} skipped.\n`;
}
mkdirSync('coverage', { recursive: true });
writeFileSync('coverage/test-report.md', report);
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, report, { flag: 'a' });
console.log(report);
