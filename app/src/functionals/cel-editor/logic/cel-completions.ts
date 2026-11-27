import type { CelCompletionTarget, CelPathSegment } from './cel-path';
import { resolveNode } from './cel-chain';
import {
  CEL_GLOBAL_FUNCTIONS,
  CEL_GLOBAL_MACROS,
  CEL_LITERALS,
  CEL_MEMBER_MACROS,
  CEL_OPERATOR_KEYWORDS,
  CEL_RESERVED_WORDS,
  callSnippet,
  isIterable,
  memberFunctionsFor,
} from './cel-language';
import type { CelContextNode, CelValueType } from '../types/cel-context.types';

export type CelProposalKind =
  | 'variable'
  | 'field'
  | 'key'
  | 'value'
  | 'function'
  | 'macro'
  | 'literal';

/**
 * One suggestion, in terms of what it means rather than how Monaco draws it.
 *
 * Keeping this free of Monaco is what makes the completion rules testable:
 * the old provider built editor objects inline, so nothing about which names
 * it offered could be asserted without standing up an editor.
 */
export interface CelProposal {
  label: string;
  insertText: string;
  kind: CelProposalKind;
  /** Shown beside the label — the type, for anything that has one. */
  detail?: string;
  documentation?: string;
  /** Whether insertText carries `${n}` tab stops. */
  snippet?: boolean;
  /**
   * Whether insertText stands in for the dot before the name as well, because
   * it is not spelled after one: `['ai-credits']` replaces `.ai-credits`.
   */
  replacesDot?: boolean;
  /** Groups context names above CEL's own vocabulary. */
  sortText: string;
}

/** Sort groups. Monaco orders by this string, so the digit leads. */
const KNOWN_VALUE = '0';
const FROM_CONTEXT = '1';
const CALLABLE = '2';
const LITERAL = '3';

/**
 * What to offer at the cursor.
 *
 * The context always comes first: the names an author is reaching for are
 * almost always the organization's own, and CEL's vocabulary is what they fall
 * back to.
 */
export function proposalsFor(
  target: CelCompletionTarget,
  roots: CelContextNode[],
): CelProposal[] {
  if (target.kind === 'none') {
    return [];
  }

  if (target.kind === 'root') {
    return rootProposals(roots);
  }

  const node = resolveNode(roots, target.path);

  if (target.kind === 'value') {
    return valueProposals(node, target.quote, roots);
  }

  if (target.kind === 'key') {
    return keyProposals(node);
  }

  return memberProposals(node, target.path);
}

function rootProposals(roots: CelContextNode[]): CelProposal[] {
  return [
    ...roots.map(contextProposal('variable')),
    ...CEL_GLOBAL_MACROS.map(callableProposal('macro')),
    ...CEL_GLOBAL_FUNCTIONS.map(callableProposal('function')),
    ...CEL_LITERALS.map((literal) => ({
      label: literal,
      insertText: literal,
      kind: 'literal' as const,
      sortText: LITERAL + literal,
    })),
  ];
}

/**
 * Inside the quotes of an index. Only the keys belong here — a function name
 * would be nonsense in a string, which the previous provider had no way to
 * know because it never noticed it was inside one.
 */
function keyProposals(node: CelContextNode | null): CelProposal[] {
  if (!node || node.type !== 'map') return [];

  return (node.knownKeys ?? []).map((key) => ({
    label: key,
    insertText: key,
    kind: 'key' as const,
    detail: keyType(node, key),
    documentation: entryNamed(node, key)?.description ?? node.description,
    sortText: FROM_CONTEXT + key,
  }));
}

/**
 * The right-hand side of a comparison. What the compared name is usually
 * compared with comes first. Without a quote the author may as well be about to
 * write another name — `plan == other.plan` — so the roots follow; inside one
 * only a literal makes sense, and a name with no known values has nothing to
 * say.
 */
function valueProposals(
  node: CelContextNode | null,
  quote: "'" | '"' | null,
  roots: CelContextNode[],
): CelProposal[] {
  const values = (node?.knownValues ?? []).map((known): CelProposal => ({
    label: known.value,
    // Inside a quote the author has already written the delimiters.
    insertText: quote
      ? escapeLiteral(known.value, quote)
      : `'${escapeLiteral(known.value, "'")}'`,
    kind: 'value',
    detail: known.label,
    documentation: known.description,
    sortText: KNOWN_VALUE + known.value,
  }));

  if (quote) return values;

  return [...values, ...rootProposals(roots)];
}

