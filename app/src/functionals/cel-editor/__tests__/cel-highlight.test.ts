import { describe, it, expect } from 'vite-plus/test';
import { tokenizeCel } from '../logic/cel-highlight';
import type { CelToken } from '../logic/cel-highlight';

const kindsOf = (rule: string) =>
  tokenizeCel(rule).map((token) => `${token.kind}:${token.text}`);

// The one property every tokenizer must keep: concatenating the tokens gives
// back the rule, byte for byte — a display tokenizer that drops or reorders
// text shows the author a rule they did not write.
const roundTrips = (rule: string) => {
  const tokens = tokenizeCel(rule);
  expect(tokens.map((token: CelToken) => token.text).join('')).toBe(rule);
};

describe('tokenizeCel', () => {
  it('reassembles to the exact input', () => {
    for (const rule of [
      '',
      "__kaiten.license.slug == 'scale' && size(x) > 1",
      'a == "b\\"c" // trailing',
      "entitlements['seats'].percentage >= 0.9",
      'x in [1, 2.5, 1h30m]',
    ]) {
      roundTrips(rule);
    }
  });

  it('colors strings, escapes included', () => {
    expect(kindsOf("x == 'sca\\'le'")).toContain("string:'sca\\'le'");
    expect(kindsOf('x == "eu"')).toContain('string:"eu"');
  });

  it('leaves an unterminated string as a string to the end', () => {
    expect(kindsOf("x == 'oops")).toContain("string:'oops");
  });

  it('colors comments to the end of the line', () => {
    expect(kindsOf('true // why\nfalse')).toContain('comment:// why');
  });

  it('colors literals and operators-as-words as keywords', () => {
    const kinds = kindsOf("true && x in ['a'] && y == null");

    expect(kinds).toContain('keyword:true');
    expect(kinds).toContain('keyword:in');
    expect(kinds).toContain('keyword:null');
  });

  it('colors what can be called', () => {
    const kinds = kindsOf("has(x) && y.startsWith('a') && list.exists(i, i)");

    expect(kinds).toContain('callable:has');
    expect(kinds).toContain('callable:startsWith');
    expect(kinds).toContain('callable:exists');
  });

  it('colors numbers, durations included', () => {
    expect(kindsOf('x > 1.5e3 && y < 2h')).toEqual(
      expect.arrayContaining(['number:1.5e3', 'number:2h']),
    );
  });

  // Context names are the author's own vocabulary; coloring them like CEL's
  // would blur exactly the distinction the highlighting exists to show.
  it('leaves identifiers plain, the facts root included', () => {
    const kinds = kindsOf('__kaiten.license.slug == user.cohort');

    expect(kinds.filter((kind) => kind.startsWith('keyword:'))).toEqual([]);
    expect(kinds.filter((kind) => kind.startsWith('callable:'))).toEqual([]);
  });

  it('does not color a keyword inside a string', () => {
    expect(kindsOf("x == 'true'")).toContain("string:'true'");
    expect(kindsOf("x == 'true'")).not.toContain('keyword:true');
  });
});
