import {
  notifyManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type ReactNode, Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Invoice } from '@/api-client';
import { useBillingTexts } from '@/test-fixtures/billing-test-support';
import {
  buildInvoice,
  buildInvoiceLine,
  buildProviderRecord,
} from '../../../../../e2e/app/_support/fixtures/build-invoice';
import { PUSH_POLL_WINDOW_MS } from '../../utils/push-watch';
import { usePushWatch } from '../use-push-watch';

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
}));
// The invoice is read from a script and not from a network: with the clock faked, a
// network that answers in real time cannot be waited for deterministically.
const script = vi.hoisted(() => ({ reads: 0, states: [] as unknown[] }));

vi.mock('sonner', () => ({ toast }));
vi.mock('../../queries', async () => {
  const { queryOptions } = await import('@tanstack/react-query');

  return {
    invoiceQueryOptions: (invoiceId: string) =>
      queryOptions({
        queryFn: async () => {
          script.reads += 1;

          return script.states[
            Math.min(script.reads, script.states.length) - 1
          ] as Invoice;
        },
        queryKey: ['invoice', invoiceId],
        retry: false,
      }),
  };
});

useBillingTexts();

const INVOICE_KEY = ['invoice', 'inv-1'];

const LINE = buildInvoiceLine({
  amount: 2900,
  description: '1 × $29.00 per month',
  invoiceId: 'inv-1',
  label: 'Pro, monthly',
  seq: 1,
  serviceFrom: '2027-03-01T00:00:00.000Z',
  serviceTo: '2027-04-01T00:00:00.000Z',
  type: 'BASE',
});

const stripe = (
  overrides: Partial<Parameters<typeof buildInvoice>[0]> = {},
): Invoice =>
  buildInvoice({
    boundaryAt: '2027-03-01T00:00:00.000Z',
    collectionMethod: 'SEND_INVOICE',
    id: 'inv-1',
    lines: [LINE],
    provider: buildProviderRecord({ pushedAt: '2027-03-01T00:06:00.000Z' }),
    status: 'PUSHED',
    ...overrides,
  });

/** An invoice the queue has in hand: a draft with a push due, after `attempts` attempts. */
const queued = (attempts = 1) =>
  stripe({
    issuedAt: null,
    provider: { nextPushAt: '2027-03-01T00:12:00.000Z', pushAttempts: attempts },
    status: 'DRAFT',
  });

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['clearInterval', 'clearTimeout', 'Date', 'setInterval', 'setTimeout'],
  });
  // The cache tells its observers on a timer of its own: here, at once.
  notifyManager.setScheduler((callback) => callback());
  script.reads = 0;
  toast.error.mockReset();
  toast.info.mockReset();
  toast.success.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

/** Answers each read of the invoice with the next of `states`, the last for good. */
function serveInvoice(...states: Invoice[]) {
  script.reads = 0;
  script.states = states;

  return script;
}

function renderWatch(first: Invoice) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(INVOICE_KEY, first);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>{children}</Suspense>
    </QueryClientProvider>
  );

  return {
    client,
    ...renderHook(({ id }: { id: string }) => usePushWatch(id), {
      initialProps: { id: 'inv-1' },
      wrapper,
    }),
  };
}

type Rendered = ReturnType<typeof renderWatch>;