function escapeLiteral(value: string, quote: "'" | '"'): string {
  return value.replaceAll('\\', '\\\\').replaceAll(quote, `\\${quote}`);
}

/**
 * After a dot.
 *
 * An unresolved path is treated as `dyn` rather than as nothing: a host targets
 * on attributes the server has never heard of — `user.cohort`, `device.os` —
 * and those rules are legitimate, so the editor offers CEL's own vocabulary
 * there instead of going silent.
 */
function memberProposals(
  node: CelContextNode | null,
  path: CelPathSegment[],
): CelProposal[] {
  const type: CelValueType = node?.type ?? 'dyn';

  return [
    ...namedChildren(node, path),
    ...(isIterable(type)
      ? CEL_MEMBER_MACROS.map(callableProposal('macro'))
      : []),
    ...memberFunctionsFor(type).map(callableProposal('function')),
  ];
}

function namedChildren(
  node: CelContextNode | null,
  path: CelPathSegment[],
): CelProposal[] {
  if (!node) return [];

  if (node.type === 'object') {
    return (node.fields ?? []).map(contextProposal('field'));
  }

  // A map is readable by dot as well as by index, so its keys belong here
  // too — `entitlements.seats` is the same lookup as `entitlements['seats']`.
  //
  // Only a key that is a plain identifier can be spelled after the dot.
  // `entitlements.ai-credits` reads as a subtraction, so any other key is
  // offered as the index it has to be written as, in place of the dot.
  if (node.type === 'map') {
    return (node.knownKeys ?? []).map((key) => ({
      label: key,
      insertText: isDotAccessible(key) ? key : `['${escapeLiteral(key, "'")}']`,
      replacesDot: !isDotAccessible(key),
      kind: 'key' as const,
      detail: keyType(node, key),
      documentation:
        entryNamed(node, key)?.description ??
        `A key of ${path.map((segment) => segment.name).join('.')}`,
      sortText: FROM_CONTEXT + key,
    }));
  }

  return [];
}

/** Whether `.key` reads as that key: an identifier CEL does not reserve. */
function isDotAccessible(key: string): boolean {
  return (
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) &&
    !CEL_RESERVED_WORDS.includes(key) &&
    !CEL_LITERALS.includes(key) &&
    !CEL_OPERATOR_KEYWORDS.includes(key)
  );
}

function entryNamed(
  node: CelContextNode,
  key: string,
): CelContextNode | undefined {
  return node.entries?.find((entry) => entry.name === key);
}

/** A key's own shape when it has one, else the one every entry shares. */
function keyType(node: CelContextNode, key: string) {
  return entryNamed(node, key)?.type ?? node.values?.type;
}

const contextProposal =
  (kind: 'variable' | 'field') =>
  (node: CelContextNode): CelProposal => ({
    label: node.name,
    insertText: node.name,
    kind,
    detail: node.optional ? `${node.type} (may be absent)` : node.type,
    documentation: node.description,
    sortText: FROM_CONTEXT + node.name,
  });

const callableProposal =
  (kind: 'function' | 'macro') =>
  (name: string): CelProposal => ({
    label: name,
    insertText: name + callSnippet(name),
    kind,
    snippet: true,
    sortText: CALLABLE + name,
  });

/**
 * The documentation shown when hovering a name, or null when the name is not
 * one this schema describes — a host's own attribute, which the editor knows
 * nothing about and should say nothing about.
 */
export function hoverFor(
  path: CelPathSegment[],
  roots: CelContextNode[],
): { title: string; type: CelValueType; description?: string } | null {
  const node = resolveNode(roots, path);
  if (!node) return null;

  return {
    title: path.map((segment) => segment.name).join('.'),
    type: node.type,
    description: node.optional
      ? [node.description, 'May be absent — guard it with `has()`.']
          .filter(Boolean)
          .join('\n\n')
      : node.description,
  };
}

/**
 * The documentation shown when hovering a string literal compared with a name
 * that has known values, or null when the literal is not one of them. An
 * unknown literal is the check's to report, and a second, vaguer message from
 * the hover would only repeat it.
 */
export function hoverForValue(
  path: CelPathSegment[],
  value: string,
  roots: CelContextNode[],
): { title: string; label?: string; description?: string } | null {
  const known = resolveNode(roots, path)?.knownValues?.find(
    (candidate) => candidate.value === value,
  );
  if (!known) return null;

  return {
    title: path.map((segment) => segment.name).join('.'),
    label: known.label,
    description: known.description,
  };
}
