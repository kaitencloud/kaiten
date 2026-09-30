import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';

type JsCoverageEntry = Awaited<
  ReturnType<Page['coverage']['stopJSCoverage']>
>[number];

type CssCoverageEntry = Awaited<
  ReturnType<Page['coverage']['stopCSSCoverage']>
>[number];

const defaultCoverageDir = '.coverage/e2e/raw';

export async function startE2ECoverage(
  page: Page,
  browserName: string,
): Promise<boolean> {
  if (process.env.E2E_COVERAGE !== 'true' || browserName !== 'chromium') {
    return false;
  }

  await Promise.all([
    page.coverage.startJSCoverage({
      resetOnNavigation: false,
      reportAnonymousScripts: false,
    }),
    page.coverage.startCSSCoverage({
      resetOnNavigation: false,
    }),
  ]);

  return true;
}

export async function stopE2ECoverage(
  page: Page,
  testInfo: TestInfo,
  enabled: boolean,
): Promise<void> {
  if (!enabled) {
    return;
  }

  const [jsCoverage, cssCoverage] = await Promise.all([
    page.coverage.stopJSCoverage(),
    page.coverage.stopCSSCoverage(),
  ]);

  const jsEntries = jsCoverage.filter((entry) =>
    shouldKeepCoverageUrl(entry.url),
  );
  const cssEntries = cssCoverage.filter((entry) =>
    shouldKeepCoverageUrl(entry.url),
  );

  if (jsEntries.length === 0 && cssEntries.length === 0) {
    return;
  }

  const outputDir = path.resolve(
    process.cwd(),
    process.env.E2E_COVERAGE_DIR ?? defaultCoverageDir,
  );
  await mkdir(outputDir, { recursive: true });

  const fileName = [
    sanitizeFileName(testInfo.titlePath.join(' ')).slice(0, 140),
    `worker-${testInfo.workerIndex}`,
    `retry-${testInfo.retry}`,
    `${Date.now()}.json`,
  ].join('-');
  const outputPath = path.join(outputDir, fileName);

  await writeFile(
    outputPath,
    JSON.stringify(
      {
        version: 1,
        test: {
          title: testInfo.title,
          titlePath: testInfo.titlePath,
          project: testInfo.project.name,
          file: testInfo.file,
          retry: testInfo.retry,
          workerIndex: testInfo.workerIndex,
        },
        js: jsEntries.map(serializeJsCoverageEntry),
        css: cssEntries.map(serializeCssCoverageEntry),
      },
      null,
      2,
    ),
  );

  await testInfo.attach('e2e-coverage', {
    path: outputPath,
    contentType: 'application/json',
  });
}

function serializeJsCoverageEntry(entry: JsCoverageEntry) {
  return {
    url: entry.url,
    source: entry.source,
    functions: entry.functions,
  };
}

function serializeCssCoverageEntry(entry: CssCoverageEntry) {
  return {
    url: entry.url,
    text: entry.text,
    ranges: entry.ranges,
  };
}

function shouldKeepCoverageUrl(url: string): boolean {
  const sourcePath = normalizeCoverageUrl(url);
  return Boolean(
    sourcePath?.startsWith('src/') &&
    !sourcePath.startsWith('src/api-client/') &&
    !sourcePath.startsWith('src/components/ui/') &&
    !sourcePath.endsWith('/routeTree.gen.ts'),
  );
}

function normalizeCoverageUrl(url: string): string | null {
  let pathname: string;

  try {
    pathname = decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }

  if (pathname.startsWith('/@fs/')) {
    const absolutePath = pathname.slice('/@fs'.length);
    const relativePath = path.relative(process.cwd(), absolutePath);

    return relativePath.startsWith('..') ? null : normalizePath(relativePath);
  }

  if (pathname.startsWith('/src/')) {
    return normalizePath(pathname.slice(1));
  }

  const srcIndex = pathname.lastIndexOf('/src/');
  if (srcIndex >= 0) {
    return normalizePath(pathname.slice(srcIndex + 1));
  }

  return null;
}

function normalizePath(value: string): string {
  return value.split(path.sep).join('/');
}

function sanitizeFileName(value: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'e2e-coverage'
  );
}
