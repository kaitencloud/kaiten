import { HttpResponse } from 'msw/http';
import {
  handleArchiveAddon,
  handleAssignAddonEntitlement,
  handleAttachInstanceAddon,
  handleCreateAddon,
  handleCreateAddonPrice,
  handleDeleteAddon,
  handleDeprecateAddonPrice,
  handleDetachInstanceAddon,
  handleGetAddon,
  handleGetAddonFamily,
  handleListAddonCompatibility,
  handleListAddonEntitlements,
  handleListAddonFamilies,
  handleListAddonPrices,
  handleListAddons,
  handleListInstanceAddons,
  handlePublishAddon,
  handleRemoveAddonCompatibility,
  handleSetAddonCompatibility,
  handleSetInstanceAddonQuantity,
  handleUnarchiveAddon,
  handleUnassignAddonEntitlement,
  handleUpdateAddon,
  handleUpdateAddonEntitlement,
  handleUpdateAddonFamily,
} from '@/api-client/msw.gen';
import type { Addon, Price } from '@/api-client';
import type { BillingAppModel } from '../../../e2e/app/_support/model/billing-app-model';
import { withProblems } from './billing-problems';
import { noop, type PersistMswState } from './persistence';

/**
 * What the attachments of an instance change in another part of the world: the
 * effective values of its entitlements, which the instance reads. They are another
 * slot's, so the one that assembles the handlers says how to reach them.
 */
export type AddonEffects = {
  syncEffectiveValues(instanceSlug: string): void;
};

const LIFECYCLE_STATES: readonly Addon['lifecycleState'][] = [
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED',
];
const PRICE_STATUSES: readonly Price['status'][] = ['ACTIVE', 'DEPRECATED'];

const oneOf = <T extends string>(
  options: readonly T[],
  value: string | null,
): T | undefined => options.find((option) => option === value);

const noContent = () => new HttpResponse(null, { status: 204 });

/**
 * The catalogue of add-ons: families and their versions, the lifecycle of a version,
 * what it grants, what it is sold for and which license families it fits. Each answers
 * as the API does, with the refusals it gives.
 */
const catalogueHandlers = (
  model: BillingAppModel,
  persist: PersistMswState,
) => {
  const { addons } = model;

  return [
    handleListAddonFamilies(
      withProblems(() => HttpResponse.json(addons.listFamilies())),
    ),
    handleGetAddonFamily(
      withProblems(({ params }) =>
        HttpResponse.json(addons.getFamily(params.familySlug)),
      ),
    ),
    handleUpdateAddonFamily(
      withProblems(async ({ params, request }) => {
        const family = addons.updateFamily(
          params.familySlug,
          await request.json(),
        );
        persist();
        return HttpResponse.json(family);
      }),
    ),
    handleListAddons(
      withProblems(({ request }) => {
        const query = new URL(request.url).searchParams;

        return HttpResponse.json(
          addons.listVersions({
            familySlug: query.get('familySlug') ?? undefined,
            lifecycleState: oneOf(
              LIFECYCLE_STATES,
              query.get('lifecycleState'),
            ),
          }),
        );
      }),
    ),
    handleCreateAddon(
      withProblems(async ({ request }) => {
        const created = addons.createVersion(await request.json());
        persist();
        return HttpResponse.json(created, { status: 201 });
      }),
    ),
    handleGetAddon(
      withProblems(({ params }) =>
        HttpResponse.json(addons.getVersion(params.addonSlug)),
      ),
    ),
    handleUpdateAddon(
      withProblems(async ({ params, request }) => {
        const updated = addons.updateVersion(
          params.addonSlug,
          await request.json(),
        );
        persist();
        return HttpResponse.json(updated);
      }),
    ),
    handleDeleteAddon(
      withProblems(({ params }) => {
        addons.deleteVersion(params.addonSlug);
        persist();
        return noContent();
      }),
    ),
    handlePublishAddon(
      withProblems(({ params }) => {
        const moved = addons.transition(params.addonSlug, 'publish');
        persist();
        return HttpResponse.json(moved);
      }),
    ),
    handleArchiveAddon(
      withProblems(({ params }) => {
        const moved = addons.transition(params.addonSlug, 'archive');
        persist();
        return HttpResponse.json(moved);
      }),
    ),
    handleUnarchiveAddon(
      withProblems(({ params }) => {
        const moved = addons.transition(params.addonSlug, 'unarchive');
        persist();
        return HttpResponse.json(moved);
      }),
    ),
  ];
};

