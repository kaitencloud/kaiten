import type { CelCompletionTarget, CelPathSegment } from './cel-path';
import { resolveNode } from './cel-path';
import {
  CEL_GLOBAL_FUNCTIONS,
  CEL_GLOBAL_MACROS,
  CEL_LITERALS,
  CEL_MEMBER_MACROS,
  callSnippet,
  isIterable,
  memberFunctionsFor,
} from './cel-language';
import type { CelContextNode, CelValueType } from '../types/cel-context.types';

export type CelProposalKind =
  | 'variable'
  | 'field'
  | 'key'
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
  /** Groups context names above CEL's own vocabulary. */
  sortText: string;
}

/** Sort groups. Monaco orders by this string, so the digit leads. */
const FROM_CONTEXT = '0';
const CALLABLE = '1';
const LITERAL = '2';

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
    detail: node.values?.type,
    documentation: node.description,
    sortText: FROM_CONTEXT + key,
  }));
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
  if (node.type === 'map') {
    return (node.knownKeys ?? []).map((key) => ({
      label: key,
      insertText: key,
      kind: 'key' as const,
      detail: node.values?.type,
      documentation: `A key of ${path.map((segment) => segment.name).join('.')}`,
      sortText: FROM_CONTEXT + key,
    }));
  }

  return [];
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
