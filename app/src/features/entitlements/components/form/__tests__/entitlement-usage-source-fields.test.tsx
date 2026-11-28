import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Entitlement } from '@/api-client';
import { handleListEntitlements } from '@/api-client/msw.gen';
import { setAiAccessInputsForTest } from '@/test-fixtures/ai-access';
import {
  createTestClient,
  pageOf,
  renderWithClient,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { useAppForm } from '@/hooks/form';
import {
  type EntitlementFormValues,
  entitlementFormSchema,
  initialEntitlementFormValues,
} from '../entitlement-form.shared';
import { EntitlementSourcesFields } from '../entitlement-sources-fields';
import { EntitlementUsageSourceField } from '../entitlement-usage-source-field';

// Where the usage of a NUMBER entitlement comes from, and, for a combined one, the sources it sums:
// one line each, with the entitlement and its weight. A line offers what can be summed with the
// others, and none that another line names.

useBillingTexts();

const definition = (overrides: Partial<Entitlement> & { slug: string }) =>
  ({
    aggregationMethod: 'SUM',
    createdAt: '2026-03-01T09:00:00.000Z',
    id: `entitlement-${overrides.slug}`,
    name: overrides.slug,
    type: 'NUMBER',
    updatedAt: '2026-03-01T09:00:00.000Z',
    ...overrides,
  }) as Entitlement;

const monthly = { resetAnchor: 'CALENDAR', resetPeriod: 'MONTH' } as const;
const catalogue = [
  definition({ name: 'AI Credits', slug: 'ai-credits' }),
  definition({ name: 'Firecrawl Credits', slug: 'firecrawl-credits' }),
  definition({ name: 'Monthly Requests', slug: 'monthly-requests', ...monthly }),
  definition({ aggregationMethod: 'COUNT', name: 'Monthly Exports', slug: 'monthly-exports', ...monthly }),
  definition({ aggregationMethod: 'AVERAGE', name: 'Latency', slug: 'latency' }),
  definition({ name: 'SSO', slug: 'sso', type: 'BOOLEAN' }),
  definition({
    name: 'Total',
    slug: 'total',
    sources: [{ entitlementSlug: 'ai-credits', weight: '1' }],
    usageSource: 'COMBINED_USAGE',
  }),
];

let current: { values: () => EntitlementFormValues } | undefined;

function Harness({
  entitlement,
  initial = {},
}: {
  entitlement?: Entitlement;
  initial?: Partial<EntitlementFormValues>;
}) {
  const form = useAppForm({
    defaultValues: { ...initialEntitlementFormValues, ...initial },
    validators: { onChange: entitlementFormSchema },
  });
  current = { values: () => form.state.values };

  return (
    <form.AppForm>
      <EntitlementUsageSourceField entitlement={entitlement} form={form} />
      <form.Subscribe selector={(state) => state.values.usageSource}>
        {(usageSource) =>
          usageSource === 'COMBINED_USAGE' ? (
            <EntitlementSourcesFields entitlement={entitlement} form={form} />
          ) : null
        }
      </form.Subscribe>
    </form.AppForm>
  );
}

function render(props: Parameters<typeof Harness>[0] = {}) {
  server.use(handleListEntitlements(() => HttpResponse.json(pageOf(catalogue))));
  current = undefined;
  const client = createTestClient();
  setAiAccessInputsForTest(client, { capability: false, flag: false });

  return renderWithClient(<Harness {...props} />, client);
}

const lines = () => screen.queryAllByRole('group', { name: /^Source \d+$/ });
const line = (position: number) =>
  screen.getByRole('group', { name: `Source ${position}` });
const offered = async (position: number) => {
  await userEvent.click(
    within(line(position)).getByRole('button', { name: /^Entitlement/ }),
  );
  const list = await screen.findByRole('listbox', { name: 'Search entitlements' });
  const names = within(list)
    .getAllByRole('option')
    .map((option) => option.textContent?.trim());
  await userEvent.keyboard('{Escape}');

  return names;
};
const choose = async (position: number, name: string) => {
  await userEvent.click(
    within(line(position)).getByRole('button', { name: /^Entitlement/ }),
  );
  await userEvent.click(await screen.findByRole('option', { name }));
};

describe('the usage source of a number', () => {
  it('is calculated to begin with, and asks for no source', async () => {
    render();

    expect(
      await screen.findByRole('combobox', { name: /^Usage source/ }),
    ).toHaveTextContent('Calculated');
    expect(lines()).toHaveLength(0);
  });

  it('starts the sources of a combined entitlement with two blank lines, each with a weight of 1', async () => {
    render();

    await userEvent.click(await screen.findByRole('combobox', { name: /^Usage source/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Combined' }));

    expect(await screen.findAllByRole('group', { name: /^Source \d+$/ })).toHaveLength(2);
    expect(within(line(1)).getByLabelText('Weight')).toHaveValue('1');
    expect(current?.values().sources).toEqual([
      { entitlementSlug: '', weight: '1' },
      { entitlementSlug: '', weight: '1' },
    ]);
  });

  it('is fixed once the entitlement exists', async () => {
    render({ entitlement: catalogue[6], initial: { usageSource: 'COMBINED_USAGE' } });

    const select = await screen.findByRole('combobox', { name: /^Usage source/ });

    expect(select).toBeDisabled();
    expect(select).toHaveTextContent('Combined');
  });
});

describe('the lines of the sources', () => {
  it('offer what can be summed, which is not a flag, an average or a combined entitlement', async () => {
    render({ initial: { sources: [{ entitlementSlug: '', weight: '1' }, { entitlementSlug: '', weight: '1' }], usageSource: 'COMBINED_USAGE' } });
    await screen.findByRole('group', { name: 'Source 1' });

    expect(await offered(1)).toEqual([
      'AI Credits',
      'Firecrawl Credits',
      'Monthly Requests',
      'Monthly Exports',
    ]);
  });

  it('keep to the window of the others, and name each entitlement once', async () => {
    render({ initial: { sources: [{ entitlementSlug: '', weight: '1' }, { entitlementSlug: '', weight: '1' }], usageSource: 'COMBINED_USAGE' } });
    await screen.findByRole('group', { name: 'Source 1' });
    await waitFor(() => expect(screen.queryByText('Choose the sources to see the window.')).toBeInTheDocument());

    await choose(1, 'Monthly Requests');

    expect(await offered(2)).toEqual(['Monthly Exports']);
    // The line that holds an entitlement keeps it on offer, and no other line's.
    await choose(2, 'Monthly Exports');
    expect(await offered(1)).toEqual(['Monthly Requests']);
  });

  it('say the window the sources share, which cannot be chosen', async () => {
    render({ initial: { sources: [{ entitlementSlug: '', weight: '1' }, { entitlementSlug: '', weight: '1' }], usageSource: 'COMBINED_USAGE' } });
    await screen.findByRole('group', { name: 'Source 1' });

    await choose(1, 'Firecrawl Credits');
    expect(screen.getByTestId('combined-window')).toHaveTextContent('Never (lifetime)');

    await choose(1, 'Monthly Requests');
    expect(screen.getByTestId('combined-window')).toHaveTextContent('Every month');
    expect(screen.getByTestId('combined-window')).toHaveTextContent('Calendar');
  });

  it('can be added and taken away, a weight at a time', async () => {
    render({
      initial: {
        sources: [
          { entitlementSlug: 'ai-credits', weight: '0.6' },
          { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
        ],
        usageSource: 'COMBINED_USAGE',
      },
    });
    await screen.findByRole('group', { name: 'Source 2' });

    await userEvent.click(screen.getByRole('button', { name: 'Add a source' }));
    expect(lines()).toHaveLength(3);
    expect(within(line(3)).getByLabelText('Weight')).toHaveValue('1');

    await userEvent.click(screen.getByRole('button', { name: 'Remove source 1' }));
    expect(lines()).toHaveLength(2);
    expect(current?.values().sources.map(({ entitlementSlug }) => entitlementSlug)).toEqual([
      'firecrawl-credits',
      '',
    ]);
    expect(within(line(1)).getByLabelText('Weight')).toHaveValue('0.4');
  });
});

describe('the notice of what saving does to the present', () => {
  const stored = {
    ...catalogue[6],
    sources: [
      { entitlementSlug: 'ai-credits', weight: '0.6' },
      { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
    ],
  } as Entitlement;
  const initial: Partial<EntitlementFormValues> = {
    sources: [
      { entitlementSlug: 'ai-credits', weight: '0.6' },
      { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
    ],
    usageSource: 'COMBINED_USAGE',
  };

  it('comes as soon as a weight differs from the one that is stored, and goes when it is the same again', async () => {
    render({ entitlement: stored, initial });
    await screen.findByRole('group', { name: 'Source 1' });
    expect(screen.queryByTestId('combined-revalue-hint')).not.toBeInTheDocument();

    const weight = within(line(1)).getByLabelText('Weight');
    await userEvent.clear(weight);
    await userEvent.type(weight, '0.5');
    expect(await screen.findByTestId('combined-revalue-hint')).toHaveTextContent(
      'Saving re-values the present',
    );

    // The same number written another way is not a change.
    await userEvent.clear(weight);
    await userEvent.type(weight, '0.60');
    await waitFor(() =>
      expect(screen.queryByTestId('combined-revalue-hint')).not.toBeInTheDocument(),
    );
  });

  it('comes when a source is taken away, and never says anything on the creation of one', async () => {
    render({ entitlement: stored, initial });
    await screen.findByRole('group', { name: 'Source 1' });

    await userEvent.click(screen.getByRole('button', { name: 'Remove source 2' }));
    expect(await screen.findByTestId('combined-revalue-hint')).toBeInTheDocument();
  });

  it('is not said while the entitlement is made: there is no present to re-value', async () => {
    render({ initial });
    await screen.findByRole('group', { name: 'Source 1' });
    await userEvent.click(screen.getByRole('button', { name: 'Remove source 2' }));

    expect(screen.queryByTestId('combined-revalue-hint')).not.toBeInTheDocument();
  });
});
