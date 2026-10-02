import { e2eScenarioChecks } from '../e2e/app/_support/scenario-registry';

let failed = 0;
for (const [name, factory] of e2eScenarioChecks) {
  try {
    factory();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}\n     ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (failed > 0) {
  console.error(`\n${failed} scenario factories failed contract validation.`);
  process.exitCode = 1;
} else {
  console.log(`\n${e2eScenarioChecks.length} scenario factories pass their contracts.`);
}