/** Lets the time pass, and the reads it sets off finish. */
async function tick(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

/** The request a person made has answered: the page has the invoice it left, and starts to watch. */
function answered(rendered: Rendered, invoice: Invoice) {
  act(() => {
    rendered.client.setQueryData(INVOICE_KEY, invoice);
    rendered.result.current.start(invoice);
  });
}

describe('watching a push', () => {
  it('does not carry a push over to another invoice the page is led to', async () => {
    const reads = serveInvoice(queued());
    const rendered = renderWatch(queued());
    const other = stripe({ id: 'inv-2' });

    answered(rendered, queued());
    expect(rendered.result.current.phase).toBe('waiting');
    act(() => {
      rendered.client.setQueryData(['invoice', 'inv-2'], other);
    });
    rendered.rerender({ id: 'inv-2' });
    await tick(30_000);

    expect(rendered.result.current.invoice.id).toBe('inv-2');
    expect(rendered.result.current.phase).toBe('idle');
    expect(toast.success).not.toHaveBeenCalled();
    expect(reads.reads).toBe(0);
  });

  it('reads the invoice and watches nothing until a push is asked for', async () => {
    const reads = serveInvoice(queued());
    const { result } = renderWatch(queued());

    await tick(30_000);

    expect(result.current.phase).toBe('idle');
    expect(reads.reads).toBe(0);
  });

  it('waits, reading the invoice again every five seconds, until the invoice is pushed, and says so once', async () => {
    const reads = serveInvoice(queued(), queued(), stripe());
    const rendered = renderWatch(queued());
    const { result } = rendered;

    answered(rendered, queued());
    expect(result.current.phase).toBe('waiting');

    await tick(4_999);
    expect(reads.reads).toBe(0);
    await tick(1);
    expect(reads.reads).toBe(1);
    expect(result.current.phase).toBe('waiting');
    await tick(5_000);
    expect(reads.reads).toBe(2);
    expect(result.current.phase).toBe('waiting');
    await tick(5_000);

    expect(reads.reads).toBe(3);
    expect(result.current.phase).toBe('idle');
    expect(result.current.invoice.status).toBe('PUSHED');
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('Stripe has the invoice');
    // Settled: it reads no more.
    await tick(30_000);
    expect(reads.reads).toBe(3);
  });

  it('stops when the push ran and failed again, and says what Stripe answered', async () => {
    const reads = serveInvoice(
      stripe({
        issuedAt: null,
        provider: {
          lastPushError: 'customer_tax_location_invalid',
          pushAttempts: 2,
        },
        status: 'PUSH_FAILED',
      }),
    );
    const rendered = renderWatch(queued(1));

    answered(rendered, queued(1));
    await tick(5_000);

    expect(reads.reads).toBe(1);
    expect(rendered.result.current.phase).toBe('idle');
    expect(toast.error).toHaveBeenCalledWith('The push failed again', {
      description: 'customer_tax_location_invalid',
    });
    await tick(30_000);
    expect(reads.reads).toBe(1);
  });

  it('stops when Stripe holds the draft for a person to finalize, and says so', async () => {
    serveInvoice(
      stripe({
        issuedAt: null,
        provider: buildProviderRecord({ pushAttempts: 2, status: 'draft' }),
        status: 'DRAFT',
      }),
    );
    const rendered = renderWatch(queued(1));

    answered(rendered, queued(1));
    await tick(5_000);

    expect(rendered.result.current.phase).toBe('idle');
    expect(toast.info).toHaveBeenCalledWith(
      'Stripe has the draft. Finalize it once you have reviewed it.',
    );
  });

  it('gives up after two minutes, says the push is still queued, and reads no more', async () => {
    const reads = serveInvoice(queued());
    const rendered = renderWatch(queued());

    answered(rendered, queued());
    await tick(PUSH_POLL_WINDOW_MS - 1);
    expect(rendered.result.current.phase).toBe('waiting');
    // Every five seconds: 23 reads in the 119.999 seconds before the window ends.
    expect(reads.reads).toBe(23);

    await tick(1);
    expect(rendered.result.current.phase).toBe('expired');
    const readsAtTheEnd = reads.reads;
    await tick(60_000);

    expect(reads.reads).toBeLessThanOrEqual(readsAtTheEnd + 1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('has nothing to wait for when the answer to the request shows the push had its turn', async () => {
    const reads = serveInvoice(stripe());
    const rendered = renderWatch(queued());

    answered(rendered, stripe());
    await tick(30_000);

    expect(rendered.result.current.phase).toBe('idle');
    expect(reads.reads).toBe(0);
    // The request said it already: no second word about it.
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('starts over when another push is asked for', async () => {
    const reads = serveInvoice(queued());
    const rendered = renderWatch(queued());

    answered(rendered, queued());
    await tick(PUSH_POLL_WINDOW_MS);
    expect(rendered.result.current.phase).toBe('expired');

    answered(rendered, queued());
    expect(rendered.result.current.phase).toBe('waiting');
    const before = reads.reads;
    await tick(5_000);

    expect(reads.reads).toBe(before + 1);
  });
});
