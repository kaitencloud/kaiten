import { expect, test } from '@playwright/test';

test('the app loader initializes the compiled Wasm and survives half-typed rules', async ({
  page,
}) => {
  await page.goto('/');
  const results = await page.evaluate(async () => {
    const path = '/src/functionals/cel-editor/logic/cel-engine.loader.ts';
    const { loadCelEngine } = await import(/* @vite-ignore */ path);
    const engine = await loadCelEngine();
    return [
      '1 == 1',
      '1 ==',
      '(',
      'context.plan ==',
      'context.plan == "pro"',
    ].map((expression) => engine.validate(expression, { context: {} }).isValid);
  });
  expect(results).toEqual([true, false, false, false, true]);
});
