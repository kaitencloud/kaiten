import { HttpResponse, http } from 'msw';
import { bulkFlagEvaluation } from '../../../e2e/app/_support/model/platform-flags';

export const flagEvaluationHandlers = (flags: Record<string, boolean>) => [
  http.post(/\/api\/ofrep\/v1\/evaluate\/flags$/, () =>
    HttpResponse.json(bulkFlagEvaluation(flags)),
  ),
];
