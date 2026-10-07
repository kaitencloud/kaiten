import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes } from 'react';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import type { Invoice } from '@/api-client';
import { TooltipProvider } from '@/components/ui/tooltip';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import {
  buildInvoice,
  buildInvoiceLine,
} from '../../../../../e2e/app/_support/fixtures/build-invoice';
import { HoldBanner } from '../invoice-detail/hold-banner';
import { InvoiceActionButtons } from '../invoice-detail/invoice-action-buttons';
import { InvoiceChain } from '../invoice-detail/invoice-chain';
import { InvoiceHandoffBlock } from '../invoice-detail/invoice-handoff-block';
import { InvoiceLineDetail } from '../invoice-detail/invoice-line-detail';
import { InvoiceSummaryCard } from '../invoice-detail/invoice-summary-card';

const granted = vi.hoisted(() => ({ actions: new Set<string>() }));

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    params?: Record<string, string>;
    to: string;
  }) => (
    <a
      {...props}
      href={Object.entries(params ?? {}).reduce(
        (path, [key, value]) => path.replace(`$${key}`, value),
        to,
      )}
    >
      {children}
    </a>
  ),
}));

vi.mock('@/domains/billing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/domains/billing')>()),
  useCanPerform: (action: string) => granted.actions.has(action),
}));

beforeAll(async () => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  testI18n.addResourceBundle('fr', 'translation', fr, true, true);
  await testI18n.changeLanguage('en');
});

afterAll(async () => {
  await testI18n.changeLanguage('en');
});

beforeEach(() => {
  granted.actions = new Set();
});

const BOUNDARY = '2027-03-01T00:00:00.000Z';
const NEXT = '2027-04-01T00:00:00.000Z';

const base = (overrides: Partial<Parameters<typeof buildInvoice>[0]> = {}) =>
  buildInvoice({
    boundaryAt: BOUNDARY,
    id: 'inv-1',
    lines: [
      buildInvoiceLine({
        amount: 12900,
        description: '1 × $129.00 per month',
        invoiceId: 'inv-1',
        label: 'Pro, monthly',
        seq: 1,
        serviceFrom: BOUNDARY,
        serviceTo: NEXT,
        type: 'BASE',
      }),
    ],
    ...overrides,
  });

