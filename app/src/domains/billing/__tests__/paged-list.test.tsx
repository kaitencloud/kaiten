import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { dataModelIcons } from '@/lib/data-model-icons';
import { ApiError } from '@/lib/errors';
import {
  ListEmptyState,
  LoadMoreFooter,
  PagedListSkeleton,
} from '../components/paged-list';
import { useBillingTexts } from '@/test-fixtures/billing-test-support';

useBillingTexts();

describe('the skeleton of a feed the server pages', () => {
  it('is a busy region named by what is being read, with the rows to be', () => {
    render(<PagedListSkeleton label="Loading invoices" rows={4} />);

    const region = screen.getByRole('status', { name: 'Loading invoices' });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region.children).toHaveLength(4);
  });

  it('takes the height of the rows it stands for', () => {
    render(
      <PagedListSkeleton label="Loading" rowClassName="h-10" rows={2} />,
    );

    for (const row of screen.getByRole('status').children) {
      expect(row).toHaveClass('h-10');
      expect(row).not.toHaveClass('h-14');
    }
  });
});

describe('the foot of a feed the server pages', () => {
  const idle = {
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchNextPageError: false,
    isFetchingNextPage: false,
  };

  it('offers nothing when there is no more, and never counts what was read', () => {
    const { container } = render(
      <LoadMoreFooter loadMoreLabel="Load more" query={idle} />,
    );

    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('centres the button under the rows, as the notifications feed does, and reads the next page when asked', async () => {
    const fetchNextPage = vi.fn();
    render(
      <LoadMoreFooter
        loadMoreLabel="Load more"
        query={{ ...idle, fetchNextPage, hasNextPage: true }}
      />,
    );

    const button = screen.getByRole('button', { name: 'Load more' });
    expect(button.parentElement).toHaveClass('flex', 'justify-center');
    expect(screen.queryByText(/shown/)).toBeNull();

    await userEvent.click(button);

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('keeps the button from being pressed while a page is on the way', () => {
    render(
      <LoadMoreFooter
        loadMoreLabel="Load more"
        query={{ ...idle, hasNextPage: true, isFetchingNextPage: true }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Load more' })).toBeDisabled();
  });

  it('says why the next page could not be read, and keeps the button to ask again', () => {
    render(
      <LoadMoreFooter
        loadMoreLabel="Load more"
        query={{
          ...idle,
          error: new ApiError({
            data: { detail: 'the store is busy', status: 503 },
            status: 503,
          }),
          hasNextPage: true,
          isFetchNextPageError: true,
        }}
      />,
    );

    expect(screen.getByText('the store is busy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled();
  });
});

describe('the empty state of a list', () => {
  it('says what is missing and why, with what to do about it', () => {
    render(
      <ListEmptyState
        description="Invoices appear here."
        icon={dataModelIcons.invoice}
        testId="empty"
        title="No invoices yet"
      >
        <button type="button">Go to instances</button>
      </ListEmptyState>,
    );

    expect(screen.getByTestId('empty')).toHaveTextContent('No invoices yet');
    expect(screen.getByTestId('empty')).toHaveTextContent('Invoices appear here.');
    expect(
      screen.getByRole('button', { name: 'Go to instances' }),
    ).toBeInTheDocument();
  });

  it('needs no icon, and takes the spacing a screen gives it', () => {
    render(
      <ListEmptyState
        className="py-10"
        description="Nothing."
        testId="empty"
        title="None"
      />,
    );

    expect(screen.getByTestId('empty')).toHaveClass('py-10');
    expect(screen.getByTestId('empty')).not.toHaveClass('py-16');
    expect(screen.getByTestId('empty').querySelector('svg')).toBeNull();
  });
});
