import type { Meta, StoryObj } from '@storybook/react-vite';
import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { UsageReport } from '@/api-client';
import { billingCapabilitiesQueryOptions } from '@/domains/billing';
import { ApiError } from '@/lib/errors';
import {
  billingCapabilitiesProfiles,
  buildUsageReport,
} from '@/test-fixtures/storybook-billing-fixtures';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { UsageHistoryReports } from '../instance-detail/tabs/entitlements/usage-history/usage-history-reports';

const meta = {
  title: 'Features/Instances/UsageHistory',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const WINDOW = {
  windowEnd: '2027-04-01T00:00:00.000Z',
  windowStart: '2027-03-01T00:00:00.000Z',
};

const report = (seq: number, limit: string): UsageReport =>
  buildUsageReport({
    delta: '100',
    limitValue: limit,
    overageDelta: '0',
    reportSeq: seq,
    reportedAt: `2027-03-${String(seq).padStart(2, '0')}T09:00:00.000Z`,
    reportedValue: '100',
    valueAfter: String(seq * 100),
    valueBefore: String((seq - 1) * 100),
    ...WINDOW,
  });

const REPORTS = [report(1, '100000'), report(2, '100000'), report(3, '150000')];

const fetchNextPage = fn();

/** What the hook of the drawer reads for a period, in the state a story shows. */
const history = (
  overrides: Record<string, unknown> = {},
  query: Record<string, unknown> = {},
) =>
  ({
    limitChanges: new Set([3]),
    outsideRetention: null,
    query: {
      data: { pages: [] },
      error: null,
      fetchNextPage,
      hasNextPage: false,
      isError: false,
      isFetchNextPageError: false,
      isFetchingNextPage: false,
      isPending: false,
      refetch: fn(),
      ...query,
    } as unknown as UseInfiniteQueryResult,
    reports: REPORTS,
    ...overrides,
  }) as unknown as Parameters<typeof UsageHistoryReports>[0]['history'];

const onStartFrom = fn();

const reports = (state: ReturnType<typeof history>) => (
  <StorybookRouter
    seed={(queryClient) =>
      queryClient.setQueryData(
        billingCapabilitiesQueryOptions.queryKey,
        billingCapabilitiesProfiles.stack(),
      )
    }
  >
    <UsageHistoryReports history={state} onStartFrom={onStartFrom} />
  </StorybookRouter>
);

// The reports of the period in the order they were accepted, how many were read
// and not how many there are, the way to read more, and the report where the limit
// moved marked.
export const Reports: Story = {
  render: () => reports(history({}, { hasNextPage: true })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByTestId('usage-history-count')).toHaveTextContent(
      '3 reports shown',
    );
    await expect(canvas.getAllByText('Limit changed')).toHaveLength(1);
    await userEvent.click(canvas.getByRole('button', { name: 'Load more reports' }));
    await expect(fetchNextPage).toHaveBeenCalledTimes(1);
  },
};

export const Loading: Story = {
  render: () => reports(history({ reports: [] }, { isPending: true })),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole('status', {
        name: 'Loading the usage history',
      }),
    ).toHaveAttribute('aria-busy', 'true');
  },
};

export const NoReportInThePeriod: Story = {
  render: () => reports(history({ limitChanges: new Set(), reports: [] })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('No usage reports')).toBeVisible();
    await expect(canvas.getByText('No report was accepted during this period.')).toBeVisible();
  },
};

export const Refused: Story = {
  render: () =>
    reports(
      history(
        { reports: [] },
        {
          data: undefined,
          error: new ApiError({
            data: {
              code: 'ListUsageReports.Unavailable',
              detail: 'the usage journal is not available right now',
              status: 503,
            },
            response: new Response(null, { status: 503 }),
            status: 503,
          }),
          isError: true,
        },
      ),
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByText('the usage journal is not available right now'),
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};

// A period that reaches before what the organization keeps is not a failure: usage
// is purged on purpose. It says how long usage is kept, where the kept usage
// begins, and offers to start there.
export const BeyondTheRetention: Story = {
  render: () =>
    reports(
      history({
        outsideRetention: {
          detail: 'the usage history is kept from 2025-04-07T12:00:00.000Z',
          errors: [],
          kind: 'outside-retention',
          retentionStart: '2025-04-07T12:00:00.000Z',
        },
        reports: [],
      }),
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByText('Beyond your retention of 18 months'),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole('button', { name: /^Show from Apr 8, 2025/ }),
    );
    await expect(onStartFrom).toHaveBeenCalledWith('2025-04-08T00:00:00.000Z');
  },
};