describe('the actions of an invoice', () => {
  const states = [
    { action: 'markPaid' as const },
    { action: 'writeOff' as const },
    { action: 'void' as const },
  ];

  const renderButtons = (
    props: Partial<Parameters<typeof InvoiceActionButtons>[0]> = {},
  ) => {
    const onRun = vi.fn();
    render(
      <TooltipProvider>
        <InvoiceActionButtons onRun={onRun} states={states} {...props} />
      </TooltipProvider>,
    );

    return { onRun, buttons: screen.getByTestId('invoice-actions') };
  };

  it('are buttons, the first one being the way the status leads to', () => {
    const { buttons } = renderButtons();

    const [first, second, third] = within(buttons).getAllByRole('button');
    expect(first).toHaveTextContent('Mark as paid');
    expect(second).toHaveTextContent('Write off');
    expect(third).toHaveTextContent('Void');
    expect(first).toHaveAttribute('data-action', 'markPaid');
  });

  it('run the action that is chosen', async () => {
    const { buttons, onRun } = renderButtons();

    await userEvent.click(within(buttons).getByRole('button', { name: 'Write off' }));

    expect(onRun).toHaveBeenCalledWith('writeOff');
  });

  it('are folded into one menu on a phone, which runs the action that is chosen', async () => {
    const { onRun } = renderButtons();

    await userEvent.click(
      within(screen.getByTestId('invoice-actions-menu')).getByRole('button', {
        name: /Actions/,
      }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: /Void/ }));

    expect(onRun).toHaveBeenCalledWith('void');
  });

  it('show an action the status allows and the screen knows would be refused as disabled, with why', async () => {
    const { buttons, onRun } = renderButtons({
      states: [
        {
          action: 'recompose',
          unavailable: { reason: 'instance-deleted' },
        },
      ],
    });

    const recompose = within(buttons).getByRole('button', { name: 'Recompose' });
    expect(recompose).toBeDisabled();
    await userEvent.hover(recompose.parentElement as HTMLElement);
    expect(
      await screen.findByText(
        'The instance of this invoice was deleted, so nothing can be recomposed for it.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(recompose);
    expect(onRun).not.toHaveBeenCalled();
  });

  it('say where the usage that is kept begins when a recompose would leave out its lines', async () => {
    const { buttons } = renderButtons({
      states: [
        {
          action: 'recompose',
          unavailable: {
            reason: 'purged-usage',
            retentionStart: new Date('2026-04-01T00:00:00.000Z'),
          },
        },
      ],
    });

    await userEvent.hover(
      within(buttons).getByRole('button', { name: 'Recompose' }).parentElement as HTMLElement,
    );

    expect(
      await screen.findByText(/no longer kept \(before Apr 1, 2026 \(UTC\)\)/),
    ).toBeInTheDocument();
  });
});

describe('the banner of a held draft', () => {
  const held = (overrides: Partial<Invoice> = {}) =>
    base({
      holdDetail: {
        pairs: [
          {
            counterReportSeq: 44,
            entitlementId: 'ent-1',
            expected: '45',
            firstSeq: 41,
            found: '44',
            instanceId: 'ins-1',
            invariant: 'LEDGER_SEQUENCE_GAP',
            lastSeq: 45,
          },
        ],
      },
      holdReason: 'LEDGER_SEQUENCE_GAP',
      status: 'DRAFT',
      ...overrides,
    });

  it('says in words the check that failed', () => {
    render(<HoldBanner invoice={held()} />);

    expect(screen.getByTestId('hold-banner')).toHaveAttribute(
      'data-hold-reason',
      'LEDGER_SEQUENCE_GAP',
    );
    expect(
      screen.getByText('Held: Usage reports are missing from the journal'),
    ).toBeInTheDocument();
  });

  it('lists every meter that failed, with what was expected, what was found and the reports concerned', () => {
    render(<HoldBanner invoice={held()} />);

    const cells = within(screen.getAllByRole('row')[1])
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells).toEqual([
      'ent-1',
      'Usage reports are missing from the journal',
      '45',
      '44',
      '41–45',
      '44',
    ]);
  });

  it('names the provider a release works under, and says a recompose uses the subscription’s', () => {
    const { rerender } = render(<HoldBanner invoice={held()} />);
    expect(screen.getByText(/waits in the handoff queue for your ERP/)).toBeInTheDocument();
    expect(screen.getByText(/under the provider the subscription uses now/)).toBeInTheDocument();

    rerender(<HoldBanner invoice={held({ providerKind: 'STRIPE' })} />);
    expect(screen.getByText(/pushed to Stripe/)).toBeInTheDocument();
  });

  it('shows a check it does not know as the API named it', () => {
    render(
      <HoldBanner
        invoice={held({
          holdDetail: {
            pairs: [
              {
                counterReportSeq: null,
                entitlementId: 'ent-9',
                expected: '1',
                firstSeq: null,
                found: '2',
                instanceId: 'ins-1',
                invariant: 'LEDGER_NEW_CHECK',
                lastSeq: null,
              },
            ],
          },
        })}
      />,
    );

    expect(screen.getByText('LEDGER_NEW_CHECK')).toBeInTheDocument();
  });
});

describe('the chain of replacements', () => {
  it('is absent from an invoice that replaces nothing and was replaced by nothing', () => {
    render(<InvoiceChain invoice={base()} />);

    expect(screen.queryByTestId('invoice-chain')).toBeNull();
  });

  it('leads to the replacement, and from a replacement back to the invoice it replaces', () => {
    const { rerender } = render(
      <InvoiceChain invoice={base({ replacedByInvoiceId: 'inv-2' })} />,
    );
    expect(screen.getByRole('link', { name: 'inv-2' })).toHaveAttribute(
      'href',
      '/billing/invoices/inv-2',
    );
    expect(screen.getByText('Replaced by')).toBeInTheDocument();

    rerender(<InvoiceChain invoice={base({ replacesInvoiceId: 'inv-0' })} />);
    expect(screen.getByRole('link', { name: 'inv-0' })).toHaveAttribute(
      'href',
      '/billing/invoices/inv-0',
    );
    expect(screen.getByText('Replaces')).toBeInTheDocument();
  });
});

