import { scanChain, trimEnd, trimEndIndex } from './cel-chain';
import type { CelPathSegment } from './cel-chain';

/*
Where a string literal is the value something is compared with.

`__kaiten.license.familySlug == 'bronze'` and `... familySlug in ['bronze',
'silver']` both put a literal opposite a name the editor may know the values
of. This reads that relationship out of the text, in both directions: from the
cursor, to offer the values while the literal is being typed, and from a
literal, to document it when it is hovered.

Only these two comparisons count. A literal passed to a function —
`startsWith('bro')` — is a different question, and one compared with anything
the scanner cannot read as a name is a value nobody described.
*/

/**
 * The name a literal about to be written, or being written, is compared with,
 * read from the text before it: `<name> ==`, `<name> !=`, or the list a literal
 * is an element of, `<name> in [..., `. Null when the text ends anywhere else.
 */
export function valueOwnerBefore(before: string): CelPathSegment[] | null {
  const text = trimEnd(before);

  if (text.endsWith('==') || text.endsWith('!=')) {
    return scanChain(text.slice(0, -2));
  }

  const bracket = listOpening(text);
  if (bracket < 0) return null;

  // `in` is a keyword, so `plugin [` or `min [` are not it.
  const owner = trimEnd(text.slice(0, bracket));
  if (!/(?:^|[^A-Za-z0-9_])in$/.test(owner)) return null;

  return scanChain(owner.slice(0, -2));
}

/**
 * Where the list the text ends inside of is opened, or -1: the text ends on
 * its `[`, or on a comma after literals that all follow it. An element that is
 * not a literal ends the search, since what such a list holds is no longer a
 * list of values.
 */
function listOpening(text: string): number {
  let end = text.length;

  for (;;) {
    if (text[end - 1] === '[') return end - 1;
    if (text[end - 1] !== ',') return -1;

    const literalEnd = trimEndIndex(text, end - 1);
    const literalStart = stringStartBefore(text, literalEnd);
    if (literalStart < 0) return -1;

    end = trimEndIndex(text, literalStart);
  }
}

/** Where the string literal ending at `end` starts, or -1 when none does. */
function stringStartBefore(text: string, end: number): number {
  const quote = text[end - 1];
  if (quote !== "'" && quote !== '"') return -1;

  for (let i = end - 2; i >= 0; i -= 1) {
    if (text[i] === quote && !isEscaped(text, i)) return i;
  }

  return -1;
}

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;

  while (
    index - 1 - backslashes >= 0 &&
    text[index - 1 - backslashes] === '\\'
  ) {
    backslashes += 1;
  }

  return backslashes % 2 === 1;
}

/**
 * A name read off the start of the text that follows a literal: the right-hand
 * side of `'bronze' == __kaiten.license.familySlug`. Dotted names only — a call
 * or an index after it makes it something else.
 */
const FOLLOWING_OWNER =
  /^\s*(?:==|!=)\s*([A-Za-z_]\w*(?:\s*\.\s*[A-Za-z_]\w*)*)(?![\w(.[])/;

function ownerAfter(after: string): CelPathSegment[] | null {
  const match = FOLLOWING_OWNER.exec(after);
  if (!match) return null;

  return match[1].split(/\s*\.\s*/).map((name) => ({ name, dynamic: false }));
}

/** A closed string literal on a line: where it sits, and what it spells. */
interface Literal {
  /** Offset of the opening quote. */
  start: number;
  /** Offset just past the closing quote. */
  end: number;
  value: string;
}

function literalsIn(line: string): Literal[] {
  const literals: Literal[] = [];
  let start = -1;
  let quote = '';

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (start >= 0) {
      if (char === '\\') {
        i += 1;
      } else if (char === quote) {
        literals.push({
          start,
          end: i + 1,
          value: line.slice(start + 1, i).replace(/\\(.)/g, '$1'),
        });
        start = -1;
      }
    } else if (char === "'" || char === '"') {
      start = i;
      quote = char;
    }
  }

  return literals;
}

/**
 * The literal at `offset` of a line when it is compared with a name, together
 * with that name. Null for a literal that is anything else, which is most of
 * them.
 */
export function comparedLiteralAt(
  line: string,
  offset: number,
): {
  path: CelPathSegment[];
  value: string;
  start: number;
  end: number;
} | null {
  const literal = literalsIn(line).find(
    (candidate) => candidate.start <= offset && offset < candidate.end,
  );
  if (!literal) return null;

  const path =
    valueOwnerBefore(line.slice(0, literal.start)) ??
    ownerAfter(line.slice(literal.end));
  if (!path) return null;

  return { path, ...literal };
}
