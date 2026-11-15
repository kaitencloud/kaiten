import { HttpResponse } from 'msw/http';
import {
  handleArchiveConversionRule,
  handleCreateConversionRule,
  handleCreateModel,
  handleDeleteModel,
  handleGetConversionRule,
  handleGetModel,
  handleListAiInferences,
  handleListAiReservations,
  handleListConversionRules,
  handleListModels,
  handleRefundAiInference,
  handleUpdateConversionRule,
  handleUpdateModel,
} from '@/api-client/msw.gen';
import type { ListAiInferencesData, ListModelsData } from '@/api-client';
import type {
  AiAppModel,
  AiRefundEffect,
} from '../../../e2e/app/_support/model/ai-app-model';
import { graphqlOperationHandler, withErrorHandling } from './handler-factory';
import { noop, type PersistMswState } from './persistence';

const ERROR = 'Unexpected AI mock error';

/** The query string of a request, as an object the model filters with. */
const queryOf = <T>(request: Request): T => {
  const params = new URL(request.url).searchParams;
  const query: Record<string, string | number> = {};
  for (const [key, value] of params) {
    query[key] = key === 'limit' ? Number(value) : value;
  }
  return query as T;
};

/**
 * The AI credits area: the model catalogue, the conversion rules of a licence
 * version, the inference feed and the open reservations of an instance's pool,
 * the refund of a charge, and the GraphQL documents that read the rules with
 * the licences (`AiRateCard`) and what add-ons can grant (`AiAddonGrants`).
 * Writes change the model and persist it. The capability and the
 * `ai-credits` platform flag are other slots (`aiCapability`, `flagEvaluations`).
 */
export const aiHandlers = (
  model: AiAppModel,
  persist: PersistMswState = noop,
  // A refund gives credits back to the pool, whose usage the instances serve:
  // when the page serves them, they are told.
  world: { onRefund?: (effect: AiRefundEffect) => void } = {},
) => [
  handleListModels(
    withErrorHandling(ERROR, ({ request }) =>
      HttpResponse.json(
        model.listModels(queryOf<ListModelsData['query']>(request)),
      ),
    ),
  ),
  handleCreateModel(
    withErrorHandling(ERROR, async ({ request }) => {
      const created = model.createModel(await request.json());
      persist();
      return HttpResponse.json(created, { status: 201 });
    }),
  ),
  handleGetModel(
    withErrorHandling(ERROR, ({ params }) =>
      HttpResponse.json(model.getModel(params.modelSlug)),
    ),
  ),
  handleUpdateModel(
    withErrorHandling(ERROR, async ({ params, request }) => {
      const updated = model.updateModel(params.modelSlug, await request.json());
      persist();
      return HttpResponse.json(updated);
    }),
  ),
  handleDeleteModel(
    withErrorHandling(ERROR, ({ params }) => {
      model.deleteModel(params.modelSlug);
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  handleListConversionRules(
    withErrorHandling(ERROR, ({ params, request }) =>
      HttpResponse.json(model.listRules(params.licenseSlug, queryOf(request))),
    ),
  ),
  handleCreateConversionRule(
    withErrorHandling(ERROR, async ({ params, request }) => {
      const created = model.createRule(
        params.licenseSlug,
        await request.json(),
      );
      persist();
      return HttpResponse.json(created, { status: 201 });
    }),
  ),
  handleGetConversionRule(
    withErrorHandling(ERROR, ({ params }) =>
      HttpResponse.json(model.getRule(params.licenseSlug, params.ruleId)),
    ),
  ),
  handleUpdateConversionRule(
    withErrorHandling(ERROR, async ({ params, request }) => {
      const updated = model.updateRule(
        params.licenseSlug,
        params.ruleId,
        await request.json(),
      );
      persist();
      return HttpResponse.json(updated);
    }),
  ),
  handleArchiveConversionRule(
    withErrorHandling(ERROR, ({ params }) => {
      model.archiveRule(params.licenseSlug, params.ruleId);
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  handleListAiInferences(
    withErrorHandling(ERROR, ({ params, request }) =>
      HttpResponse.json(
        model.listInferences(
          params.instanceSlug,
          params.entitlementSlug,
          queryOf<ListAiInferencesData['query']>(request),
        ),
      ),
    ),
  ),
  handleListAiReservations(
    withErrorHandling(ERROR, ({ params }) =>
      HttpResponse.json(
        model.listReservations(params.instanceSlug, params.entitlementSlug),
      ),
    ),
  ),
  handleRefundAiInference(
    withErrorHandling(ERROR, async ({ params, request }) => {
      const { effect, refund, replayed } = model.refundInference(
        params,
        await request.json(),
        request.headers.get('Idempotency-Key'),
      );
      if (effect) {
        world.onRefund?.(effect);
        persist();
      }
      return HttpResponse.json(refund, {
        headers: replayed ? { 'Idempotent-Replayed': 'true' } : undefined,
      });
    }),
  ),
  graphqlOperationHandler({
    AiAddonGrants: (variables) => model.aiAddonGrants(variables),
    AiRateCard: (variables) => model.aiRateCard(variables),
  }),
];
