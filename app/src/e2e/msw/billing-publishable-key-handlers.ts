import { HttpResponse } from 'msw/http';
import {
  handleCreatePublishableKey,
  handleListPublishableKeys,
  handleRevokePublishableKey,
  handleUpdatePublishableKey,
} from '@/api-client/msw.gen';
import type { BillingAppModel } from '../../../e2e/app/_support/model/billing-app-model';
import { pageRequestOf } from '../../../e2e/app/_support/model/billing-pages';
import { withProblems } from './billing-problems';
import { noop, type PersistMswState } from './persistence';

/**
 * The publishable keys: listing them by their last four characters, issuing one (the
 * answer is the only time the key is seen), changing the label and the origins of a live
 * key and revoking it. The model refuses as the API does, with its codes.
 */
export const billingPublishableKeyHandlers = (
  model: BillingAppModel,
  persist: PersistMswState = noop,
) => {
  const { publishableKeys } = model;

  return [
    handleListPublishableKeys(
      withProblems(({ request }) => {
        const query = new URL(request.url).searchParams;

        return HttpResponse.json(
          publishableKeys.listKeys(
            query.get('includeRevoked') === 'true',
            pageRequestOf(query),
          ),
        );
      }),
    ),
    handleCreatePublishableKey(
      withProblems(async ({ request }) => {
        const created = publishableKeys.createKey(await request.json());
        persist();
        return HttpResponse.json(created, { status: 201 });
      }),
    ),
    handleUpdatePublishableKey(
      withProblems(async ({ params, request }) => {
        const updated = publishableKeys.updateKey(
          params.keyId,
          await request.json(),
        );
        persist();
        return HttpResponse.json(updated);
      }),
    ),
    handleRevokePublishableKey(
      withProblems(({ params }) => {
        const revoked = publishableKeys.revokeKey(params.keyId);
        persist();
        return HttpResponse.json(revoked);
      }),
    ),
  ];
};
