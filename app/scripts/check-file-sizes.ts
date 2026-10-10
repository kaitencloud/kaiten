/**
 * Enforces the 350-lines-per-source-file limit from `AI_CONTEXT.md`.
 * Exceptions mirror the documented ones: tests, stories, shadcn wrappers,
 * locales, generated code and test infrastructure.
 *
 * Run with: `pnpm check:file-sizes` (tsx scripts/check-file-sizes.ts)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_LINES_PER_FILE = 350;

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

const EXCEPTION_PATTERNS: RegExp[] = [
  /\.test\.(ts|tsx)$/,
  /\.stories\.(ts|tsx)$/,
  /(^|\/)stories\//,
  /(^|\/)__tests__\//,
  /^components\/ui\//,
  /^lib\/i18n\/locales\//,
  /^api-client\//,
  // Written by a generator, which a file-size limit would otherwise ask a person
  // to split by hand: routeTree.gen.ts, lib/api/*.gen.ts.
  /\.gen\.ts$/,
  /^e2e\//, // src/e2e — MSW test infrastructure
];

export function isExempt(relativePath: string): boolean {
  const normalized = relativePath.split(sep).join('/');
  return EXCEPTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      collectSourceFiles(fullPath, out);
    } else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      out.push(fullPath);
    }
  }
  return out;
}

export type OversizedFile = { path: string; lineCount: number };

export function findOversizedFiles(srcDir: string): OversizedFile[] {
  const oversized: OversizedFile[] = [];
  for (const filePath of collectSourceFiles(srcDir)) {
    const relativePath = relative(srcDir, filePath);
    if (isExempt(relativePath)) {
      continue;
    }
    const lineCount = readFileSync(filePath, 'utf8').split('\n').length;
    if (lineCount > MAX_LINES_PER_FILE) {
      oversized.push({ path: relativePath, lineCount });
    }
  }
  return oversized.sort((a, b) => b.lineCount - a.lineCount);
}

function runCli() {
  const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const srcDir = resolve(appDir, 'src');
  const oversized = findOversizedFiles(srcDir);

  if (oversized.length === 0) {
    console.log(
      `[file-sizes] All source files are within ${MAX_LINES_PER_FILE} lines.`,
    );
    return;
  }

  console.error(
    `[file-sizes] ${oversized.length} file(s) exceed ${MAX_LINES_PER_FILE} lines:`,
  );
  for (const file of oversized) {
    console.error(`  - src/${file.path} (${file.lineCount} lines)`);
  }
  process.exit(1);
}

runCli();
