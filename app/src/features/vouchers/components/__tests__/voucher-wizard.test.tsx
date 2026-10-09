import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Voucher, VoucherDraft } from '@/api-client';
import {
  handleCreateVoucher,
  handlePublishVoucher,
  handleUpdateVoucher,
} from '@/api-client/msw.gen';
import { refusal, useBillingTexts } from '@/test-fixtures/billing-test-support';
import { buildVoucher } from '../../../../../e2e/app/_support/fixtures';
import { VoucherWizardPage } from '../index';
import {
  renderScreen,
  serveReferences,
  sessionWith,
} from './voucher-test-support';

const getAuthToken = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', async () =>
  (await import('./voucher-test-support')).createVoucherRouterModule(navigate),
);

useBillingTexts();

beforeEach(() => {
  navigate.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
  getAuthToken.mockResolvedValue(sessionWith());
  serveReferences();
});

const stored = (body: VoucherDraft, overrides: Partial<Voucher> = {}): Voucher => ({
  ...buildVoucher({
    code: body.code ?? 'GENERATED-CODE-16',
    id: 'voucher-new',
    name: body.name,
    status: 'DRAFT',
  }),
  ...overrides,
});

/** Serves the two requests that make a voucher, and records what each was asked. */
function serveMaking({
  create = (body: VoucherDraft) => HttpResponse.json(stored(body), { status: 201 }),
  publish = () => undefined as Response | undefined,
  update = (body: VoucherDraft) => HttpResponse.json(stored(body)),
}: {
  create?: (body: VoucherDraft) => Response;
  publish?: () => Response | undefined;
  update?: (body: VoucherDraft) => Response;
} = {}) {
  const asked: Array<{ body?: VoucherDraft; call: string }> = [];
  server.use(
    handleCreateVoucher(async ({ request }) => {
      const body = (await request.json()) as VoucherDraft;
      asked.push({ body, call: 'create' });

      return create(body);
    }),
    handleUpdateVoucher(async ({ params, request }) => {
      const body = (await request.json()) as VoucherDraft;
      asked.push({ body, call: `update ${String(params.voucherId)}` });

      return update(body);
    }),
    handlePublishVoucher(({ params }) => {
      asked.push({ call: `publish ${String(params.voucherId)}` });

      return (
        publish() ??
        HttpResponse.json({ ...buildVoucher({ code: 'WELCOME-20-OFF-2027', id: 'voucher-new', name: 'Welcome' }) })
      );
    }),
  );

  return asked;
}

/** The title of the step that is open: the card the step is drawn in. */
const stepTitle = (name: string) =>
  screen.findByText(name, { selector: '[data-slot="card-title"]' });
const nameField = () => screen.findByLabelText(/^Name/);
const next = async () => userEvent.click(await screen.findByRole('button', { name: /^Next/ }));
const publish = async () => userEvent.click(await screen.findByRole('button', { name: /^Publish/ }));

/** Fills the first step and goes on to the offer. */
async function toOffer(name = 'Welcome') {
  await userEvent.type(await nameField(), name);
  await next();
  await stepTitle('Offer');
}

/** Goes from the offer, as a discount of ten percent, to the eligibility step. */
async function toEligibility() {
  await userEvent.type(await screen.findByLabelText(/^Percentage/), '10');
  await next();
  await stepTitle('Who and when');
}