describe('where an invoice stands in the handoff queue', () => {
  it('says what waits, how many times it was taken and until when one holds it', () => {
    render(
      <InvoiceHandoffBlock
        invoice={base({
          handoff: {
            claimCount: 2,
            leaseId: 'lease-1',
            leasedUntil: '2099-01-01T00:00:00.000Z',
            status: 'PENDING',
          },
        })}
      />,
    );

    const block = screen.getByTestId('invoice-handoff');
    expect(block).toHaveTextContent('Waiting for your ERP');
    expect(within(block).getByText('2')).toBeInTheDocument();
    expect(block).toHaveTextContent('Reserved until');
  });

  it.each([
    ['VOID' as const, /void and its handoff stays pending.*sees it as void/],
    [
      'UNCOLLECTIBLE' as const,
      /written off and its handoff stays pending.*sees it as written off/,
    ],
  ])(
    'says a %s invoice stays in the queue, and that its consumer sees it as it is now',
    (status, sentence) => {
      render(
        <InvoiceHandoffBlock
          invoice={base({ handoff: { claimCount: 0, status: 'PENDING' }, status })}
        />,
      );

      expect(screen.getByTestId('invoice-handoff')).toHaveTextContent(sentence);
      expect(screen.getByTestId('invoice-handoff')).not.toHaveTextContent(
        'A job or the CLI takes it from the queue',
      );
    },
  );

  it('says the plain thing of an invoice that is still to be collected', () => {
    render(
      <InvoiceHandoffBlock
        invoice={base({ handoff: { claimCount: 0, status: 'PENDING' }, status: 'MANUAL' })}
      />,
    );

    expect(screen.getByTestId('invoice-handoff')).toHaveTextContent(
      'A job or the CLI takes it from the queue, books it and acknowledges it.',
    );
  });

  it('does not say a lease that ran out holds the invoice', () => {
    render(
      <InvoiceHandoffBlock
        invoice={base({
          handoff: {
            claimCount: 1,
            leasedUntil: '2020-01-01T00:00:00.000Z',
            status: 'PENDING',
          },
        })}
      />,
    );

    expect(screen.getByTestId('invoice-handoff')).not.toHaveTextContent(
      'Reserved until',
    );
  });

  it('shows the number the accounting system gave an invoice it acknowledged', () => {
    render(
      <InvoiceHandoffBlock
        invoice={base({
          handoff: {
            acknowledgedAt: '2027-03-05T09:00:00.000Z',
            claimCount: 1,
            externalReference: 'ERP-1042',
            status: 'ACKNOWLEDGED',
          },
        })}
      />,
    );

    const block = screen.getByTestId('invoice-handoff');
    expect(within(block).getByText('ERP-1042')).toBeInTheDocument();
    expect(block).toHaveTextContent('Mar 5, 2027, 9:00 AM (UTC)');
  });

  it('says it was acknowledged without a number when it was', () => {
    render(
      <InvoiceHandoffBlock
        invoice={base({
          handoff: {
            acknowledgedAt: '2027-03-05T09:00:00.000Z',
            claimCount: 0,
            status: 'ACKNOWLEDGED',
          },
        })}
      />,
    );

    expect(screen.getByText('Acknowledged without a reference')).toBeInTheDocument();
  });

  it('is absent, not empty, for an invoice that never needed handing off', () => {
    render(<InvoiceHandoffBlock invoice={base()} />);

    expect(screen.queryByTestId('invoice-handoff')).toBeNull();
  });
});

