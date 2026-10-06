import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

// Rules the billing code follows that no type can express, checked by reading
// it: the code of the domain and of the features that show billing.
const SRC = resolve(__dirname, '../../..');

function sourceFiles(directory: string): string[] {
  try {
    return readdirSync(directory).flatMap((entry) => {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        return entry === '__tests__' || entry === 'stories'
          ? []
          : sourceFiles(path);
      }
      return /\.(ts|tsx)$/.test(entry) && !/\.(test|stories)\./.test(entry)
        ? [path]
        : [];
    });
  } catch {
    // A feature that does not exist yet has nothing to scan.
    return [];
  }
}

const BILLING_CODE = [
  'domains/billing',
  'features/billing',
  'features/licenses',
  'features/instances',
  'features/customers',
  'features/settings',
].flatMap((directory) => sourceFiles(join(SRC, directory)));

const offendersOf = (pattern: RegExp) =>
  BILLING_CODE.filter((file) => pattern.test(readFileSync(file, 'utf8'))).map(
    (file) => relative(SRC, file),
  );

describe('the billing code', () => {
  it('is found, so that the rules below read something', () => {
    const domainFiles = BILLING_CODE.filter((file) =>
      relative(SRC, file).startsWith('domains/billing/'),
    );

    expect(domainFiles.length).toBeGreaterThan(10);
  });

  // The scopes live in the generated tables. A literal such as 'write:billing'
  // written in billing code is a second source, which drifts when the contract
  // does.
  it('writes no scope: they are the generated tables', () => {
    expect(
      offendersOf(/['"`](?:read|write|delete):[a-z_*]+['"`]/),
      'a scope written here is a second source: take it from OPERATION_SCOPES (lib/api/operation-scopes.gen.ts)',
    ).toEqual([]);
  });

  // Totals are fields of the API: the console adds nothing up. Reducing the lines
  // of an invoice, or the invoices of a list, to a sum is how a total that
  // disagrees with the API gets shown.
  it('adds no amounts up by reducing', () => {
    expect(
      offendersOf(/\.reduce\(/),
      'a total is a field of the API: show it, do not add amounts up',
    ).toEqual([]);
  });
});
