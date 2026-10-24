import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { handleListInstanceAddons } from '@/api-client/msw.gen';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import {
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { buildInstanceAddon } from '../../../../../e2e/app/_support/fixtures';
import { buildInvoiceLine } from '../../../../../e2e/app/_support/fixtures/build-invoice';
import { LineSummaryCard } from '../line-drilldown/line-summary-card';

const getAuthToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));

useBillingTexts();

const TOKENS = {
  familySlug: 'extra-tokens',
  id: 'addon-tokens',
  maxQuantity: null,
  name: 'Extra tokens',
  slug: 'extra-tokens',
};

const usage = buildInvoiceLine({
  addonId: TOKENS.id,
  addonPriceId: 'addon-price-tokens',
  amount: 840,
  description: '4.2 × 2.00 USD (per 1M tokens)',
  instanceAddonId: 'attachment-tokens',
  invoiceId: 'inv-1',
  label: 'Tokens',
  seq: 1,
  serviceFrom: '2027-03-12T00:00:00.000Z',
  serviceTo: '2027-04-01T00:00:00.000Z',
  type: 'USAGE',
});

beforeEach(() => {
  getAuthToken.mockResolvedValue(sessionToken(['read:instances']));
});

async function renderSummary(attachment: ReturnType<typeof buildInstanceAddon>) {
  server.use(handleListInstanceAddons({ body: [attachment] }));
  const rendered = renderWithClient(
    <LineSummaryCard
      invoice={{ currency: 'USD', instanceSlug: 'acme-prod' }}
      line={usage}
    />,
  );
  await waitFor(() =>
    expect(rendered.client.getQueryState(grantedScopesQueryKey)?.status).toBe(
      'success',
    ),
  );
}

describe('the add-on behind a metered line, on its page', () => {
  it('names the add-on whose window the service period is', async () => {
    await renderSummary(
      buildInstanceAddon({
        addon: TOKENS,
        attachedAt: '2027-03-12T00:00:00.000Z',
        id: 'attachment-tokens',
      }),
    );

    expect(await screen.findByTestId('line-addon')).toHaveTextContent(
      'Extra tokens',
    );
    expect(screen.getByText('Mar 12 – Apr 1, 2027 (UTC)')).toBeInTheDocument();
  });

  it('says when the add-on was removed', async () => {
    await renderSummary(
      buildInstanceAddon({
        addon: TOKENS,
        attachedAt: '2027-03-12T00:00:00.000Z',
        id: 'attachment-tokens',
        removedAt: '2027-03-30T00:00:00.000Z',
      }),
    );

    expect(await screen.findByTestId('line-addon')).toHaveTextContent(
      'Extra tokens, removed on Mar 30, 2027 (UTC)',
    );
  });

  it('adds no row for a line of a licence', () => {
    renderWithClient(
      <LineSummaryCard
        invoice={{ currency: 'USD', instanceSlug: 'acme-prod' }}
        line={buildInvoiceLine({
          amount: 460,
          description: '2,300 × 0.20 USD',
          invoiceId: 'inv-1',
          label: 'API calls',
          seq: 1,
          serviceFrom: '2027-03-01T00:00:00.000Z',
          serviceTo: '2027-04-01T00:00:00.000Z',
          type: 'USAGE',
        })}
      />,
    );

    expect(screen.queryByTestId('line-addon')).not.toBeInTheDocument();
  });
});