describe('what stands behind a line', () => {
  const metered = () =>
    buildInvoiceLine({
      amount: 420,
      description: '4,200 × $0.001 per call',
      entitlementId: 'ent-1',
      entitlementSlug: 'api-calls',
      invoiceId: 'inv-1',
      label: 'API calls, overage',
      metering: {
        ledger: {
          firstSeq: 301,
          lastSeq: 305,
          rows: 5,
          sumDelta: '104200',
          sumOverage: '4200',
        },
        measuredQuantity: '4200',
        negativeSegmentsFloored: 0,
        saleUnitFactor: '1',
        windows: 1,
      },
      overage: {
        limits: [{ limitValue: '100000', overagePercent: 50, rows: 5 }],
        overageMeasured: '4200',
        usageMeasured: '104200',
      },
      quantity: '4200',
      seq: 1,
      serviceFrom: BOUNDARY,
      serviceTo: NEXT,
      type: 'OVERAGE',
    });

  it('is a fingerprint of the reports and the way to them, for a metered line', () => {
    granted.actions.add('invoice.lineReports');
    render(<InvoiceLineDetail invoiceId="inv-1" line={metered()} />);

    expect(screen.getByTestId('overage-limits')).toBeInTheDocument();
    expect(screen.getByTestId('line-fingerprint')).toHaveTextContent(
      'Reports 301–305 · 5 rows · Σ 104,200',
    );
    expect(screen.getByRole('link', { name: 'View 5 usage reports' })).toHaveAttribute(
      'href',
      '/billing/invoices/inv-1/lines/inv-1-line-1',
    );
  });

  it('offers no way to the reports to a session that may not read them', () => {
    render(<InvoiceLineDetail invoiceId="inv-1" line={metered()} />);

    expect(screen.getByTestId('line-fingerprint')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /usage report/ })).toBeNull();
  });

  it('offers no way to reports a line has none of', () => {
    granted.actions.add('invoice.lineReports');
    const line = metered();
    render(
      <InvoiceLineDetail
        invoiceId="inv-1"
        line={{
          ...line,
          metering: {
            ...line.metering!,
            ledger: { ...line.metering!.ledger!, firstSeq: null, lastSeq: null, rows: 0, sumDelta: '0' },
          },
        }}
      />,
    );

    expect(screen.queryByRole('link', { name: /usage report/ })).toBeNull();
  });

  it('is nothing for a line that was not measured: a base fee, an add-on, a discount', () => {
    const { container } = render(
      <InvoiceLineDetail invoiceId="inv-1" line={base().lines[0]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe('the summary of an invoice', () => {
  it('says when it is due, and how many days after it was issued', () => {
    render(<InvoiceSummaryCard invoice={base({ daysUntilDue: 30 })} />);

    expect(screen.getByText('Mar 31, 2027 (UTC) · 30 days to pay')).toBeInTheDocument();
  });

  it('says how it ended: paid, written off, voided with the reason', () => {
    render(
      <InvoiceSummaryCard
        invoice={base({
          status: 'VOID',
          voidReason: 'Duplicate of inv-9',
          voidedAt: '2027-03-09T10:00:00.000Z',
        })}
      />,
    );

    expect(screen.getByText('Duplicate of inv-9')).toBeInTheDocument();
    expect(screen.getByText('Mar 9, 2027, 10:00 AM (UTC)')).toBeInTheDocument();
  });

  it('says whether a hold was released by a person, with their reason, or by a later check', () => {
    const { rerender } = render(
      <InvoiceSummaryCard
        invoice={base({
          hold: {
            releaseReason: 'Counter verified by hand',
            releasedAt: '2027-03-04T09:00:00.000Z',
            releasedBy: 'user-1',
          },
        })}
      />,
    );
    expect(
      screen.getByText(
        'Mar 4, 2027, 9:00 AM (UTC), by a person, for this reason: Counter verified by hand',
      ),
    ).toBeInTheDocument();

    rerender(
      <InvoiceSummaryCard
        invoice={base({
          hold: { releasedAt: '2027-03-04T09:00:00.000Z' },
        })}
      />,
    );
    expect(
      screen.getByText(/automatically: a later check found the usage journal sound/),
    ).toBeInTheDocument();
  });
});
