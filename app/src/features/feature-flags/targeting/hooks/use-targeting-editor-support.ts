import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { lintTargetingRule } from '@/api-client';
import type { TargetingContextNode } from '@/api-client';
import type {
  CelContextNode,
  CelIssue,
  CelLinter,
} from '@/functionals/cel-editor';
import { targetingContextQueryOptions } from '../queries';

/**
 * Everything the CEL editor needs to be right about Kaiten: what a rule may
 * read, and who to ask whether a rule is any good.
 *
 * Both come from the server. The console used to answer the first itself, from
 * a hand-written list naming `license.plan` and `customer.tier` — neither of
 * which has ever existed — so the editor confidently completed names that
 * lint clean (an unknown root is a host attribute, which is legitimate) and
 * then never matched anything in production.
 */
export function useTargetingEditorSupport(): {
  contextRoots: CelContextNode[];
  lint: CelLinter;
} {
  // A caller without the scope to read this gets no schema and an editor that
  // still highlights and completes CEL's own vocabulary, rather than an error.
  const { data } = useQuery(targetingContextQueryOptions);

  const contextRoots = useMemo(
    () => (data?.roots ?? []).map(toCelContextNode),
    [data],
  );

  // Stable: useCelLint takes this as an effect dependency, so a new function
  // per render would re-check the rule on every render.
  //
  // The issues come back in English, untranslated, on purpose: they are the
  // exact words the save refuses with, and a rule author debugging a marker
  // must be able to match the two. Translating one and not the other would
  // break that; translating both means translating server-side, where the
  // words are written once — a decision for the day rules are authored by
  // people who don't read English.
  const lint = useCallback<CelLinter>(async (rule, signal) => {
    const { data } = await lintTargetingRule({
      body: { rule },
      signal,
      throwOnError: true,
    });

    return data.issues ?? [];
  }, []);

  return { contextRoots, lint };
}

/**
 * The rule field's error, as the async validator reports it: the first issue's
 * message — which FormMessage would show — plus every issue with its position,
 * for the panel under the editor and the editor's own markers.
 *
 * One object through the form's own error channel, instead of a second state
 * store beside it: the field is invalid *because* of these issues, so the form
 * is where they belong — `canSubmit` and the Save button follow for free.
 */
export interface CelRuleVerdict {
  message: string;
  issues: CelIssue[];
}

export function isCelRuleVerdict(error: unknown): error is CelRuleVerdict {
  return (
    typeof error === 'object' &&
    error !== null &&
    Array.isArray((error as CelRuleVerdict).issues)
  );
}

/**
 * The async validator for a rule field. Returns undefined for a rule the lint
 * accepts — and for a lint that cannot be reached: "I could not check this"
 * must not block a save the server will check anyway.
 */
export function ruleVerdictValidator(
  lint: CelLinter,
): (input: {
  value: string;
  signal: AbortSignal;
}) => Promise<CelRuleVerdict | undefined> {
  return async ({ value, signal }) => {
    try {
      const issues = await lint(value, signal);

      if (issues.length === 0) return undefined;

      return { message: issues[0].message, issues };
    } catch {
      return undefined;
    }
  };
}

/**
 * The wire shape and the editor's differ only in how they spell "absent".
 * Converting rather than passing the generated type straight through is what
 * keeps the editor free of any dependency on Kaiten's API.
 */
function toCelContextNode(node: TargetingContextNode): CelContextNode {
  return {
    name: node.name,
    type: node.type,
    description: node.description,
    fields: node.fields?.map(toCelContextNode),
    values: node.values ? toCelContextNode(node.values) : undefined,
    knownKeys: node.knownKeys ?? undefined,
    optional: node.optional,
  };
}
