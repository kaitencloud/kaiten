import { isDeepStrictEqual } from 'node:util';
import { checkLintParity, lintRulesSignature } from './check-lint-parity';

describe('lint parity', () => {
  it('keeps the actual root/app rules aligned', () => checkLintParity());
  it('detects rule drift while allowing source scopes to differ', () => {
    const config = (rule: string, prefix: string) => `const config = { lint: { ignorePatterns: ['${prefix}out/**'], rules: { correctness: '${rule}' }, overrides: [{ files: ['${prefix}src/routes/**'] }] } };`;
    expect(isDeepStrictEqual(lintRulesSignature(config('error', '')), lintRulesSignature(config('error', 'app/')))).toBe(true);
    expect(isDeepStrictEqual(lintRulesSignature(config('error', '')), lintRulesSignature(config('off', 'app/')))).toBe(false);
  });
});