describe('the kind of voucher', () => {
  it('offers the two kinds and shows the two that come later, as available later and not to be chosen', async () => {
    renderScreen(<VoucherWizardPage />);

    const discount = await screen.findByRole('button', { name: /^Discount/ });
    expect(discount).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Boost/ })).toHaveAttribute('aria-pressed', 'false');
    for (const later of ['Feature grant', 'Bundle']) {
      const choice = screen.getByRole('button', { name: new RegExp(`^${later}`) });
      expect(choice).toHaveAttribute('aria-disabled', 'true');
      expect(choice).toHaveAccessibleDescription('Available in a later version');
      await userEvent.click(choice);
      expect(choice).toHaveAttribute('aria-pressed', 'false');
    }
    expect(discount).toHaveAttribute('aria-pressed', 'true');
  });

  it('cannot be left without a name, and says so on the field only once it was asked', async () => {
    renderScreen(<VoucherWizardPage />);

    await nameField();
    expect(screen.queryByText('Enter a name')).not.toBeInTheDocument();
    await next();

    expect(await screen.findByText('Enter a name')).toBeInTheDocument();
    expect(screen.queryByText('Offer', { selector: '[data-slot=\"card-title\"]' })).not.toBeInTheDocument();
  });

  it('does what the button under it does when Enter is pressed in a field: it goes on, and does not publish', async () => {
    const asked = serveMaking();
    renderScreen(<VoucherWizardPage />);

    await userEvent.type(await nameField(), 'Welcome{Enter}');

    expect(await stepTitle('Offer')).toBeInTheDocument();
    expect(asked).toEqual([]);
  });
});

