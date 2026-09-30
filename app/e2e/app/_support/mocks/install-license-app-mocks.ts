import type { Page, Route } from '@playwright/test';
import type { LicenseWritable } from '@/api-client';
import {
  type LicenseAppModel,
  LicenseProblem,
} from '../model/license-app-model';
import { tryInstallMswMocks } from './install-app-mocks';
import {
  fulfillJson,
  getPathSegments,
  messageForError,
  parseJsonBody,
  statusForError,
} from './rest-route-helpers';

const transitions = new Set(['publish', 'archive', 'unarchive'] as const);
type Transition = typeof transitions extends Set<infer T> ? T : never;

const isTransition = (value: string | undefined): value is Transition =>
  transitions.has(value as Transition);

export async function installLicenseAppMocks(
  page: Page,
  model: LicenseAppModel,
) {
  if (await tryInstallMswMocks(page, 'licenses', model)) {
    return;
  }

  await installLicensePageRouteMocks(page, model);
}

// Same problem document as the MSW handlers, so a spec reads the API's reason
// in either mode.
async function fulfillProblem(route: Route, error: unknown) {
  const status =
    error instanceof LicenseProblem ? error.httpStatus : statusForError(error);
  await route.fulfill({
    status,
    contentType: 'application/problem+json',
    body: JSON.stringify({
      type: 'about:blank',
      title: 'Error',
      status,
      detail: messageForError(error, 'Unexpected license mock error'),
      code: error instanceof LicenseProblem ? error.code : undefined,
    }),
  });
}

async function routeLicenses(route: Route, model: LicenseAppModel) {
  const method = route.request().method();
  const [, , encodedSlug, sub] = getPathSegments(route.request().url());
  const slug =
    encodedSlug === undefined ? undefined : decodeURIComponent(encodedSlug);

  if (slug === undefined && method === 'GET') {
    return fulfillJson(route, 200, {
      hasMore: false,
      items: model.listLicenses(),
    });
  }
  if (slug === undefined && method === 'POST') {
    return fulfillJson(
      route,
      201,
      model.createLicense(parseJsonBody<LicenseWritable>(route)),
    );
  }
  if (slug !== undefined && sub === undefined && method === 'GET') {
    return fulfillJson(route, 200, model.getLicense(slug));
  }
  if (slug !== undefined && sub === undefined && method === 'PUT') {
    model.updateLicense(slug, parseJsonBody<LicenseWritable>(route));
    return route.fulfill({ status: 204 });
  }
  if (slug !== undefined && sub === 'entitlements' && method === 'GET') {
    return fulfillJson(route, 200, { hasMore: false, items: [] });
  }
  if (slug !== undefined && isTransition(sub) && method === 'POST') {
    return fulfillJson(route, 200, model.transition(slug, sub));
  }
  return route.fulfill({ status: 405 });
}

async function installLicensePageRouteMocks(
  page: Page,
  model: LicenseAppModel,
) {
  await page.route('**/api/licenses**', async (route) => {
    try {
      await routeLicenses(route, model);
    } catch (error) {
      await fulfillProblem(route, error);
    }
  });

  await page.route(/\/api\/license-families(\?.*)?$/, (route) =>
    fulfillJson(route, 200, {
      hasMore: false,
      items: model.listLicenseFamilies(),
    }),
  );

  await page.route(/\/api\/entitlements(\?.*)?$/, (route) =>
    fulfillJson(route, 200, {
      hasMore: false,
      items: model.listEntitlements(),
    }),
  );

  await page.route(/\/api\/instances(\?.*)?$/, (route) =>
    fulfillJson(route, 200, { hasMore: false, items: [] }),
  );
}
