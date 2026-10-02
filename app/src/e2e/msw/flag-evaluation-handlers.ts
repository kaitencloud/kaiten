import { handleEvaluateFlagsBulk } from '@/api-client/msw.gen';
import { bulkFlagEvaluation } from '../../../e2e/app/_support/model/platform-flags';

export const flagEvaluationHandlers = (flags: Record<string, boolean>) => [
  handleEvaluateFlagsBulk({ body: bulkFlagEvaluation(flags) }),
];
