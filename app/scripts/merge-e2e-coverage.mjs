#!/usr/bin/env node
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(fileURLToPath(import.meta.url), '../..');
const args = new Set(process.argv.slice(2));
const e2eRawDir = path.resolve(
  appRoot,
  process.env.E2E_COVERAGE_DIR ?? '.coverage/e2e/raw',
);
const outputDir = path.resolve(
  appRoot,
  process.env.COVERAGE_COMBINED_DIR ?? '.coverage/combined',
);

if (args.has('--clean-e2e')) {
  await rm(e2eRawDir, { recursive: true, force: true });
  await rm(outputDir, { recursive: true, force: true });

  if (args.size === 1) {
    process.exit(0);
  }
}

const [unitCoverage, e2eCoverage] = await Promise.all([
  readUnitCoverage(),
  readE2ECoverage(e2eRawDir),
]);

const files = mergeCoverageFiles(unitCoverage.files, e2eCoverage.files);
const summary = {
  generatedAt: new Date().toISOString(),
  inputs: {
    unitCoveragePath: unitCoverage.path
      ? path.relative(appRoot, unitCoverage.path)
      : null,
    e2eRawDir: path.relative(appRoot, e2eRawDir),
  },
  totals: {
    unit: unitCoverage.total,
    e2e: summarizeE2EFiles(e2eCoverage.files),
    combined: summarizeCombinedFiles(files),
  },
  files,
};

