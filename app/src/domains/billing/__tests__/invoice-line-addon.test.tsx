import { screen, waitFor, within } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { InstanceAddon, InvoiceLine } from '@/api-client';
import { handleListInstanceAddons } from '@/api-client/msw.gen';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import {
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { buildInstanceAddon } from '../../../../e2e/app/_support/fixtures';
import { buildInvoiceLine } from '../../../../e2e/app/_support/fixtures/build-invoice';
import { InvoiceLinesTable } from '../components';
import { invalidateInstanceAddonQueries } from '../queries';

const getAuthToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));

useBillingTexts();

const FROM = '2027-03-01T00:00:00.000Z';
const TO = '2027-04-01T00:00:00.000Z';

const TOKENS = buildInstanceAddon({
  addon: {
    familySlug: 'extra-tokens',
    id: 'addon-tokens',
    name: 'Extra tokens',
    slug: 'extra-tokens',
    maxQuantity: null,
  },
  attachedAt: '2027-03-12T00:00:00.000Z',
  id: 'attachment-tokens',
});
const SUPPORT = buildInstanceAddon({
  addon: {
    familySlug: 'support-pack',
    id: 'addon-support',
    name: 'Support pack',
    slug: 'support-pack',
    maxQuantity: null,
  },
  attachedAt: '2027-02-10T00:00:00.000Z',
  id: 'attachment-support',
  removedAt: '2027-03-20T10:00:00.000Z',
});
const SEATS = buildInstanceAddon({
  addon: {
    familySlug: 'extra-seats',
    id: 'addon-seats',
    name: 'Extra seats',
    slug: 'extra-seats',
    maxQuantity: null,
  },
  attachedAt: '2027-01-05T00:00:00.000Z',
  id: 'attachment-seats',
});

const tokensUsage: InvoiceLine = buildInvoiceLine({
  addonId: 'addon-tokens',
  addonPriceId: 'addon-price-tokens',
  amount: 840,
  description: '4.2 × 2.00 USD (per 1M tokens)',
  instanceAddonId: 'attachment-tokens',
  invoiceId: 'inv-1',
  label: 'Tokens',
  seq: 1,
  serviceFrom: '2027-03-12T00:00:00.000Z',
  serviceTo: TO,
  type: 'USAGE',
});
const supportFee: InvoiceLine = buildInvoiceLine({
  addonId: 'addon-support',
  addonPriceId: 'addon-price-support',
  amount: 5000,
  billingTiming: 'ARREARS',
  description: '1 × 50.00 USD per month',
  instanceAddonId: 'attachment-support',
  invoiceId: 'inv-1',
  label: 'Support pack × 1',
  seq: 2,
  serviceFrom: FROM,
  serviceTo: '2027-03-20T10:00:00.000Z',
  type: 'ADDON',
});
const seatsFee: InvoiceLine = buildInvoiceLine({
  addonId: 'addon-seats',
  addonPriceId: 'addon-price-seats',
  amount: 3000,
  description: '3 × 10.00 USD per month',
  instanceAddonId: 'attachment-seats',
  invoiceId: 'inv-1',
  label: 'Extra seats × 3',
  quantity: '3',
  seq: 3,
  serviceFrom: TO,
  serviceTo: '2027-05-01T00:00:00.000Z',
  type: 'ADDON',
});
const licenceUsage: InvoiceLine = buildInvoiceLine({
  amount: 460,
  description: '2,300 × 0.20 USD',
  invoiceId: 'inv-1',
  label: 'API calls',
  seq: 4,
  serviceFrom: FROM,
  serviceTo: TO,
  type: 'USAGE',
});

const requests: URL[] = [];

/** Answers the add-ons the instance has had, and keeps what was asked. */
function answerAddons(attachments: InstanceAddon[]) {
  requests.length = 0;
  server.use(
    handleListInstanceAddons(({ request }) => {
      requests.push(new URL(request.url));

      return HttpResponse.json(attachments);
    }),
  );
}

async function renderLines(lines: InvoiceLine[]) {
  const rendered = renderWithClient(
    <InvoiceLinesTable currency="USD" instanceSlug="acme-prod" lines={lines} />,
  );
  // The scopes are read by the lines that name an attachment, and by no other.
  if (lines.some((line) => line.instanceAddonId)) {
    await waitFor(() =>
      expect(rendered.client.getQueryState(grantedScopesQueryKey)?.status).toBe(
        'success',
      ),
    );
  }

  return rendered;
}

const rowOf = (label: string) =>
  screen.getByText(label).closest('tr') as HTMLElement;

beforeEach(() => {
  getAuthToken.mockResolvedValue(sessionToken(['read:instances']));
});

