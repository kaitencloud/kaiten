import { scanChain, trimEnd } from './cel-chain';
import type { CelPathSegment } from './cel-chain';
import { valueOwnerBefore } from './cel-value-position';

export { resolveNode, scanChain } from './cel-chain';
export type { CelPathSegment } from './cel-chain';

/**
 * What the cursor is positioned to complete.
 *
 * `root` is a bare name being typed, `member` is the position after a dot, and
 * `key` is inside the quotes of an index — `entitlements['|`. They are distinct
 * because each offers a different set: a key completion inserts a slug, a
 * member completion inserts a field name, and only `root` should offer the CEL
 * keywords.
 *
 * `value` is the right-hand side of a comparison — `license.familySlug == |`,
 * or an element of the list after `in [` — whether or not its quote has been
 * opened (`quote` says which, and is null when it has not). `path` is the name
 * compared with, and what to offer there is whatever values that name has: when
 * it has none, an unquoted value is a root being typed and a quoted one is
 * nothing at all, exactly as before.
 *
 * `none` is a position where suggesting anything would be noise — inside a
 * string literal that is not one of these, or in the middle of a number.
 *
 * A `member` with an empty path is a dot off something the scanner cannot
 * read — `(a || b).` or a chain continued from the previous line. The value
 * has some shape, just not one the editor knows, which is exactly what `dyn`
 * already means downstream.
 */
export type CelCompletionTarget =
  | { kind: 'root'; prefix: string }
  | {
      kind: 'member';
      path: CelPathSegment[];
      prefix: string;
      /**
       * How many characters from the dot up to where the prefix starts, the dot
       * included: what a suggestion replaces when it is not spelled after the
       * dot (`['ai-credits']`).
       */
      dotLength: number;
    }
  | { kind: 'key'; path: CelPathSegment[]; prefix: string }
  | {
      kind: 'value';
      path: CelPathSegment[];
      prefix: string;
      quote: "'" | '"' | null;
    }
  | { kind: 'none' };

/** A partial name being typed at the cursor. */
const TRAILING_IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Where the text stands with respect to string literals: inside one, just
 * done closing one, or clear of them.
 *
 * This is a scan rather than a regex because only position decides what a
 * quote means: the same `'` opens an entitlement key after `[` and an ordinary
 * value everywhere else, and a regex anchored at the end cannot see which
 * without re-reading everything before it anyway.
 */
type StringScan = {
  /** The string still open at the cursor, if any. */
  open: {
    /** Index of the opening quote. */
    openedAt: number;
    /** Whether the string is the key of an index: its quote follows `[`. */
    isIndexKey: boolean;
    /** Index of that `[`, meaningful when isIndexKey. */
    bracketIndex: number;
  } | null;
  /** Whether the text ends on the quote that closed a string. */
  closedAtEnd: boolean;
};

function scanStrings(text: string): StringScan {
  let open: StringScan['open'] = null;
  let quote = '';
  let closedAt = -1;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (open) {
      if (char === '\\') {
        i += 1;
      } else if (char === quote) {
        open = null;
        closedAt = i;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      let before = i - 1;
      while (before >= 0 && /\s/.test(text[before])) {
        before -= 1;
      }

      quote = char;
      open = {
        openedAt: i,
        isIndexKey: before >= 0 && text[before] === '[',
        bracketIndex: before,
      };
    }
  }

  return { open, closedAtEnd: closedAt === text.length - 1 && closedAt >= 0 };
}

/**
 * Reads what the cursor is about to complete out of the text before it.
 *
 * This replaces matching `(\w+)\.$`, which could only ever see one level: it
 * completed `license.` and was blind to `__kaiten.license.`, which is where
 * every server fact actually lives.
 */
export function completionTargetAt(
  textBeforeCursor: string,
): CelCompletionTarget {
  const strings = scanStrings(textBeforeCursor);

  // Inside a string. An index key completes to the map's known keys, and the
  // value of a comparison to the values of what it is compared with. Any
  // other string is a value being typed, where every suggestion is noise —
  // and `'` is a trigger character, so without this case the editor popped
  // its root list into the middle of every literal.
  if (strings.open) {
    if (!strings.open.isIndexKey) {
      const owner = valueOwnerBefore(
        textBeforeCursor.slice(0, strings.open.openedAt),
      );
      if (!owner) {
        return { kind: 'none' };
      }

      return {
        kind: 'value',
        path: owner,
        prefix: textBeforeCursor.slice(strings.open.openedAt + 1),
        quote: textBeforeCursor[strings.open.openedAt] === '"' ? '"' : "'",
      };
    }

    return {
      kind: 'key',
      path:
        scanChain(textBeforeCursor.slice(0, strings.open.bracketIndex)) ?? [],
      prefix: textBeforeCursor.slice(strings.open.openedAt + 1),
    };
  }

  // The quote that just closed a string is also a trigger character, and the
  // only legal continuations are operators and dots — nothing completable.
  if (strings.closedAtEnd) {
    return { kind: 'none' };
  }

  const partial = TRAILING_IDENTIFIER.exec(textBeforeCursor);
  const prefix = partial ? partial[0] : '';
  const chain = partial
    ? textBeforeCursor.slice(0, partial.index)
    : textBeforeCursor;

  const beforeDot = trimEnd(chain);
  if (!beforeDot.endsWith('.')) {
    const owner = valueOwnerBefore(chain);

    return owner
      ? { kind: 'value', path: owner, prefix, quote: null }
      : { kind: 'root', prefix };
  }

  const dotLength = chain.length - beforeDot.length + 1;
  const path = scanChain(beforeDot.slice(0, -1));
  if (!path || path.length === 0) {
    // A dot with no readable chain before it. After a digit it is a float
    // being typed — `1.` on the way to `1.5` — and completing anything there
    // is wrong. After anything else — `(a || b).`, `'text'.`, a chain broken
    // across lines — it is a member access on a value of unknown shape.
    const beforeTheDot = trimEnd(beforeDot.slice(0, -1));
    if (/[0-9]$/.test(beforeTheDot)) {
      return { kind: 'none' };
    }

    return { kind: 'member', path: [], prefix, dotLength };
  }

  return { kind: 'member', path, prefix, dotLength };
}

/**
 * The path a hover should document: the access chain ending at the hovered
 * word, in whichever of CEL's two map-access spellings it is written.
 *
 * The quoted form needs its own reading. In `entitlements['seats']` the word
 * `seats` sits inside a string, where the backwards scan cannot reach — but
 * an index key is a name like any other, and an author hovering it deserves
 * the same answer both spellings get.
 */
export function hoverPathAt(
  textUpToWordEnd: string,
  word: string,
): CelPathSegment[] | null {
  const target = completionTargetAt(textUpToWordEnd);

  if (target.kind === 'key') {
    if (target.prefix !== word || target.path.length === 0) return null;

    return [...target.path, { name: word, dynamic: false }];
  }

  // A literal is documented as a whole (comparedLiteralAt), not by the name
  // the scanner can read in front of it. A value with no quote is a name like
  // any other, which the chain below reads.
  if (target.kind === 'none') return null;
  if (target.kind === 'value' && target.quote) return null;

  return scanChain(textUpToWordEnd);
}
