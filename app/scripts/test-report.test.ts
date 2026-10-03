import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

describe('test report', () => {
  it('distinguishes a runner collection failure from an assertion failure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kaiten-test-report-'));
    try {
      const collection = join(dir, 'collection.json');
      const assertion = join(dir, 'assertion.json');
      writeFileSync(collection, JSON.stringify({
        numTotalTests: 0,
        testResults: [{
          name: 'broken-import.stories.tsx',
          status: 'failed',
          assertionResults: [],
        }],
      }));
      writeFileSync(assertion, JSON.stringify({
        numTotalTests: 1,
        testResults: [{
          name: 'dialog.stories.tsx',
          status: 'failed',
          assertionResults: [{
            fullName: 'Dialog has an accessible name',
            status: 'failed',
          }],
        }],
      }));
      const output = execFileSync(
        process.execPath,
        ['scripts/test-report.mjs', collection, assertion],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          env: { ...process.env, GITHUB_STEP_SUMMARY: join(dir, 'summary.md') },
        },
      );
      expect(output).toContain(
        '1 collection/import/setup failures, 0 failed assertions',
      );
      expect(output).toContain(
        'No tests collected; this invocation is not a successful test pass',
      );
      expect(output).toContain(
        '0 collection/import/setup failures, 1 failed assertions',
      );
      expect(output).toContain('Dialog has an accessible name');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