/** What a version grants, what it is sold for and which license families it fits. */
const sellingHandlers = (model: BillingAppModel, persist: PersistMswState) => {
  const { addons } = model;

  return [
    handleListAddonEntitlements(
      withProblems(({ params }) =>
        HttpResponse.json(addons.listGrants(params.addonSlug)),
      ),
    ),
    handleAssignAddonEntitlement(
      withProblems(async ({ params, request }) => {
        const grant = addons.assignGrant(
          params.addonSlug,
          await request.json(),
        );
        persist();
        return HttpResponse.json(grant, { status: 201 });
      }),
    ),
    handleUpdateAddonEntitlement(
      withProblems(async ({ params, request }) => {
        const grant = addons.updateGrant(
          params.addonSlug,
          params.entitlementSlug,
          await request.json(),
        );
        persist();
        return HttpResponse.json(grant);
      }),
    ),
    handleUnassignAddonEntitlement(
      withProblems(({ params }) => {
        addons.unassignGrant(params.addonSlug, params.entitlementSlug);
        persist();
        return noContent();
      }),
    ),
    handleListAddonPrices(
      withProblems(({ params, request }) =>
        HttpResponse.json(
          addons.listPrices(
            params.addonSlug,
            oneOf(
              PRICE_STATUSES,
              new URL(request.url).searchParams.get('status'),
            ),
          ),
        ),
      ),
    ),
    handleCreateAddonPrice(
      withProblems(async ({ params, request }) => {
        const price = addons.createPrice(
          params.addonSlug,
          await request.json(),
        );
        persist();
        return HttpResponse.json(price, { status: 201 });
      }),
    ),
    handleDeprecateAddonPrice(
      withProblems(({ params }) => {
        const price = addons.deprecatePrice(params.addonSlug, params.priceId);
        persist();
        return HttpResponse.json(price);
      }),
    ),
    handleListAddonCompatibility(
      withProblems(({ params }) =>
        HttpResponse.json(addons.listCompatibility(params.addonSlug)),
      ),
    ),
    handleSetAddonCompatibility(
      withProblems(({ params }) => {
        addons.setCompatibility(params.addonSlug, params.familySlug);
        persist();
        return noContent();
      }),
    ),
    handleRemoveAddonCompatibility(
      withProblems(({ params }) => {
        addons.removeCompatibility(params.addonSlug, params.familySlug);
        persist();
        return noContent();
      }),
    ),
  ];
};

/**
 * The add-ons an instance holds: reading them, attaching one, changing its quantity
 * and taking it off. The entitlements apply at once, so each write tells the instances
 * (`effects`) that the effective values of this one changed.
 */
const instanceHandlers = (
  model: BillingAppModel,
  persist: PersistMswState,
  effects: AddonEffects | undefined,
) => {
  const { instanceAddons } = model;
  const applied = (instanceSlug: string) => {
    persist();
    effects?.syncEffectiveValues(instanceSlug);
  };

  return [
    handleListInstanceAddons(
      withProblems(({ params, request }) =>
        HttpResponse.json(
          instanceAddons.list(
            params.instanceSlug,
            new URL(request.url).searchParams.get('includeRemoved') === 'true',
          ),
        ),
      ),
    ),
    handleAttachInstanceAddon(
      withProblems(async ({ params, request }) => {
        const attached = instanceAddons.attach(
          params.instanceSlug,
          await request.json(),
        );
        applied(params.instanceSlug);
        return HttpResponse.json(attached, { status: 201 });
      }),
    ),
    handleSetInstanceAddonQuantity(
      withProblems(async ({ params, request }) => {
        const changed = instanceAddons.setQuantity(
          params.instanceSlug,
          params.addonSlug,
          await request.json(),
        );
        applied(params.instanceSlug);
        return HttpResponse.json(changed);
      }),
    ),
    handleDetachInstanceAddon(
      withProblems(({ params }) => {
        instanceAddons.detach(params.instanceSlug, params.addonSlug);
        applied(params.instanceSlug);
        return noContent();
      }),
    ),
  ];
};

/**
 * The API of the add-ons: the catalogue, and what the instances hold of it. They are
 * served with the rest of billing, since an add-on exists only where billing does and
 * a subscribe attaches them.
 */
export const billingAddonHandlers = (
  model: BillingAppModel,
  persist: PersistMswState = noop,
  effects?: AddonEffects,
) => [
  ...catalogueHandlers(model, persist),
  ...sellingHandlers(model, persist),
  ...instanceHandlers(model, persist, effects),
];
