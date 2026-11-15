import type { AiInference } from '@/api-client';
import type { PricingRule } from '../engine';
import { termsDiffer } from './receipt-terms';

export type RuleToday =
  /** The session may not read it. */
  | 'UNREAD'
  /** Read, and the API no longer finds it on the row's licence version. */
  | 'NOT_FOUND'
  /** Active, and not written since the commit. */
  | 'UNCHANGED'
  /** Written since the commit; its terms today are those applied. */
  | 'SAME_TERMS'
  /** Its terms today differ from those applied. */
  | 'EDITED'
  /** Archived since: it prices nothing today. */
  | 'ARCHIVED';

/** Whether the rule was written after the commit; true when either date is missing. */
function writtenSince(rule: PricingRule, committedAt: string | undefined) {
  return (
    !rule.updatedAt ||
    !committedAt ||
    Date.parse(rule.updatedAt) > Date.parse(committedAt)
  );
}

/**
 * What the rule of a snapshot is today. "Unchanged" is only said of an active
 * rule that was not written since the commit: equal terms alone would also be
 * true of a rule edited and put back, or archived.
 */
export function ruleTodayOf(
  inference: AiInference,
  rule: PricingRule | null,
  ruleUnread: boolean,
): RuleToday | null {
  const snapshot = inference.pricing;
  if (!snapshot) {
    return null;
  }
  if (ruleUnread) {
    return 'UNREAD';
  }
  if (rule === null || rule.id !== snapshot.ruleId) {
    return 'NOT_FOUND';
  }
  if (rule.status === 'ARCHIVED') {
    return 'ARCHIVED';
  }
  if (termsDiffer(snapshot, rule)) {
    return 'EDITED';
  }

  return writtenSince(rule, inference.committedAt) ? 'SAME_TERMS' : 'UNCHANGED';
}
