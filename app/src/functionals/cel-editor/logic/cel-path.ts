import type { CelContextNode } from '../types/cel-context.types';

/**
 * One step of an access chain. `dynamic` marks a key the editor cannot read —
 * `entitlements[someVar]` — which resolves against a map (every entry has the
 * same shape) but not against an object (the field name is unknowable).
 */
export interface CelPathSegment {
  name: string;
  dynamic: boolean;
}

/**
 * What the cursor is positioned to complete.
 *
 * `root` is a bare name being typed, `member` is the position after a dot, and
 * `key` is inside the quotes of an index — `entitlements['|`. They are distinct
 * because each offers a different set: a key completion inserts a slug, a
 * member completion inserts a field name, and only `root` should offer the CEL
 * keywords. `none` is a position where suggesting anything would be noise —
 * inside an ordinary string literal, or in the middle of a number.
 *
 * A `member` with an empty path is a dot off something the scanner cannot
 * read — `(a || b).` or a chain continued from the previous line. The value
 * has some shape, just not one the editor knows, which is exactly what `dyn`
 * already means downstream.
 */
export type CelCompletionTarget =
  | { kind: 'root'; prefix: string }
  | { kind: 'member'; path: CelPathSegment[]; prefix: string }
  | { kind: 'key'; path: CelPathSegment[]; prefix: string }
  | { kind: 'none' };

const IDENTIFIER_START = /[A-Za-z_]/;
const IDENTIFIER_CHAR = /[A-Za-z0-9_]/;

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

  // Inside a string. An index key completes to the map's known keys; any
  // other string is a value being typed, where every suggestion is noise —
  // and `'` is a trigger character, so without this case the editor popped
  // its root list into the middle of every literal.
  if (strings.open) {
    if (!strings.open.isIndexKey) {
      return { kind: 'none' };
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
    return { kind: 'root', prefix };
  }

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

    return { kind: 'member', path: [], prefix };
  }

  return { kind: 'member', path, prefix };
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

  if (target.kind === 'none') return null;

  return scanChain(textUpToWordEnd);
}

/**
 * Reads the access chain that ends the given text, scanning backwards from it.
 *
 * Backwards because that is where the cursor is: the chain runs from wherever
 * it happens to start — after a `(`, an operator, or the beginning of the rule
 * — up to the cursor, and only its end is known. Anything that is not a name,
 * a dot or an index ends the chain, which is what keeps `has(__kaiten.` and
 * `a == __kaiten.` from dragging the tokens before them in.
 *
 * Returns null when the text does not end in a chain at all.
 */
export function scanChain(text: string): CelPathSegment[] | null {
  const segments: CelPathSegment[] = [];
  let end = trimEndIndex(text, text.length);

  for (;;) {
    if (end === 0) break;

    if (text[end - 1] === ']') {
      const open = openingBracket(text, end - 1);
      if (open < 0) return null;

      segments.push(indexSegment(text.slice(open + 1, end - 1)));
      end = trimEndIndex(text, open);
      // An index applies to something, so the operand is still to come.
      continue;
    }

    const start = identifierStart(text, end);
    if (start === end) return null;

    segments.push({ name: text.slice(start, end), dynamic: false });

    end = trimEndIndex(text, start);
    if (end === 0 || text[end - 1] !== '.') break;

    end = trimEndIndex(text, end - 1);
  }

  if (segments.length === 0) return null;

  return segments.reverse();
}

/**
 * Walks a path down the tree, or returns null where it leaves what is
 * described. A map answers to any key, which is what makes both
 * `entitlements['seats']` and `entitlements.seats` land on the same shape —
 * the two forms the server accepts.
 */
export function resolveNode(
  roots: CelContextNode[],
  path: CelPathSegment[],
): CelContextNode | null {
  if (path.length === 0) return null;

  let node = roots.find((root) => root.name === path[0].name) ?? null;

  for (const segment of path.slice(1)) {
    if (!node) return null;
    node = childNode(node, segment);
  }

  return node;
}

function childNode(
  node: CelContextNode,
  segment: CelPathSegment,
): CelContextNode | null {
  if (node.type === 'map') {
    return node.values ?? null;
  }

  if (node.type === 'object' && !segment.dynamic) {
    return node.fields?.find((field) => field.name === segment.name) ?? null;
  }

  return null;
}

/**
 * The key inside `[...]`. A quoted key is the name it spells; anything else is
 * computed at evaluation and cannot be read here.
 */
function indexSegment(inner: string): CelPathSegment {
  const quoted = /^\s*(['"])(.*)\1\s*$/.exec(inner);

  return quoted
    ? { name: quoted[2], dynamic: false }
    : { name: '', dynamic: true };
}

/** Scans back to the `[` matching the `]` at index, or -1. */
function openingBracket(text: string, closeIndex: number): number {
  let depth = 0;

  for (let i = closeIndex; i >= 0; i -= 1) {
    if (text[i] === ']') depth += 1;
    if (text[i] === '[') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

/** Scans back over an identifier ending at `end`, returning where it starts. */
function identifierStart(text: string, end: number): number {
  let start = end;

  while (start > 0 && IDENTIFIER_CHAR.test(text[start - 1])) {
    start -= 1;
  }

  // A name cannot begin with a digit; `1.foo` is not an access chain.
  if (start === end || !IDENTIFIER_START.test(text[start])) return end;

  return start;
}

function trimEndIndex(text: string, end: number): number {
  let trimmed = end;

  while (trimmed > 0 && /\s/.test(text[trimmed - 1])) {
    trimmed -= 1;
  }

  return trimmed;
}

function trimEnd(text: string): string {
  return text.slice(0, trimEndIndex(text, text.length));
}
