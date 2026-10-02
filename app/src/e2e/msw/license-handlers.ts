import type { DefaultBodyType, PathParams } from 'msw';
import { HttpResponse, type HttpResponseResolver, http } from 'msw/http';
import type { LicenseWritable } from '@/api-client';
import {
  type LicenseAppModel,
  LicenseProblem,
  type LicenseTransition,
} from '../../../e2e/app/_support/model/license-app-model';
import {
  asFallback,
  decodeLastPathSegment,
  getPathSegments,
  messageForError,
  parseRequestJson,
  statusForError,
} from './handler-factory';

type PersistMswState = () => void;

const noop = () => {};

// The Core API refuses a write with a problem document; rendering it the same
// way lets the console show the API's own reason, as against the real backend.
const problemJson = (status: number, detail: string, code?: string) =>
  HttpResponse.json(
    { type: 'about:blank', title: 'Error', status, detail, code },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );

const withProblems =
  (
    handler: HttpResponseResolver<PathParams, DefaultBodyType>,
  ): HttpResponseResolver<PathParams, DefaultBodyType> =>
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

const transitionPath = /\/api\/licenses\/[^/]+\/(publish|archive|unarchive)$/;

/**
 * The license pages: the catalogue and its families, one version, the version
 * form's create, set-as-default, and the three lifecycle transitions. The
 * entitlement catalogue and the instance list the pages also read are served
 * here, so the slot works on its own.
 */
export const licenseHandlers = (
  model: LicenseAppModel,
  persist: PersistMswState = noop,
) => [
  http.get(/\/api\/licenses$/, () =>
    HttpResponse.json({ hasMore: false, items: model.listLicenses() }),
  ),
  http.get(/\/api\/license-families$/, () =>
    HttpResponse.json({ hasMore: false, items: model.listLicenseFamilies() }),
  ),
  http.post(
    /\/api\/licenses$/,
    withProblems(async ({ request }) => {
      const license = model.createLicense(
        await parseRequestJson<LicenseWritable>(request),
      );
      persist();
      return HttpResponse.json(license, { status: 201 });
    }),
  ),
  http.post(
    transitionPath,
    withProblems(({ request }) => {
      const [, , slug = '', transition] = getPathSegments(request.url);
      const license = model.transition(
        decodeURIComponent(slug),
        transition as LicenseTransition,
      );
      persist();
      return HttpResponse.json(license);
    }),
  ),
  asFallback(
    http.get(/\/api\/licenses\/[^/]+\/entitlements$/, () =>
      HttpResponse.json({ hasMore: false, items: [] }),
    ),
  ),
  http.get(
    /\/api\/licenses\/[^/]+$/,
    withProblems(({ request }) =>
      HttpResponse.json(model.getLicense(decodeLastPathSegment(request.url))),
    ),
  ),
  http.put(
    /\/api\/licenses\/[^/]+$/,
    withProblems(async ({ request }) => {
      model.updateLicense(
        decodeLastPathSegment(request.url),
        await parseRequestJson<LicenseWritable>(request),
      );
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  // Read by the version form and the license pages; owned by the entitlements
  // and instances slots when those are installed.
  asFallback(
    http.get(/\/api\/entitlements$/, () =>
      HttpResponse.json({ hasMore: false, items: model.listEntitlements() }),
    ),
  ),
  asFallback(
    http.get(/\/api\/instances$/, () =>
      HttpResponse.json({ hasMore: false, items: [] }),
    ),
  ),
];
