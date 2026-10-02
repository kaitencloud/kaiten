import { e2eScenarioChecks } from '../e2e/app/_support/scenario-registry';
import { globSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function unregisteredFactories(
  exportsByPack: Record<string, Record<string, unknown>>,
  registeredNames: string[],
) {
  const registered = new Set(registeredNames.map((name) => name.split('(')[0]));
  return Object.entries(exportsByPack).flatMap(([pack, exports]) =>
    Object.entries(exports)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => `${pack}/${name}`)
      .filter((name) => !registered.has(name)),
  );
}

async function run() {
  const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const exportsByPack: Record<string, Record<string, unknown>> = {};
  for (const file of globSync('**/*.scenarios.ts', {
    cwd: resolve(appDir, 'e2e/app'),
  })) {
    const pack = dirname(file);
    exportsByPack[pack] = await import(
      pathToFileURL(resolve(appDir, 'e2e/app', file)).href
    );
  }
  const missing = unregisteredFactories(
    exportsByPack,
    e2eScenarioChecks.map(([name]) => name),
  );
  if (missing.length) {
    console.error(`Unregistered scenario factories:\n${missing.join('\n')}`);
    process.exitCode = 1;
  }
  let failed = 0;
  for (const [name, factory] of e2eScenarioChecks) {
    try {
      factory();
      console.log(`ok   ${name}`);
    } catch (error) {
      failed += 1;
      console.error(
        `FAIL ${name}\n     ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} scenario factories failed contract validation.`);
    process.exitCode = 1;
  } else {
    console.log(
      `\n${e2eScenarioChecks.length} scenario factories pass their contracts.`,
    );
  }
}

if (
  process.argv[1] &&
  relative(resolve(process.argv[1]), fileURLToPath(import.meta.url)) === ''
) {
  await run();
}
