import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import {
  BillingUnavailable,
  InvoiceLineTypeBadge,
  InvoiceStatusBadge,
  Money,
  ServicePeriod,
  SubscriptionStatusBadge,
} from '../components';
import { INVOICE_LINE_TYPES } from '../logic';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

// The unit i18n returns a key for a text it was not given. These tests read the
// real English and French, as the user does.
beforeAll(async () => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  testI18n.addResourceBundle('fr', 'translation', fr, true, true);
  await testI18n.changeLanguage('en');
});

afterAll(async () => {
  await testI18n.changeLanguage('en');
});

describe('BillingUnavailable', () => {
  it('tells a self-hosted deployment which variable turns billing on', () => {
    render(<BillingUnavailable reason="DEPLOYMENT_DISABLED" />);

    expect(screen.getByText('Billing is not enabled')).toBeInTheDocument();
    expect(screen.getByText(/KAITEN_BILLING_ENABLED/)).toBeInTheDocument();
    expect(screen.getByTestId('billing-unavailable')).toHaveAttribute(
      'data-reason',
      'DEPLOYMENT_DISABLED',
    );
  });

  it('tells an organization whose plan lacks billing to upgrade', () => {
    render(<BillingUnavailable reason="NOT_ENTITLED" />);

    expect(screen.getByText('Billing is not part of your plan')).toBeInTheDocument();
    expect(screen.getByText(/Upgrade your plan/)).toBeInTheDocument();
  });

  it('names the scope a session lacks', () => {
    render(<BillingUnavailable reason="MISSING_SCOPE" scope="read:billing" />);

    expect(screen.getByText('You do not have access to billing')).toBeInTheDocument();
    expect(screen.getByText('read:billing')).toBeInTheDocument();
  });

  it('explains a part of billing the release does not ship', () => {
    render(<BillingUnavailable reason="FEATURE_UNAVAILABLE" />);

    expect(screen.getByText('Not available in this version')).toBeInTheDocument();
  });

  it('offers to read the capabilities again when they could not be read', async () => {
    const onRetry = vi.fn();
    render(<BillingUnavailable onRetry={onRetry} reason="UNREACHABLE" />);

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('offers no retry where asking again changes nothing', () => {
    render(<BillingUnavailable onRetry={() => {}} reason="NOT_ENTITLED" />);

    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('is an explanation, not an error: it has a way home and no alert', () => {
    render(<BillingUnavailable reason="DEPLOYMENT_DISABLED" />);

    expect(screen.getByRole('link', { name: 'Go Home' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reads in French', async () => {
    await testI18n.changeLanguage('fr');
    try {
      render(<BillingUnavailable reason="DEPLOYMENT_DISABLED" />);

      expect(screen.getByText('La facturation n’est pas activée')).toBeInTheDocument();
    } finally {
      await testI18n.changeLanguage('en');
    }
  });
});

describe('Money', () => {
  it('writes an amount in the language of the app', async () => {
    const { rerender } = render(<Money amount={2900} currency="USD" />);
    expect(screen.getByText('$29.00')).toHaveClass('tabular-nums');

    await testI18n.changeLanguage('fr');
    try {
      rerender(<Money amount={2900} currency="USD" />);
      expect(screen.getByText(/^29,00\s\$US$/)).toBeInTheDocument();
    } finally {
      await testI18n.changeLanguage('en');
    }
  });

  it('writes a discount with a true minus sign', () => {
    render(<Money amount={-580} currency="USD" />);

    expect(screen.getByText('−$5.80')).toBeInTheDocument();
  });

  it('writes the amounts of currencies with no or three decimals', () => {
    render(
      <>
        <Money amount={5000} currency="JPY" />
        <Money amount={12345} currency="KWD" />
      </>,
    );

    expect(screen.getByText('¥5,000')).toBeInTheDocument();
    expect(screen.getByText(/^KWD\s12\.345$/)).toBeInTheDocument();
  });
});

describe('ServicePeriod', () => {
  it('writes a half-open period in UTC', () => {
    render(
      <ServicePeriod
        from="2027-03-01T00:00:00.000Z"
        to="2027-04-01T00:00:00.000Z"
      />,
    );

    expect(screen.getByText(/^Mar 1\s.\s?Apr 1, 2027 \(UTC\)$/)).toBeInTheDocument();
  });

  it('puts the two ends one above the other, for a cell of a table', () => {
    render(
      <ServicePeriod
        from="2027-03-01T10:00:00.000Z"
        stacked
        to="2027-04-01T10:00:00.000Z"
      />,
    );

    // The dash ends the first line, and the end with its marker is kept whole.
    expect(screen.getByText(/^Mar 1, 2027, 10:00\sAM\s?.$/)).toBeInTheDocument();
    expect(screen.getByText(/^Apr 1, 2027, 10:00\sAM \(UTC\)$/)).toBeInTheDocument();
  });

  it('stays one line where it has no end to show, stacked or not', () => {
    render(<ServicePeriod from="2027-03-01T00:00:00.000Z" stacked to={undefined} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('InvoiceStatusBadge', () => {
  it('reads a manual invoice as ready to bill', () => {
    render(
      <InvoiceStatusBadge invoice={{ collectionMethod: 'SEND_INVOICE', status: 'MANUAL' }} />,
    );

    expect(screen.getByText('Ready to bill')).toBeInTheDocument();
  });

  it('says a draft is held, and gives the reason to a keyboard as well as a pointer', async () => {
    const user = userEvent.setup();
    render(
      <InvoiceStatusBadge
        invoice={{
          collectionMethod: 'SEND_INVOICE',
          holdReason: 'LEDGER_SEQUENCE_GAP',
          status: 'DRAFT',
        }}
      />,
    );

    // The reason sits behind something a keyboard reaches, not a hover-only title.
    await user.tab();

    expect(screen.getByText('Held').parentElement).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Usage reports are missing from the journal',
    );
    expect(screen.getByText('Held')).not.toHaveAttribute('title');
  });

  it('adds nothing to reach for on a status that has no reason behind it', async () => {
    const user = userEvent.setup();
    render(
      <InvoiceStatusBadge invoice={{ collectionMethod: 'SEND_INVOICE', status: 'PAID' }} />,
    );

    await user.tab();

    expect(screen.getByText('Paid')).not.toHaveFocus();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('says an unpaid invoice past its due date is overdue', () => {
    render(
      <InvoiceStatusBadge
        invoice={{
          collectionMethod: 'SEND_INVOICE',
          dueAt: '2027-03-01T00:00:00Z',
          status: 'MANUAL',
        }}
        now={Date.parse('2027-03-15T00:00:00Z')}
      />,
    );

    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('says every status in words, never by colour alone', () => {
    const statuses = [
      'DRAFT', 'MANUAL', 'PUSHED', 'PAID', 'PUSH_FAILED', 'PAYMENT_FAILED', 'UNCOLLECTIBLE', 'VOID',
    ] as const;
    render(
      <>
        {statuses.map((status) => (
          <InvoiceStatusBadge
            invoice={{ collectionMethod: 'SEND_INVOICE', status }}
            key={status}
          />
        ))}
      </>,
    );

    for (const label of [
      'Draft', 'Ready to bill', 'Awaiting payment', 'Paid', 'Push failed',
      'Payment failed', 'Written off', 'Void',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe('SubscriptionStatusBadge', () => {
  it.each([
    ['TRIAL', false, 'Trial'],
    ['ACTIVE', false, 'Active'],
    ['PAST_DUE', false, 'Past due'],
    ['CANCELED', false, 'Canceled'],
    ['ACTIVE', true, 'Cancels at period end'],
  ] as const)('reads %s (cancellation scheduled: %s) as %s', (status, cancelAtPeriodEnd, label) => {
    render(<SubscriptionStatusBadge subscription={{ cancelAtPeriodEnd, status }} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('InvoiceLineTypeBadge', () => {
  it('renders each of the five types of line an invoice can carry', () => {
    render(
      <>
        {INVOICE_LINE_TYPES.map((type) => (
          <InvoiceLineTypeBadge key={type} type={type} />
        ))}
      </>,
    );

    for (const label of ['Base', 'Add-on', 'Usage', 'Overage', 'Discount']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('renders a type it does not know, and keeps what it was sent behind it', async () => {
    const user = userEvent.setup();
    render(<InvoiceLineTypeBadge type="CREDIT" />);

    expect(screen.getByText('Other')).toBeInTheDocument();
    await user.tab();

    expect(screen.getByText('Other').parentElement).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('CREDIT');
  });
});
