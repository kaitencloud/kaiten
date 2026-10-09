import { QueryClient } from '@tanstack/react-query';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Instance, InstanceAddon } from '@/api-client';
import {
  handleGetInstances,
  handleListInstanceAddons,
} from '@/api-client/msw.gen';
// For its side effect: the REST client then throws an `ApiError`.
import '@/lib/api/bootstrap';
import { pageOf } from '@/test-fixtures/billing-test-support';
import {
  buildAddon,
  buildInstanceAddon,
} from '../../../../../e2e/app/_support/fixtures';
import { addonHoldersQueryOptions } from '../addon-holders';

const SEATS = buildAddon({ familySlug: 'extra-seats', name: 'Extra seats', slug: 'extra-seats' });
const STORAGE = buildAddon({ familySlug: 'extra-storage', name: 'Extra storage', slug: 'extra-storage' });

const instance = (slug: string, name = slug): Instance => ({ id: `id-${slug}`, name, slug }) as Instance;
const held = (addon: typeof SEATS, quantity: number, removed = false): InstanceAddon =>
  buildInstanceAddon({
    addon,
    id: `attachment-${addon.slug}-${quantity}`,
    quantity,
    removedAt: removed ? '2027-01-01T00:00:00.000Z' : undefined,
  });

const serve = (
  instances: Instance[],
  addonsOf: Record<string, InstanceAddon[] | 'gone' | 'broken'>,
) =>
  server.use(
    handleGetInstances({ body: pageOf(instances) }),
    handleListInstanceAddons(({ params }) => {
      const found = addonsOf[String(params.instanceSlug)] ?? [];
      if (found === 'gone') {
        return HttpResponse.json(
          { code: 'ListInstanceAddons.InstanceNotFound', detail: 'gone', status: 404 },
          { status: 404 },
        );
      }
      if (found === 'broken') {
        return HttpResponse.json({ detail: 'the add-ons are unavailable', status: 503 }, { status: 503 });
      }

      return HttpResponse.json(found);
    }),
  );

const holdersOf = (addonSlug: string) =>
  new QueryClient().fetchQuery(addonHoldersQueryOptions(addonSlug));

describe('who holds a version of an add-on', () => {
  it('is found where it is, in the add-ons of the instances, with how many units each holds, most first', async () => {
    serve([instance('acme', 'Acme'), instance('globex', 'Globex'), instance('initech', 'Initech')], {
      acme: [held(SEATS, 3)],
      globex: [held(SEATS, 8), held(STORAGE, 2)],
      initech: [held(STORAGE, 5)],
    });

    expect(await holdersOf('extra-seats')).toEqual([
      { instanceName: 'Globex', instanceSlug: 'globex', quantity: 8 },
      { instanceName: 'Acme', instanceSlug: 'acme', quantity: 3 },
    ]);
  });

  it('breaks a tie by the name of the instance', async () => {
    serve([instance('b', 'Beta'), instance('a', 'Alpha')], {
      a: [held(SEATS, 4)],
      b: [held(SEATS, 4)],
    });

    expect((await holdersOf('extra-seats')).map(({ instanceName }) => instanceName)).toEqual([
      'Alpha',
      'Beta',
    ]);
  });

  it('leaves out an attachment that was removed: it holds nothing now', async () => {
    serve([instance('acme')], { acme: [held(SEATS, 8, true)] });

    expect(await holdersOf('extra-seats')).toEqual([]);
  });

  it('takes an instance that went in the meantime for no match and no error', async () => {
    serve([instance('acme'), instance('ghost')], { acme: [held(SEATS, 3)], ghost: 'gone' });

    expect(await holdersOf('extra-seats')).toEqual([
      { instanceName: 'acme', instanceSlug: 'acme', quantity: 3 },
    ]);
  });

  it('fails when an instance cannot be read, since a look that missed one is no answer', async () => {
    serve([instance('acme'), instance('globex')], { acme: [held(SEATS, 3)], globex: 'broken' });

    await expect(holdersOf('extra-seats')).rejects.toMatchObject({ status: 503 });
  });

  it('is nobody when there is no instance', async () => {
    serve([], {});

    expect(await holdersOf('extra-seats')).toEqual([]);
  });

  it('reads the instances of every page, not the first only', async () => {
    const page = (cursor: string | null) =>
      cursor === 'next'
        ? { hasMore: false, items: [instance('second')], nextCursor: null }
        : { hasMore: true, items: [instance('first')], nextCursor: 'next' };
    server.use(
      handleGetInstances(({ request }) =>
        HttpResponse.json(page(new URL(request.url).searchParams.get('cursor'))),
      ),
      handleListInstanceAddons(({ params }) =>
        HttpResponse.json(params.instanceSlug === 'second' ? [held(SEATS, 9)] : []),
      ),
    );

    expect(await holdersOf('extra-seats')).toEqual([
      { instanceName: 'second', instanceSlug: 'second', quantity: 9 },
    ]);
  });

  it('is a look made when it is asked for, never reused: what holds a version changes under the person', () => {
    const options = addonHoldersQueryOptions('extra-seats');

    expect(options.staleTime).toBe(0);
    expect(options.retry).toBe(false);
  });
});
