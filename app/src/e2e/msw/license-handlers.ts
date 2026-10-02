import type { DefaultBodyType, PathParams } from 'msw';
import { HttpResponse, type HttpResponseResolver } from 'msw/http';
import {
  handleArchiveLicense,
  handleCreateLicense,
  handleGetInstances,
  handleGetLicense,
  handleGetLicenseEntitlements,
  handleGetLicenses,
  handleListEntitlements,
  handleListLicenseFamilies,
  handlePublishLicense,
  handleUnarchiveLicense,
  handleUpdateLicense,
} from '@/api-client/msw.gen';
import {
  type LicenseAppModel,
  LicenseProblem,
  type LicenseTransition,
} from '../../../e2e/app/_support/model/license-app-model';
import { asFallback, messageForError, statusForError } from './handler-factory';
import { noop, type PersistMswState } from './persistence';

// The Core API refuses a write with a problem document; rendering it the same
// way lets the console show the API's own reason, as against the real backend.
const problemJson = (status: number, detail: string, code?: string) =>
  HttpResponse.json(
    { type: 'about:blank', title: 'Error', status, detail, code },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );

const withProblems =
  <Params extends PathParams<keyof Params>, Body extends DefaultBodyType>(
    handler: HttpResponseResolver<Params, Body>,
  ): HttpResponseResolver<Params, Body> =>
  async (info) => {
    try {
      return await handler(info);
    } catch (error) {
      if (error instanceof LicenseProblem) {
        return problemJson(error.httpStatus, error.message, error.code);
      }
      return problemJson(
        statusForError(error),
        messageForError(error, 'Unexpected license mock error'),
      );
    }
  };

/**
 * The license pages: the catalogue and its families, one version, the version
 * form's create, set-as-default, and the three lifecycle transitions. The
 * entitlement catalogue and the instance list the pages also read are served
 * here, so the slot works on its own.
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
    handleCreateLicense(
      withProblems(async ({ request }) => {
        const license = model.createLicense(await request.json());
        persist();
        return HttpResponse.json(license, { status: 201 });
      }),
    ),
    handlePublishLicense(transition('publish')),
    handleArchiveLicense(transition('archive')),
    handleUnarchiveLicense(transition('unarchive')),
    asFallback(
      handleGetLicenseEntitlements({ body: { hasMore: false, items: [] } }),
    ),
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
