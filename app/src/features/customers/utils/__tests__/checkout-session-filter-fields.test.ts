import { describe, expect, it } from 'vite-plus/test';
import { buildCheckoutSession } from '../../../../../e2e/app/_support/fixtures';
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
  it('matches the e-mail, the reference, the licence, what it created, the key label and the id', () => {
    expect(
      getCheckoutSessionSearchTokens(session, { 'pk-1': 'Checkout page' }),
    ).toEqual([
      'Alice@Acme.test',
      'cmp-42',
      'pro',
      'bought-online',
      'bought-online-prod',
      'Checkout page',
      'cs-1',
    ]);
  });

  it('leaves out what a checkout has not got yet', () => {
    const open = buildCheckoutSession({ email: 'a@b.test', sessionId: 'cs-2' });

    expect(getCheckoutSessionSearchTokens(open, {})).toEqual([
      'a@b.test',
      '',
      'pro',
      '',
      '',
      '',
      'cs-2',
    ]);
  });
});

describe('createCheckoutSessionFilterFields', () => {
  const fields = createCheckoutSessionFilterFields({
    keyLabels: {},
    t: ((key: string) => key) as never,
  });
  const field = (id: string) => fields.find((candidate) => candidate.id === id);

  it('has the search, the status, the e-mail and the client reference', () => {
    expect(fields.map(({ id }) => id)).toEqual([
      CHECKOUT_SESSION_FILTER_IDS.search,
      CHECKOUT_SESSION_FILTER_IDS.status,
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
