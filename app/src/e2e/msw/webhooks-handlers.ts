import { HttpResponse, http } from 'msw/http';
import { decodeGrantedScopes, hasScope } from '@/lib/scope-claims';
import { BillingProblem } from '../../../e2e/app/_support/model/billing-problem';
import type { WebhooksAppModel } from '../../../e2e/app/_support/model/webhooks-app-model';
import { withProblems } from './billing-problems';
import { noop, type PersistMswState } from './persistence';

type WebhookScope = 'read:webhooks' | 'write:webhooks';

/** saas-api's `RequireScope`: the caller's token must carry the scope. */
function requireScope(request: Request, scope: WebhookScope) {
  const token = request.headers
    .get('Authorization')
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!hasScope(decodeGrantedScopes(token), scope)) {
    throw new BillingProblem(
      403,
      'RequireScope.MissingScope',
      `missing required scope: ${scope}`,
    );
  }
}

/**
 * saas-api's `/api/webhooks` routes, over the `webhooks` model. Written by hand:
 * `app/openapi.yaml` does not describe them, so there is no generated handler.
 * The history is matched before `/:webhookId`; each write is persisted, so the
 * state survives a reload of the spec's page.
 */
export const webhooksHandlers = (
  model: WebhooksAppModel,
  persist: PersistMswState = noop,
) => [
  http.get(
    '*/api/webhooks',
    withProblems(({ request }) => {
      requireScope(request, 'read:webhooks');
      return HttpResponse.json(model.listWebhooks());
    }),
  ),
  http.get(
    '*/api/webhooks/history',
    withProblems(({ request }) => {
      requireScope(request, 'read:webhooks');
      return HttpResponse.json({ history: [] });
    }),
  ),
  http.get<{ webhookId: string }>(
    '*/api/webhooks/:webhookId',
    withProblems(({ params, request }) => {
      requireScope(request, 'read:webhooks');
      return HttpResponse.json(model.getWebhook(params.webhookId));
    }),
  ),
  http.post(
    '*/api/webhooks',
    withProblems(async ({ request }) => {
      requireScope(request, 'write:webhooks');
      const body: unknown = await request.json().catch(() => null);
      const created = model.createWebhook(body);
      persist();

      return HttpResponse.json(created, { status: 201 });
    }),
  ),
  http.put<{ webhookId: string }>(
    '*/api/webhooks/:webhookId',
    withProblems(async ({ params, request }) => {
      requireScope(request, 'write:webhooks');
      const body: unknown = await request.json().catch(() => null);
      const updated = model.updateWebhook(params.webhookId, body);
      persist();

      return HttpResponse.json(updated);
    }),
  ),
  http.delete<{ webhookId: string }>(
    '*/api/webhooks/:webhookId',
    withProblems(({ params, request }) => {
      requireScope(request, 'write:webhooks');
      model.deleteWebhook(params.webhookId);
      persist();

      return new HttpResponse(null, { status: 204 });
    }),
  ),
];