await mkdir(outputDir, { recursive: true });
await writeFile(
  path.join(outputDir, 'coverage-summary.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
);
await writeFile(
  path.join(outputDir, 'coverage-summary.md'),
  renderMarkdownSummary(summary),
);

console.log(
  `Combined coverage summary written to ${path.relative(
    appRoot,
    path.join(outputDir, 'coverage-summary.md'),
  )}`,
);

async function readUnitCoverage() {
  const coveragePaths = process.env.UNIT_COVERAGE_PATH
    ? [path.resolve(appRoot, process.env.UNIT_COVERAGE_PATH)]
    : [
        path.resolve(appRoot, 'coverage/coverage-summary.json'),
        path.resolve(appRoot, 'coverage/coverage-final.json'),
      ];

  for (const coveragePath of coveragePaths) {
    const coverage = await readJsonIfExists(coveragePath);

    if (!coverage) {
      continue;
    }

    if (coverage.total) {
      return readUnitCoverageSummary(coveragePath, coverage);
    }

    return readUnitCoverageFinal(coveragePath, coverage);
  }

  return {
    path: null,
    total: emptyMetric(),
    files: [],
  };
}

function readUnitCoverageSummary(coveragePath, summary) {
  const files = Object.entries(summary)
    .filter(([filePath]) => filePath !== 'total')
    .map(([filePath, metrics]) => ({
      file: normalizeUnitPath(filePath),
      unit: normalizeMetric(metrics.lines),
    }))
    .filter((entry) => entry.file.startsWith('src/'));

  return {
    path: coveragePath,
    total: normalizeMetric(summary.total?.lines),
    files,
  };
}

function readUnitCoverageFinal(coveragePath, coverage) {
  const files = Object.entries(coverage)
    .map(([filePath, fileCoverage]) => ({
      file: normalizeUnitPath(filePath),
      unit: calculateIstanbulLineCoverage(fileCoverage),
    }))
    .filter((entry) => entry.file.startsWith('src/'));

  return {
    path: coveragePath,
    total: summarizeUnitFiles(files),
    files,
  };
}

async function readE2ECoverage(rawDir) {
  const fileNames = await readDirIfExists(rawDir);
  const files = new Map();

  for (const fileName of fileNames.filter((name) => name.endsWith('.json'))) {
    const rawCoverage = await readJsonIfExists(path.join(rawDir, fileName));

    for (const entry of rawCoverage?.js ?? []) {
      const filePath = normalizeCoverageUrl(entry.url);

      if (!shouldIncludeSourcePath(filePath) || typeof entry.source !== 'string') {
        continue;
      }

      const fileCoverage = calculateEntryCoverage(entry);
      const previous = files.get(filePath);

      if (!previous) {
        files.set(filePath, fileCoverage);
        continue;
      }

      files.set(filePath, mergeE2EFileCoverage(previous, fileCoverage));
    }
  }

  return {
    files: Array.from(files.entries())
      .map(([file, e2e]) => ({
        file,
        e2e: metricWithPct({
          total: e2e.total,
          covered: e2e.coveredLines.size,
        }),
      }))
      .sort((a, b) => a.file.localeCompare(b.file)),
  };
}

function mergeCoverageFiles(unitFiles, e2eFiles) {
  const files = new Map();

  for (const entry of unitFiles) {
    files.set(entry.file, {
      file: entry.file,
      unit: entry.unit,
      e2e: null,
    });
  }

  for (const entry of e2eFiles) {
    const existing = files.get(entry.file);

    if (existing) {
      existing.e2e = entry.e2e;
      continue;
    }

    files.set(entry.file, {
      file: entry.file,
      unit: null,
      e2e: entry.e2e,
    });
  }

  return Array.from(files.values())
    .map((entry) => ({
      ...entry,
      touchedBy: [
        entry.unit ? 'unit' : null,
        entry.e2e ? 'e2e' : null,
      ].filter(Boolean),
      combined: combineMetrics(entry.unit, entry.e2e),
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

function calculateEntryCoverage(entry) {
  const source = entry.source;
  const lines = source.split(/\r?\n/);
  const executableLines = new Set();
  const coveredLines = new Set();
  const lineStarts = getLineStarts(source);
  const coverageRanges = getCoverageRanges(entry);

  lines.forEach((line, index) => {
    if (isExecutableLine(line)) {
      const lineNumber = index + 1;
      executableLines.add(lineNumber);

      if (isLineCovered(line, lineStarts[index], coverageRanges)) {
        coveredLines.add(lineNumber);
      }
    }
  });

  return {
    total: executableLines.size,
    coveredLines,
  };
}

function getCoverageRanges(entry) {
  return (entry.functions ?? [])
    .flatMap((fn) => fn.ranges ?? [])
    .filter((range) => range.endOffset > range.startOffset)
    .sort(
      (a, b) =>
        a.endOffset - a.startOffset - (b.endOffset - b.startOffset),
    );
}

function isLineCovered(line, lineStartOffset, coverageRanges) {
  const firstCodeOffset = lineStartOffset + line.search(/\S/);
  const narrowestRange = coverageRanges.find(
    (range) =>
      range.startOffset <= firstCodeOffset && firstCodeOffset < range.endOffset,
  );

  return Boolean(narrowestRange && narrowestRange.count > 0);
}

function mergeE2EFileCoverage(a, b) {
  const coveredLines = new Set(a.coveredLines);

  for (const line of b.coveredLines) {
    coveredLines.add(line);
  }

  return {
    total: Math.max(a.total, b.total),
    coveredLines,
  };
}

function combineMetrics(unit, e2e) {
  if (!unit && !e2e) {
    return emptyMetric();
  }

  if (!unit) {
    return e2e;
  }

  if (!e2e) {
    return unit;
  }

  const total = Math.max(unit.total, e2e.total);
  const covered = Math.min(total, Math.max(unit.covered, e2e.covered));

  return metricWithPct({ total, covered });
}

function summarizeE2EFiles(files) {
  return metricWithPct(
    files.reduce(
      (acc, entry) => ({
        total: acc.total + entry.e2e.total,
        covered: acc.covered + entry.e2e.covered,
      }),
      { total: 0, covered: 0 },
    ),
  );
}

function summarizeUnitFiles(files) {
  return metricWithPct(
    files.reduce(
      (acc, entry) => ({
        total: acc.total + entry.unit.total,
        covered: acc.covered + entry.unit.covered,
      }),
      { total: 0, covered: 0 },
    ),
  );
}

function summarizeCombinedFiles(files) {
  return metricWithPct(
    files.reduce(
      (acc, entry) => ({
        total: acc.total + entry.combined.total,
        covered: acc.covered + entry.combined.covered,
      }),
      { total: 0, covered: 0 },
    ),
  );
}

function renderMarkdownSummary(summary) {
  const rows = summary.files
    .filter((entry) => entry.e2e)
    .sort((a, b) => a.e2e.pct - b.e2e.pct)
    .slice(0, 30)
    .map((entry) =>
      [
        `\`${entry.file}\``,
        formatMetric(entry.unit),
        formatMetric(entry.e2e),
        formatMetric(entry.combined),
        entry.touchedBy.join(', '),
      ].join(' | '),
    );

  return `${[
    '# Combined Coverage',
    '',
    `Generated at: ${summary.generatedAt}`,
    'E2E counts traversed browser JavaScript files/ranges. The combined value is a per-file maximum, not a union of source lines reached by both suites.',
    '',
    '## Totals',
    '',
    `- Unit lines: ${formatMetric(summary.totals.unit)}`,
    `- E2E lines: ${formatMetric(summary.totals.e2e)}`,
    `- Per-file maximum (not source-line union): ${formatMetric(summary.totals.combined)}`,
    '',
    '## E2E Touched Files',
    '',
    '| File | Unit | E2E | Per-file maximum | Touched by |',
    '| --- | ---: | ---: | ---: | --- |',
    ...rows,
    '',
  ].join('\n')}\n`;
}

function normalizeUnitPath(filePath) {
  const relativePath = path.relative(appRoot, filePath);
  return normalizePath(relativePath.startsWith('..') ? filePath : relativePath);
}

function normalizeCoverageUrl(url) {
  let pathname;

  try {
    pathname = decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }

  if (pathname.startsWith('/@fs/')) {
    const absolutePath = pathname.slice('/@fs'.length);
    return normalizeUnitPath(absolutePath);
  }

  if (pathname.startsWith('/src/')) {
    return normalizePath(pathname.slice(1));
  }

  const srcIndex = pathname.lastIndexOf('/src/');
  return srcIndex >= 0 ? normalizePath(pathname.slice(srcIndex + 1)) : null;
}

function calculateIstanbulLineCoverage(fileCoverage) {
  const executableLines = new Set();
  const coveredLines = new Set();
  const statements = fileCoverage.statementMap ?? {};
  const statementHits = fileCoverage.s ?? {};

  for (const [statementId, location] of Object.entries(statements)) {
    const startLine = Number(location.start?.line);
    const endLine = Number(location.end?.line ?? startLine);

    if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) {
      continue;
    }

    for (let line = startLine; line <= endLine; line += 1) {
      executableLines.add(line);

      if (Number(statementHits[statementId] ?? 0) > 0) {
        coveredLines.add(line);
      }
    }
  }

  return metricWithPct({
    total: executableLines.size,
    covered: coveredLines.size,
  });
}

function shouldIncludeSourcePath(filePath) {
  return (
    typeof filePath === 'string' &&
    filePath.startsWith('src/') &&
    !filePath.startsWith('src/api-client/') &&
    !filePath.startsWith('src/components/ui/') &&
    !filePath.endsWith('/routeTree.gen.ts')
  );
}

function getLineStarts(source) {
  const starts = [0];

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') {
      starts.push(index + 1);
    }
  }

  return starts;
}

function isExecutableLine(line) {
  const trimmed = line.trim();

  return (
    trimmed.length > 0 &&
    !trimmed.startsWith('//') &&
    !trimmed.startsWith('/*') &&
    !trimmed.startsWith('*') &&
    !trimmed.startsWith('//# sourceMappingURL=')
  );
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function readDirIfExists(dirPath) {
  try {
    return await readdir(dirPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

function normalizeMetric(metric) {
  return metricWithPct({
    total: Number(metric?.total ?? 0),
    covered: Number(metric?.covered ?? 0),
  });
}

function metricWithPct(metric) {
  const total = Number(metric.total ?? 0);
  const covered = Number(metric.covered ?? 0);

  return {
    total,
    covered,
    pct: total === 0 ? 100 : Number(((covered / total) * 100).toFixed(2)),
  };
}

function emptyMetric() {
  return { total: 0, covered: 0, pct: 100 };
}

function formatMetric(metric) {
  if (!metric) {
    return '-';
  }

  return `${metric.covered}/${metric.total} (${metric.pct}%)`;
}

function normalizePath(value) {
  return value.split(path.sep).join('/');
}
