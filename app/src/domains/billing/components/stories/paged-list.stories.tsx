import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ApiError } from '@/lib/errors';
import { dataModelIcons } from '@/lib/data-model-icons';
import {
  ListEmptyState,
  LoadMoreFooter,
  PagedListSkeleton,
} from '../paged-list';

const meta = {
  title: 'Domains/Billing/PagedList',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// What a feed the server pages shows while its first page is on the way.
export const Skeleton: Story = {
  render: () => <PagedListSkeleton label="Loading invoices" rows={5} />,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole('status', {
        name: 'Loading invoices',
      }),
    ).toHaveAttribute('aria-busy', 'true');
  },
};

const idle = {
  error: null,
  fetchNextPage: fn(),
  hasNextPage: false,
  isFetchNextPageError: false,
  isFetchingNextPage: false,
};

// The way to read more, centred under the rows as the notifications feed draws it.
export const FootWithMore: Story = {
  render: () => (
    <LoadMoreFooter
      loadMoreLabel="Load more"
      query={{ ...idle, hasNextPage: true }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByRole('button', { name: 'Load more' }));
    await expect(idle.fetchNextPage).toHaveBeenCalledTimes(1);
  },
};

export const FootReadingTheNextPage: Story = {
  render: () => (
    <LoadMoreFooter
      loadMoreLabel="Load more"
      query={{ ...idle, hasNextPage: true, isFetchingNextPage: true }}
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole('button', { name: 'Load more' }),
    ).toBeDisabled();
  },
};

// The rows already read stay, and the refusal of the next page is shown under them.
export const FootWhenTheNextPageFailed: Story = {
  render: () => (
    <LoadMoreFooter
      loadMoreLabel="Load more"
      query={{
        ...idle,
        error: new ApiError({
          data: { detail: 'the invoice store is busy', status: 503 },
          status: 503,
        }),
        hasNextPage: true,
        isFetchNextPageError: true,
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('the invoice store is busy'),
    ).toBeVisible();
  },
};

export const Empty: Story = {
  render: () => (
    <ListEmptyState
      description="Invoices appear here once a subscription reaches a boundary."
      icon={dataModelIcons.invoice}
      testId="empty"
      title="No invoices yet"
    >
      <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
        kaiten billing handoff claim
      </code>
    </ListEmptyState>
  ),
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('No invoices yet')).toBeVisible();
  },
};
