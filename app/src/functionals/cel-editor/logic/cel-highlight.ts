import {
  CEL_GLOBAL_FUNCTIONS,
  CEL_GLOBAL_MACROS,
  CEL_LITERALS,
  CEL_MEMBER_MACROS,
  CEL_OPERATOR_KEYWORDS,
  CEL_RESERVED_WORDS,
  memberFunctionsFor,
} from './cel-language';

/**
 * A lightweight CEL tokenizer for read-only display.
 *
 * A rule is shown far more often than it is edited — in the targeting list, in
 * the clickable preview that opens the editor — and mounting Monaco to color
 * one line would make every one of those surfaces pay the editor's price. This
 * covers the display half only: no positions, no errors, no incrementality.
 * The vocabulary is the same set of lists the Monarch tokenizer reads, so the
 * two cannot disagree about what is a keyword.
 */

export type CelTokenKind =
  | 'string'
  | 'number'
  | 'keyword'
  | 'callable'
  | 'comment'
  | 'plain';

export interface CelToken {
  text: string;
  kind: CelTokenKind;
}

const KEYWORDS = new Set([
  ...CEL_LITERALS,
  ...CEL_OPERATOR_KEYWORDS,
  ...CEL_RESERVED_WORDS,
]);

const CALLABLES = new Set([
  ...CEL_GLOBAL_MACROS,
  ...CEL_MEMBER_MACROS,
  ...CEL_GLOBAL_FUNCTIONS,
  ...memberFunctionsFor('dyn'),
]);

const IDENTIFIER = /^[A-Za-z_]\w*/;
const NUMBER = /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[a-zA-Z]*/;

export function tokenizeCel(rule: string): CelToken[] {
  const tokens: CelToken[] = [];
  let plain = '';

  const flushPlain = () => {
    if (plain !== '') {
      tokens.push({ text: plain, kind: 'plain' });
      plain = '';
    }
  };

  let i = 0;
  while (i < rule.length) {
    const char = rule[i];

    if (char === '/' && rule[i + 1] === '/') {
      flushPlain();
      const end = rule.indexOf('\n', i);
      const stop = end === -1 ? rule.length : end;
      tokens.push({ text: rule.slice(i, stop), kind: 'comment' });
      i = stop;
      continue;
    }

    if (char === "'" || char === '"') {
      flushPlain();
      let j = i + 1;
      while (j < rule.length && rule[j] !== char) {
        if (rule[j] === '\\') j += 1;
        j += 1;
      }
      const stop = Math.min(j + 1, rule.length);
      tokens.push({ text: rule.slice(i, stop), kind: 'string' });
      i = stop;
      continue;
    }

    if (char >= '0' && char <= '9') {
      flushPlain();
      const match = NUMBER.exec(rule.slice(i));
      const text = match ? match[0] : char;
      tokens.push({ text, kind: 'number' });
      i += text.length;
      continue;
    }

    const identifier = IDENTIFIER.exec(rule.slice(i));
    if (identifier) {
      const name = identifier[0];
      const kind = KEYWORDS.has(name)
        ? 'keyword'
        : CALLABLES.has(name)
          ? 'callable'
          : 'plain';

      if (kind === 'plain') {
        plain += name;
      } else {
        flushPlain();
        tokens.push({ text: name, kind });
      }
      i += name.length;
      continue;
    }

    plain += char;
    i += 1;
  }

  flushPlain();

  return tokens;
}
