import { describe, expect, it } from 'vite-plus/test';
import { buildCheckoutSession } from '../../../../../e2e/app/_support/fixtures';
import { NO_CHECKOUT_LABELS } from '../checkout-session';
import {
  CHECKOUT_SESSION_FILTER_IDS,
  createCheckoutSessionFilterFields,
  getCheckoutSessionSearchTokens,
} from '../checkout-session-filter-fields';

const session = buildCheckoutSession({
  clientReferenceId: 'cmp-42',
  customerSlug: 'bought-online',
  email: 'Alice@Acme.test',
  instanceSlug: 'bought-online-prod',
  licenseSlug: 'pro',
  publishableKeyId: 'pk-1',
  sessionId: 'cs-1',
  status: 'COMPLETED',
});

describe('getCheckoutSessionSearchTokens', () => {
  it('matches the e-mail, the reference, the license, what it created, the key label and the id', () => {
    expect(
      getCheckoutSessionSearchTokens(session, {
        ...NO_CHECKOUT_LABELS,
        keys: { 'pk-1': 'Checkout page' },
      }),
    ).toEqual([
      'Alice@Acme.test',
      'cmp-42',
      'pro',
      '',
      'bought-online',
      '',
      'bought-online-prod',
      '',
      'Checkout page',
      'cs-1',
    ]);
  });

  it('matches the names the page shows as well as the slugs', () => {
    expect(
      getCheckoutSessionSearchTokens(session, {
        customers: { 'bought-online': 'Bought Online Ltd' },
        instances: { 'bought-online-prod': 'Bought Online Production' },
        keys: {},
        licenses: { pro: 'Professional' },
      }),
    ).toEqual(
      expect.arrayContaining([
        'Professional',
        'Bought Online Ltd',
        'Bought Online Production',
      ]),
    );
  });

  it('leaves out what a checkout has not got yet', () => {
    const open = buildCheckoutSession({ email: 'a@b.test', sessionId: 'cs-2' });

    expect(getCheckoutSessionSearchTokens(open, NO_CHECKOUT_LABELS)).toEqual([
      'a@b.test',
      '',
      'pro',
      '',
      '',
      '',
      '',
      '',
      '',
      'cs-2',
    ]);
  });
});

describe('createCheckoutSessionFilterFields', () => {
  const fields = createCheckoutSessionFilterFields({
    labels: NO_CHECKOUT_LABELS,
    t: ((key: string) => key) as never,
  });
  const field = (id: string) => fields.find((candidate) => candidate.id === id);

  it('has the search, the status, the period, the e-mail and the client reference', () => {
    expect(fields.map(({ id }) => id)).toEqual([
      CHECKOUT_SESSION_FILTER_IDS.search,
      CHECKOUT_SESSION_FILTER_IDS.status,
      CHECKOUT_SESSION_FILTER_IDS.period,
      CHECKOUT_SESSION_FILTER_IDS.email,
      CHECKOUT_SESSION_FILTER_IDS.clientReference,
    ]);
  });

  it('offers every status, to pick several', () => {
    const status = field(CHECKOUT_SESSION_FILTER_IDS.status);

    expect(status?.type).toBe('enum_list');
    expect(status?.options?.map(({ value }) => value)).toEqual([
      'OPEN',
      'AWAITING_PAYMENT',
      'COMPLETED',
      'ABANDONED',
      'EXPIRED',
    ]);
    expect(status?.accessor(session)).toBe('COMPLETED');
  });

  it('offers every billing period, to pick several, and reads the period of a checkout', () => {
    const period = field(CHECKOUT_SESSION_FILTER_IDS.period);

    expect(period?.type).toBe('enum_list');
    expect(period?.options?.map(({ value }) => value)).toEqual([
      'MONTHLY',
      'QUARTERLY',
      'SEMI_ANNUAL',
      'ANNUAL',
    ]);
    expect(period?.accessor(session)).toBe('MONTHLY');
    expect(
      period?.accessor(buildCheckoutSession({
          billingPeriod: 'ANNUAL',
          email: 'a@b.test',
          sessionId: 'cs-3',
        })),
    ).toBe('ANNUAL');
  });

  it('reads the e-mail and the reference of a checkout, and an empty reference when it has none', () => {
    expect(field(CHECKOUT_SESSION_FILTER_IDS.email)?.accessor(session)).toBe(
      'Alice@Acme.test',
    );
    expect(
      field(CHECKOUT_SESSION_FILTER_IDS.clientReference)?.accessor(session),
    ).toBe('cmp-42');
    expect(
      field(CHECKOUT_SESSION_FILTER_IDS.clientReference)?.accessor(
        buildCheckoutSession({ email: 'a@b.test', sessionId: 'cs-2' }),
      ),
    ).toBe('');
  });
});