describe('the add-on an invoice line bills', () => {
  it('says how many units a true-up line bills the elapsed period for, held and billed in advance', async () => {
    answerAddons([SEATS]);
    const seatsTrueUp: InvoiceLine = {
      ...seatsFee,
      amount: 2000,
      description: '2 × 10.00 USD per month',
      label: 'Extra seats, true-up',
      quantity: '2',
      seq: 6,
      serviceFrom: FROM,
      serviceTo: TO,
      trueUp: { billedQuantity: 3, maxQuantity: 5 },
    };

    await renderLines([seatsFee, seatsTrueUp]);

    expect(
      await within(rowOf('Extra seats, true-up')).findByText(
        'True-up for the elapsed period: up to 5 held, 3 billed in advance',
      ),
    ).toBeInTheDocument();
    expect(
      within(rowOf('Extra seats × 3')).queryByTestId('invoice-line-addon'),
    ).not.toBeInTheDocument();
  });

  it('names the add-on whose usage a line rated, and asks the instance once for every line', async () => {
    answerAddons([TOKENS, SUPPORT, SEATS]);

    await renderLines([tokensUsage, supportFee, seatsFee]);

    expect(
      await within(rowOf('Tokens')).findByText('From the add-on Extra tokens'),
    ).toBeInTheDocument();
    // The attachments that were taken off are asked for with the others.
    expect(requests).toHaveLength(1);
    expect(requests[0].pathname).toBe('/api/instances/acme-prod/addons');
    expect(requests[0].searchParams.get('includeRemoved')).toBe('true');
  });

  it('is read again when the add-ons of the instance change, as the plain list is', async () => {
    answerAddons([TOKENS]);
    const { client } = await renderLines([tokensUsage]);
    await within(rowOf('Tokens')).findByText('From the add-on Extra tokens');
    expect(requests).toHaveLength(1);

    // The key of the plain list reaches it: a detach or an attach refreshes both.
    await invalidateInstanceAddonQueries(client, 'acme-prod');

    await waitFor(() => expect(requests).toHaveLength(2));
  });

  it('says an add-on was removed when its fee is on the invoice of a boundary it was removed before', async () => {
    answerAddons([TOKENS, SUPPORT, SEATS]);

    await renderLines([supportFee, seatsFee]);

    expect(
      await within(rowOf('Support pack × 1')).findByText(
        'From the add-on Support pack, removed on Mar 20, 2027, 10:00 AM (UTC)',
      ),
    ).toBeInTheDocument();
    // The fee of an add-on that is still held is named by its own label already.
    expect(
      within(rowOf('Extra seats × 3')).queryByTestId('invoice-line-addon'),
    ).not.toBeInTheDocument();
  });

  it('does not say an add-on was removed on the line of an invoice that was composed before it was', async () => {
    answerAddons([SUPPORT]);
    // The window of this line ends on Mar 10: the add-on was still held, and was taken off ten days later.
    const earlierFee: InvoiceLine = { ...supportFee, seq: 5, serviceTo: '2027-03-10T00:00:00.000Z' };
    const earlierUsage: InvoiceLine = {
      ...tokensUsage,
      addonId: 'addon-support',
      instanceAddonId: 'attachment-support',
      label: 'Support tickets',
      seq: 6,
      serviceTo: '2027-03-10T00:00:00.000Z',
    };

    await renderLines([earlierFee, earlierUsage]);

    expect(await screen.findByText('From the add-on Support pack')).toBeInTheDocument();
    expect(screen.queryByText(/removed on/)).not.toBeInTheDocument();
    expect(within(rowOf('Support pack × 1')).queryByTestId('invoice-line-addon')).not.toBeInTheDocument();
  });

  it('shows nothing of an add-on on the line of a licence', async () => {
    answerAddons([TOKENS]);

    await renderLines([licenceUsage]);

    expect(requests).toHaveLength(0);
    expect(screen.queryByTestId('invoice-line-addon')).not.toBeInTheDocument();
  });

  it('says only that the usage comes from an add-on when the session may not list them', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing']));
    answerAddons([TOKENS]);

    await renderLines([tokensUsage]);

    expect(
      await screen.findByText('From an add-on'),
    ).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('says the same when the instance no longer has the attachment, or no longer exists', async () => {
    server.use(
      handleListInstanceAddons(() =>
        refusal(404, {
          code: 'ListInstanceAddons.InstanceNotFound',
          detail: 'instance not found',
        }),
      ),
    );

    await renderLines([tokensUsage, supportFee]);

    expect(await screen.findByText('From an add-on')).toBeInTheDocument();
    // A fee is named by its label, and has nothing to add.
    expect(
      within(rowOf('Support pack × 1')).queryByTestId('invoice-line-addon'),
    ).not.toBeInTheDocument();
  });

  it('says the usage of an add-on comes from one in a preview, which has no instance', () => {
    renderWithClient(
      <InvoiceLinesTable currency="USD" lines={[tokensUsage, seatsFee]} />,
    );

    expect(screen.getByText('From an add-on')).toBeInTheDocument();
    expect(screen.getAllByTestId('invoice-line-addon')).toHaveLength(1);
    expect(requests).toHaveLength(0);
  });
});