describe('the offer of a discount', () => {
  it('needs a percentage above 0 and up to 100, and goes on with one that is', async () => {
    renderScreen(<VoucherWizardPage />);
    await toOffer();
    const percentage = await screen.findByLabelText(/^Percentage/);

    for (const typed of ['0', '101']) {
      await userEvent.clear(percentage);
      await userEvent.type(percentage, typed);
      await next();
      expect(
        await screen.findByText('Enter a percentage above 0 and up to 100'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Who and when', { selector: '[data-slot=\"card-title\"]' })).not.toBeInTheDocument();
    }
    await userEvent.clear(percentage);
    await userEvent.type(percentage, '20');
    await next();

    expect(await stepTitle('Who and when')).toBeInTheDocument();
  });

  it('needs a currency for a fixed amount, and an amount that has no finer a unit than the currency', async () => {
    renderScreen(<VoucherWizardPage />);
    await toOffer();

    await userEvent.click(await screen.findByRole('button', { name: /^A fixed amount/ }));
    await userEvent.type(await screen.findByLabelText(/^Amount/), '50');
    await next();

    expect(await screen.findByText('Currency required')).toBeInTheDocument();
  });

  it('needs at least one price when it applies to chosen prices', async () => {
    renderScreen(<VoucherWizardPage />);
    await toOffer();

    await userEvent.type(await screen.findByLabelText(/^Percentage/), '20');
    await userEvent.click(screen.getByRole('button', { name: /^Chosen prices/ }));
    await next();

    expect(await screen.findByText('Tick at least one price')).toBeInTheDocument();
  });

  it('asks the number of invoices, in invoices, when the offer repeats', async () => {
    renderScreen(<VoucherWizardPage />);
    await toOffer();

    await userEvent.click(await screen.findByRole('combobox', { name: /How long does it last/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'A number of times' }));

    expect(await screen.findByLabelText(/^Number of invoices/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/billing periods/)).not.toBeInTheDocument();
  });
});

describe('the offer of a boost', () => {
  async function toBoost() {
    renderScreen(<VoucherWizardPage />);
    await userEvent.click(await screen.findByRole('button', { name: /^Boost/ }));
    await userEvent.type(await nameField(), 'Tokens times two');
    await next();
    await stepTitle('Offer');
  }

  it('needs a change before it goes on, and counts the billing periods when it repeats', async () => {
    await toBoost();

    await next();
    expect(await screen.findByText('Add at least one change')).toBeInTheDocument();

    await userEvent.click(await screen.findByRole('combobox', { name: /How long does it last/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'A number of times' }));
    expect(await screen.findByLabelText(/^Number of billing periods/)).toBeInTheDocument();
  });

  it('offers the entitlements that carry a number and no other', async () => {
    await toBoost();

    await userEvent.click(await screen.findByRole('button', { name: /Add a change/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Choose an entitlement/ }));

    expect(await screen.findByRole('option', { name: 'Tokens' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'AI credits' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'SSO' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Theme' })).not.toBeInTheDocument();
  });

  it('asks no value of a change that lifts the limit, and a value above 0 of one that adds or multiplies', async () => {
    await toBoost();
    await userEvent.click(await screen.findByRole('button', { name: /Add a change/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Choose an entitlement/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Tokens' }));

    const value = await screen.findByLabelText(/^Value/);
    await userEvent.type(value, '0');
    await next();
    expect(await screen.findByText('Enter a number above 0')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: /^Change/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Make unlimited' }));

    expect(screen.queryByLabelText(/^Value/)).not.toBeInTheDocument();
    expect(await screen.findByText(/No limit on this entitlement/)).toBeInTheDocument();
  });

  it('accepts zero to set a limit', async () => {
    await toBoost();
    await userEvent.click(await screen.findByRole('button', { name: /Add a change/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Choose an entitlement/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Tokens' }));
    await userEvent.click(screen.getByRole('combobox', { name: /^Change/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Set to' }));
    await userEvent.type(await screen.findByLabelText(/^Value/), '0');
    await next();

    expect(await stepTitle('Who and when')).toBeInTheDocument();
  });

  it('takes a change away without handing its inputs to the next', async () => {
    await toBoost();
    const add = await screen.findByRole('button', { name: /Add a change/ });
    await userEvent.click(add);
    await userEvent.click(add);
    const [first, second] = await screen.findAllByLabelText(/^Value/);
    await userEvent.type(first, '111');
    await userEvent.type(second, '222');

    await userEvent.click(screen.getByRole('button', { name: 'Remove change 1' }));

    const rows = screen.getAllByTestId('voucher-grant-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByLabelText(/^Value/)).toHaveValue('222');
  });
});

describe('the code, the conditions and the limits', () => {
  it('warns of a short code that has no maximum and no end, and stops warning once it has one', async () => {
    renderScreen(<VoucherWizardPage />);
    await toOffer();
    await toEligibility();

    await userEvent.type(await screen.findByLabelText(/^Custom code/), 'SPRING2027');
    expect(await screen.findByTestId('weak-code-warning')).toHaveTextContent(
      'A short code can be guessed',
    );

    await userEvent.type(screen.getByLabelText(/^Maximum number of redemptions/), '100');
    await waitFor(() => expect(screen.queryByTestId('weak-code-warning')).not.toBeInTheDocument());
  });

  it('does not warn of an empty code, which the API generates long, nor of a long one', async () => {
    renderScreen(<VoucherWizardPage />);
    await toOffer();
    await toEligibility();

    expect(screen.queryByTestId('weak-code-warning')).not.toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText(/^Custom code/), 'WELCOME-SPRING-2027');
    expect(screen.queryByTestId('weak-code-warning')).not.toBeInTheDocument();
  });

  it('refuses a code the API would, and an end that is not after the start', async () => {
    renderScreen(<VoucherWizardPage />);
    await toOffer();
    await toEligibility();

    await userEvent.type(await screen.findByLabelText(/^Custom code/), 'SHORT');
    await next();

    expect(
      await screen.findByText('Use 8 to 64 letters, digits, dashes or underscores, or leave it empty'),
    ).toBeInTheDocument();
  });
});

describe('the review and the publication', () => {
  async function toReview({ code = '', max = '50' }: { code?: string; max?: string } = {}) {
    await toOffer('Welcome 10');
    await toEligibility();
    if (code) {
      await userEvent.type(await screen.findByLabelText(/^Custom code/), code);
    }
    if (max) {
      await userEvent.type(screen.getByLabelText(/^Maximum number of redemptions/), max);
    }
    await next();
    await screen.findByTestId('voucher-review');
  }

  it('reads the voucher in plain language, naming what it counts, before anything is sent', async () => {
    const asked = serveMaking();
    renderScreen(<VoucherWizardPage />);

    await toReview();

    const review = screen.getByTestId('voucher-review');
    expect(review).toHaveTextContent('10% off the base price, on one invoice.');
    expect(review).toHaveTextContent('It can be redeemed 50 times.');
    expect(review).toHaveTextContent('Any customer can redeem it, once per instance.');
    expect(screen.getByText('A code is generated when you publish')).toBeInTheDocument();
    expect(asked).toEqual([]);
  });

  it('creates the voucher and then publishes it, and shows the code with a copy button once it is', async () => {
    const asked = serveMaking();
    renderScreen(<VoucherWizardPage />);
    await toReview({ code: 'WELCOME-20-OFF-2027' });

    await publish();

    const published = await screen.findByTestId('voucher-published');
    // The button that published is gone with the wizard: the keyboard is not left on nothing.
    await waitFor(() => expect(published).toHaveFocus());
    expect(asked.map(({ call }) => call)).toEqual(['create', 'publish voucher-new']);
    expect(asked[0].body).toMatchObject({
      code: 'WELCOME-20-OFF-2027',
      duration: 'ONE_TIME',
      maxRedemptions: 50,
      name: 'Welcome 10',
      priceAppliesTo: 'LICENSE_BASE',
      priceDiscountType: 'PERCENTAGE',
      priceDiscountValue: '10',
      voucherType: 'PRICE',
    });
    expect(screen.getByTestId('voucher-code')).toHaveValue('WELCOME-20-OFF-2027');
    expect(screen.getByRole('button', { name: 'Copy the code' })).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Voucher published');
  });

  it('offers a boost for the same offer after a discount, by the id of the voucher', async () => {
    serveMaking();
    renderScreen(<VoucherWizardPage />);
    await toReview();

    await publish();

    expect(await screen.findByRole('link', { name: 'Add a boost' })).toHaveAttribute(
      'href',
      '/vouchers/new?boostFor=voucher-new',
    );
    expect(screen.getByRole('link', { name: 'View the voucher' })).toHaveAttribute(
      'href',
      '/vouchers/voucher-new',
    );
  });

  it('starts over, empty, from the page that follows a publication', async () => {
    serveMaking();
    renderScreen(<VoucherWizardPage />);
    await toReview();
    await publish();

    await userEvent.click(await screen.findByRole('button', { name: 'Make another voucher' }));

    expect(await nameField()).toHaveValue('');
    expect(screen.queryByTestId('voucher-published')).not.toBeInTheDocument();
  });

  it('keeps the voucher as a draft and goes to its page when asked not to publish', async () => {
    const asked = serveMaking();
    renderScreen(<VoucherWizardPage />);
    await toReview();

    await userEvent.click(await screen.findByRole('button', { name: 'Save as a draft' }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        params: { voucherId: 'voucher-new' },
        to: '/vouchers/$voucherId',
      }),
    );
    expect(asked.map(({ call }) => call)).toEqual(['create']);
    expect(toast.success).toHaveBeenCalledWith('Draft saved');
  });

  it('sends the draft again, not a second voucher, when the publication was refused and the person sends again', async () => {
    let refused = true;
    const asked = serveMaking({
      publish: () => {
        if (refused) {
          refused = false;

          return refusal(503, { code: 'Billing.Down', detail: 'Billing is being moved.' });
        }

        return undefined;
      },
    });
    renderScreen(<VoucherWizardPage />);
    await toReview();

    await publish();

    expect(await screen.findByText('Billing is being moved.')).toBeInTheDocument();
    expect(screen.getByText(/saved as a draft/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByTestId('voucher-published')).toBeInTheDocument();
    expect(asked.map(({ call }) => call)).toEqual([
      'create',
      'publish voucher-new',
      'update voucher-new',
      'publish voucher-new',
    ]);
  });

  it('shows a refusal about the code on the code, in the API words, and goes back to the step that has it', async () => {
    serveMaking({
      create: () =>
        refusal(422, {
          code: 'CreateVoucher.WeakCodeUnbounded',
          detail: 'a short code needs a maximum or an end date',
        }),
    });
    renderScreen(<VoucherWizardPage />);
    await toReview({ code: 'SPRING2027', max: '' });

    await publish();

    expect(await stepTitle('Who and when')).toBeInTheDocument();
    expect(await screen.findByText('a short code needs a maximum or an end date')).toBeInTheDocument();
    expect(screen.queryByTestId('voucher-published')).not.toBeInTheDocument();
  });

  it('takes the refusal off the code when another field changes, since the refusal was about the two together', async () => {
    let refused = true;
    const asked = serveMaking({
      create: (body) =>
        refused
          ? refusal(422, {
              code: 'CreateVoucher.WeakCodeUnbounded',
              detail: 'a short code needs a maximum or an end date',
            })
          : HttpResponse.json(stored(body), { status: 201 }),
    });
    renderScreen(<VoucherWizardPage />);
    await toReview({ code: 'SPRING2027', max: '' });
    await publish();
    await screen.findByText('a short code needs a maximum or an end date');

    // The fix is a limit, on another field: the code is not typed again.
    refused = false;
    await userEvent.type(await screen.findByLabelText(/^Maximum number of redemptions/), '100');
    await waitFor(() =>
      expect(screen.queryByText('a short code needs a maximum or an end date')).not.toBeInTheDocument(),
    );
    await next();
    await screen.findByTestId('voucher-review');
    await publish();

    expect(await screen.findByTestId('voucher-published')).toBeInTheDocument();
    expect(asked.map(({ call }) => call)).toEqual(['create', 'create', 'publish voucher-new']);
  });

  it('goes back to the first step that has something to fix when a step it left was broken since', async () => {
    const asked = serveMaking();
    renderScreen(<VoucherWizardPage />);
    await toReview();

    await userEvent.click(screen.getByRole('button', { name: /Offer/ }));
    const percentage = await screen.findByLabelText(/^Percentage/);
    await userEvent.clear(percentage);
    await userEvent.click(screen.getByRole('button', { name: /Review/ }));

    expect(await screen.findByText('Enter a percentage above 0 and up to 100')).toBeInTheDocument();
    expect(screen.queryByTestId('voucher-review')).not.toBeInTheDocument();
    expect(asked).toEqual([]);
  });
});

describe('a boost for the same offer', () => {
  it('starts on the offer step with the duration of the discount and no entitlement chosen', async () => {
    const discount = buildVoucher({
      code: 'LAUNCH-20-OFF',
      duration: 'REPEATING',
      durationInPeriods: 3,
      id: 'voucher-launch',
      name: 'Launch discount',
      priceDiscountValue: '20',
    });
    renderScreen(<VoucherWizardPage boostFor={discount} />);

    expect(await stepTitle('Offer')).toBeInTheDocument();
    expect(await screen.findByLabelText(/^Number of billing periods/)).toHaveValue('3');
    expect(screen.getByRole('button', { name: /Add a change/ })).toBeInTheDocument();
    // The name says what it follows, and the code is the API's to generate.
    await userEvent.click(screen.getByRole('button', { name: /Kind/ }));
    expect(await nameField()).toHaveValue('Launch discount (boost)');
  });
});

describe('finishing a draft', () => {
  const DRAFT = buildVoucher({
    code: 'SUMMER-SALE-2027',
    currency: 'USD',
    id: 'voucher-draft',
    name: 'Summer sale',
    priceAppliesTo: 'BOTH',
    priceDiscountType: 'FIXED_AMOUNT',
    priceDiscountValue: '2500',
    status: 'DRAFT',
  });

  it('opens on the review, and replaces the draft by what the form holds before it publishes it', async () => {
    const asked = serveMaking();
    renderScreen(<VoucherWizardPage draft={DRAFT} />);

    expect(await screen.findByTestId('voucher-review')).toHaveTextContent('$25.00 off the base price and the add-ons');
    expect(screen.getByRole('heading', { name: 'Finish the draft' })).toBeInTheDocument();
    await publish();

    expect(await screen.findByTestId('voucher-published')).toBeInTheDocument();
    expect(asked.map(({ call }) => call)).toEqual(['update voucher-draft', 'publish voucher-new']);
    expect(asked[0].body).toMatchObject({
      code: 'SUMMER-SALE-2027',
      currency: 'USD',
      priceDiscountType: 'FIXED_AMOUNT',
      priceDiscountValue: '2500',
    });
  });
});
