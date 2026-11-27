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

const IDENTIFIER_START = /[A-Za-z_]/;
const IDENTIFIER_CHAR = /[A-Za-z0-9_]/;

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
    // A known key may have a shape of its own; any other key has the one
    // every entry shares, if there is one.
    const entry = segment.dynamic
      ? undefined
      : node.entries?.find((candidate) => candidate.name === segment.name);
    return entry ?? node.values ?? null;
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

export function trimEndIndex(text: string, end: number): number {
  let trimmed = end;

  while (trimmed > 0 && /\s/.test(text[trimmed - 1])) {
    trimmed -= 1;
  }

  return trimmed;
}

export function trimEnd(text: string): string {
  return text.slice(0, trimEndIndex(text, text.length));
}
