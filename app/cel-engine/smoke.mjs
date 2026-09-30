// Smoke test for the built CEL engine: loads the module `build.sh` wrote into
// app/public/wasm and feeds it the rules a person passes through while typing.
//
// Run `pnpm run build:wasm` first, then `pnpm run test:cel-engine:smoke` from
// app/. `pnpm run test:cel-engine` runs the crate's own tests.
//
// It exists because the crate's unit tests call the parser natively, where a
// panic is a test failure. In the module a panic is an abort: validateCEL throws
// "RuntimeError: unreachable" and the CEL editor's route error boundary replaces
// the page. Only the built module shows that.
import { readFileSync } from 'node:fs';

import { initSync, validateCEL } from '../public/wasm/cel-engine.js';

initSync({
  module: readFileSync(
    new URL('../public/wasm/cel-engine_bg.wasm', import.meta.url),
  ),
});

const context = { context: {} };

// [expression, context schema, expected isValid]
const cases = [
  // Finished rules.
  ['1 == 1', undefined, true],
  ['context.plan == "pro"', context, true],
  ['other.plan == "pro"', context, false],
  // Half-typed rules: each one is a parse error, never a trap.
  ['1 ==', undefined, false],
  ['1 +', undefined, false],
  ['context.plan ==', context, false],
  ['a &&', undefined, false],
  ['(', undefined, false],
  [')', undefined, false],
  ['"abc', undefined, false],
  ['{"a":', undefined, false],
  ['@', undefined, false],
  [' ', undefined, false],
];

const failures = [];

for (const [expression, schema, expected] of cases) {
  try {
    const { isValid } = validateCEL(expression, schema);
    if (isValid !== expected) {
      failures.push(
        `${JSON.stringify(expression)}: isValid was ${isValid}, expected ${expected}`,
      );
    }
  } catch (error) {
    // After a trap the instance is unusable, so the cases after it would fail for
    // that reason alone: stop at the first one.
    failures.push(`${JSON.stringify(expression)}: threw ${error}`);
    break;
  }
}

if (failures.length > 0) {
  console.error(`cel-engine smoke test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}

console.log(`cel-engine smoke test: ${cases.length} expressions behave.`);
