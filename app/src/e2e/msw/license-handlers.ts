import type { DefaultBodyType, PathParams } from 'msw';
import { HttpResponse, type HttpResponseResolver } from 'msw/http';
import {
  handleArchiveLicense,
  handleAssociateEntitlementWithLicense,
  handleCreateLicense,
  handleCreateLicensePrice,
  handleDeleteLicense,
  handleDeleteLicenseEntitlement,
  handleDeprecateLicensePrice,
  handleGetInstances,
  handleGetLicense,
  handleGetLicenseEntitlements,
  handleGetLicensePrice,
  handleGetLicenses,
  handleListEntitlements,
  handleListLicenseFamilies,
  handleListLicensePrices,
  handlePreviewLicenseInvoice,
  handlePublishLicense,
  handleUnarchiveLicense,
  handleUpdateLicense,
  handleUpdateLicenseEntitlement,
  handleUpdateLicenseFamily,
  handleUpdateLicensePrice,
} from '@/api-client/msw.gen';
import type { Price } from '@/api-client';
import {
  type LicenseAppModel,
  LicenseProblem,
  type LicenseTransition,
} from '../../../e2e/app/_support/model/license-app-model';
import {
  asFallback,
  messageForError,
  problemJson,
  statusForError,
} from './handler-factory';
import { noop, type PersistMswState } from './persistence';

const withProblems =
  <Params extends PathParams<keyof Params>, Body extends DefaultBodyType>(
    handler: HttpResponseResolver<Params, Body>,
  ): HttpResponseResolver<Params, Body> =>
  async (info) => {
    try {
      return await handler(info);
    } catch (error) {
      if (error instanceof LicenseProblem) {
        return problemJson(error.httpStatus, error.message, error.code, {
          errors: error.errors,
        });
      }
      return problemJson(
        statusForError(error),
        messageForError(error, 'Unexpected license mock error'),
      );
    }
  };

const PRICE_STATUSES: readonly Price['status'][] = ['ACTIVE', 'DEPRECATED'];
const BILLING_MODELS: readonly Price['billingModel'][] = [
  'FLAT_FEE',
  'USAGE_BASED',
  'OVERAGE',
];

const oneOf = <T extends string>(
  options: readonly T[],
  value: string | null,
): T | undefined => options.find((option) => option === value);

/**
 * What a version sells: its grants (`/entitlements`), its prices and the invoice
 * preview they make up. They answer as the API does, with the refusals of a
 * version that is billed or published.
 */
const sellingHandlers = (model: LicenseAppModel, persist: PersistMswState) => [
  handleGetLicenseEntitlements(
    withProblems(({ params }) =>
      HttpResponse.json({
        hasMore: false,
        items: model.listGrants(params.licenseSlug),
      }),
    ),
  ),
  handleAssociateEntitlementWithLicense(
    withProblems(async ({ params, request }) => {
      model.associateGrant(params.licenseSlug, await request.json());
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  handleUpdateLicenseEntitlement(
    withProblems(async ({ params, request }) => {
      model.updateGrant(
        params.licenseSlug,
        params.entitlementSlug,
        await request.json(),
      );
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  handleDeleteLicenseEntitlement(
    withProblems(({ params }) => {
      model.deleteGrant(params.licenseSlug, params.entitlementSlug);
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  handleListLicensePrices(
    withProblems(({ params, request }) => {
      const query = new URL(request.url).searchParams;

      return HttpResponse.json(
        model.listPrices(params.licenseSlug, {
          billingModel: oneOf(BILLING_MODELS, query.get('billingModel')),
          status: oneOf(PRICE_STATUSES, query.get('status')),
        }),
      );
    }),
  ),
  handleGetLicensePrice(
    withProblems(({ params }) =>
      HttpResponse.json(model.getPrice(params.licenseSlug, params.priceId)),
    ),
  ),
  handleCreateLicensePrice(
    withProblems(async ({ params, request }) => {
      const price = model.createPrice(params.licenseSlug, await request.json());
      persist();
      return HttpResponse.json(price, { status: 201 });
    }),
  ),
  handleUpdateLicensePrice(
    withProblems(async ({ params, request }) => {
      const price = model.updatePrice(
        params.licenseSlug,
        params.priceId,
        await request.json(),
      );
      persist();
      return HttpResponse.json(price);
    }),
  ),
  handleDeprecateLicensePrice(
    withProblems(({ params }) => {
      const price = model.deprecatePrice(params.licenseSlug, params.priceId);
      persist();
      return HttpResponse.json(price);
    }),
  ),
  handlePreviewLicenseInvoice(
    withProblems(async ({ params, request }) =>
      HttpResponse.json(
        model.previewInvoice(params.licenseSlug, await request.json()),
      ),
    ),
  ),
];

/**
 * The license pages: the catalogue and its families, one version, the version
 * form's create, set-as-default, the three lifecycle transitions and the
 * deletion of a draft; what a version sells (its grants and its prices) and the
 * invoice preview of a version. The entitlement catalogue and the instance list
 * the pages also read are served here, so the slot works on its own.
 */
export const licenseHandlers = (
  model: LicenseAppModel,
  persist: PersistMswState = noop,
) => {
  const transition = (op: LicenseTransition) =>
    withProblems<{ licenseSlug: string }, never>(({ params }) => {
      const license = model.transition(params.licenseSlug, op);
      persist();
      return HttpResponse.json(license);
    });

  return [
    handleGetLicenses(() =>
      HttpResponse.json({ hasMore: false, items: model.listLicenses() }),
    ),
    handleListLicenseFamilies(() =>
      HttpResponse.json({
        hasMore: false,
        items: model.listLicenseFamilies(),
      }),
    ),
    handleUpdateLicenseFamily(
      withProblems(async ({ params, request }) => {
        const family = model.updateLicenseFamily(
          params.familySlug,
          await request.json(),
        );
        persist();
        return HttpResponse.json(family);
      }),
    ),
    handleCreateLicense(
      withProblems(async ({ request }) => {
        const license = model.createLicense(await request.json());
        persist();
        return HttpResponse.json(license, { status: 201 });
      }),
    ),
    handleDeleteLicense(
      withProblems(({ params }) => {
        model.deleteLicense(params.licenseSlug);
        persist();
        return new HttpResponse(null, { status: 204 });
      }),
    ),
    handlePublishLicense(transition('publish')),
    handleArchiveLicense(transition('archive')),
    handleUnarchiveLicense(transition('unarchive')),
    ...sellingHandlers(model, persist),
    handleGetLicense(
      withProblems(({ params }) =>
        HttpResponse.json(model.getLicense(params.licenseSlug)),
      ),
    ),
    handleUpdateLicense(
      withProblems(async ({ params, request }) => {
        model.updateLicense(params.licenseSlug, await request.json());
        persist();
        return new HttpResponse(null, { status: 204 });
      }),
    ),
    // Read by the version form and the license pages; owned by the
    // entitlements and instances slots when those are installed.
    asFallback(
      handleListEntitlements(() =>
        HttpResponse.json({ hasMore: false, items: model.listEntitlements() }),
      ),
    ),
    asFallback(handleGetInstances({ body: { hasMore: false, items: [] } })),
  ];
};
