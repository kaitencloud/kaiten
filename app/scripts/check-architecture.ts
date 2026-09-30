import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeArchitecture,
  loadArchitectureSources,
} from './architecture-analyzer';

export {
  analyzeArchitecture,
  loadArchitectureSources,
} from './architecture-analyzer';
export type { ArchitectureSource } from './architecture-analyzer';
export type {
  ArchitectureRule,
  ArchitectureViolation,
} from './architecture-rules';

function runCli() {
  const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const srcDir = resolve(appDir, 'src');
  const violations = analyzeArchitecture(
    srcDir,
    loadArchitectureSources(srcDir),
  );

  const errors = violations.filter((violation) => violation.severity === 'error');
  const warnings = violations.filter(
    (violation) => violation.severity === 'warning',
  );

  for (const violation of warnings) {
    console.warn(
      `[architecture][warn] ${violation.rule} ${violation.filePath}:${violation.line} -> ${violation.target}`,
    );
    console.warn(`  ${violation.message}`);
  }

  for (const violation of errors) {
    console.error(
      `[architecture] ${violation.rule} ${violation.filePath}:${violation.line} -> ${violation.target}`,
    );
    console.error(`  ${violation.message}`);
  }

  if (warnings.length > 0) {
    console.warn(
      `\n[architecture] ${warnings.length} warning(s), not blocking (to be cleared over time).`,
    );
  }

  if (errors.length === 0) {
    console.log('[architecture] Dependency boundaries are valid.');
    return;
  }

  console.error(`\n[architecture] ${errors.length} violation(s) detected.`);
  process.exitCode = 1;
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (entryPath === fileURLToPath(import.meta.url)) {
  runCli();
}
