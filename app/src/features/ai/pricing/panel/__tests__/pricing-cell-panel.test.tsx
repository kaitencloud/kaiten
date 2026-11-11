import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import i18n from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { client } from '@/api-client/client.gen';
import { handleCreateConversionRule } from '@/api-client/msw.gen';
import { server } from '@/__tests__/msw-server';
import { problemJson } from '@/e2e/msw/handler-factory';
import { ApiError } from '@/lib/errors';
import {
  findCell,
  renderPricing,
  resetPricingTest,
} from '../../__tests__/pricing-test-support';
import { blocker } from '../../__tests__/router-mock';

vi.mock('@tanstack/react-router', async () =>
  (await import('../../__tests__/router-mock')).routerMock,
);

type Sent = { body: Record<string, unknown>; method: string; url: string };

/** The writes the page sends, as they go on the wire. */
function recordWrites(): Sent[] {
  const sent: Sent[] = [];
  const listener = ({ request }: { request: Request }) => {
    if (request.method === 'GET' || request.url.endsWith('/graphql')) return;
    void request
      .clone()
      .json()
      .catch(() => ({}))
      .then((body: Record<string, unknown>) =>
        sent.push({ body, method: request.method, url: request.url }),
      );
  };
  server.events.on('request:start', listener);
  cleanups.push(() => server.events.removeListener('request:start', listener));

  return sent;
}

const cleanups: (() => void)[] = [];
beforeEach(async () => {
  while (cleanups.length > 0) cleanups.pop()?.();
  await resetPricingTest();
});

const panel = () => screen.findByRole('complementary');

/** Clicks a button of the panel that swaps its content, and returns the panel after. */
async function act(key: string, options = {}) {
  fireEvent.click(button(await panel(), key, options));
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: i18n.t(key, options) }),
    ).toBeNull(),
  );

  return panel();
}
const rate = (within_: HTMLElement, key: string) =>
  within(within_).getByRole('textbox', { name: new RegExp(`${key}$`) });
const button = (within_: HTMLElement, key: string, options = {}) =>
  within(within_).getByRole('button', { name: i18n.t(key, options) });

describe('the panel of a cell with no rule', () => {
  it('opens a new rule empty, and saves nothing until a rate is typed', async () => {
    const sent = recordWrites();
    renderPricing({ cell: 'trial~claude-sonnet-4-5' });
    await panel();
    const aside = await act('AI.Panel.none.addRule', {
      model: 'Claude Sonnet 4.5',
    });

    const save = await within(aside).findByRole('button', {
      name: i18n.t('AI.Panel.form.add'),
    });
    expect(save).toBeDisabled();
    for (const input of within(aside).getAllByRole('textbox')) {
      expect(input).toHaveValue('');
    }
    expect(aside).toHaveTextContent(i18n.t('AI.Panel.preview.empty'));

    fireEvent.change(rate(aside, 'perRequest'), { target: { value: '2' } });

    await waitFor(() => expect(save).toBeEnabled());
    expect(aside).not.toHaveTextContent(i18n.t('AI.Panel.preview.empty'));
    const reference = within(aside).getByRole('rowheader', {
      name: new RegExp(i18n.t('AI.Panel.preview.calls.REFERENCE')),
    });
    expect(reference.closest('tr')).toHaveTextContent('2.00');
    expect(reference.closest('tr')).toHaveTextContent('$0.0060');

    fireEvent.click(save);

    await waitFor(() =>
      expect(document.querySelector('[data-cell="trial~claude-sonnet-4-5"]'))
        .toHaveTextContent('2.00'),
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      method: 'POST',
      body: {
        entitlementSlug: 'ai-credits',
        maximumCreditsPerRequest: null,
        minimumCreditsPerRequest: '0',
        modelSlug: 'claude-sonnet-4-5',
        requestType: 'COMPLETION',
        rates: { perInputToken: null, perRequest: '2', perSecond: null },
      },
    });
    expect(sent[0]?.url).toMatch(/\/licenses\/trial\/conversion-rules$/);
    // The rule exists now: the panel is its editor.
    expect(
      await within(await panel()).findByRole('button', {
        name: i18n.t('AI.Panel.form.save'),
      }),
    ).toBeDisabled();
  });

  it('refuses a rate that is not a decimal, and a maximum under the minimum', async () => {
    renderPricing({ cell: 'trial~claude-sonnet-4-5' });
    await panel();
    const aside = await act('AI.Panel.none.addRule', {
      model: 'Claude Sonnet 4.5',
    });
    const save = await within(aside).findByRole('button', {
      name: i18n.t('AI.Panel.form.add'),
    });

    fireEvent.change(rate(aside, 'perRequest'), { target: { value: '1e3' } });
    await waitFor(() =>
      expect(rate(aside, 'perRequest')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(save).toBeDisabled();

    fireEvent.change(rate(aside, 'perRequest'), { target: { value: '1' } });
    await waitFor(() => expect(save).toBeEnabled());
    const [minimum, maximum] = [
      i18n.t('AI.Panel.form.minimum'),
      i18n.t('AI.Panel.form.maximum'),
    ].map((name) => within(aside).getByRole('textbox', { name }));
    fireEvent.change(minimum!, { target: { value: '5' } });
    fireEvent.change(maximum!, { target: { value: '2' } });
    await waitFor(() => expect(save).toBeDisabled());
    expect(maximum).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows what the API refused, in the words of the console', async () => {
    renderPricing({ cell: 'trial~claude-sonnet-4-5' });
    // What `configureApiClient` installs in the app: a refusal keeps its status.
    const interceptor = client.interceptors.error.use(
      (error, response) =>
        new ApiError({
          cause: error,
          data: error,
          response,
          status: response?.status,
        }),
    );
    cleanups.push(() => client.interceptors.error.eject(interceptor));
    server.use(
      handleCreateConversionRule(() =>
        problemJson(
          409,
          'an active rule already has this identity',
          'CreateConversionRule.Conflict',
        ),
      ),
    );
    await panel();
    const aside = await act('AI.Panel.none.addRule', {
      model: 'Claude Sonnet 4.5',
    });
    fireEvent.change(rate(aside, 'perRequest'), { target: { value: '2' } });
    const save = within(aside).getByRole('button', {
      name: i18n.t('AI.Panel.form.add'),
    });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    expect(await within(aside).findByRole('alert')).toHaveTextContent(
      i18n.t('AI.Errors.ruleConflict'),
    );
    expect(rate(aside, 'perRequest')).toHaveValue('2');
  });

  it('offers no new rule for a deprecated model', async () => {
    renderPricing({
      cell: 'enterprise~gpt-image-1',
      family: 'enterprise',
      type: 'IMAGE_GENERATION',
    });
    const aside = await panel();

    expect(aside).toHaveTextContent(i18n.t('AI.Panel.deprecated.noNewRule'));
    expect(within(aside).queryByRole('textbox')).toBeNull();
    expect(
      within(aside).queryByRole('button', {
        name: i18n.t('AI.Panel.none.addRule', { model: 'GPT Image 1' }),
      }),
    ).toBeNull();
  });
});

describe('the panel of a model priced by a wildcard', () => {
  it('names the wildcard and what it covers, and overrides without prefilling', async () => {
    const sent = recordWrites();
    renderPricing({ cell: 'starter-v2~claude-opus-4-1' });
    const aside = await panel();

    const ladder = within(aside).getByRole('list');
    expect(within(ladder).getAllByRole('listitem')).toHaveLength(4);
    expect(
      within(ladder).getAllByRole('listitem').at(-1),
    ).toHaveAttribute('aria-current', 'true');
    expect(aside).toHaveTextContent(
      i18n.t('AI.Panel.inherited.body', {
        count: 8,
        rates: `1 ${i18n.t('AI.Pricing.rateUnits.perRequest')}`,
        wildcard: i18n.t('AI.Pricing.wildcard.anyAll'),
      }),
    );

    const form = await act('AI.Panel.inherited.override');

    const save = await within(form).findByRole('button', {
      name: i18n.t('AI.Panel.form.add'),
    });
    expect(rate(form, 'perRequest')).toHaveValue('');
    expect(rate(form, 'perInputToken')).toHaveValue('');
    expect(save).toBeDisabled();

    // Starting from the wildcard's rates is asked for, never assumed.
    fireEvent.click(button(form, 'AI.Panel.form.startFromWildcard'));
    await waitFor(() => expect(rate(form, 'perRequest')).toHaveValue('1'));
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.change(rate(form, 'perRequest'), { target: { value: '6' } });
    fireEvent.click(save);

    await waitFor(() =>
      expect(
        document.querySelector('[data-cell="starter-v2~claude-opus-4-1"]'),
      ).toHaveTextContent('6.00'),
    );
    expect(sent[0]?.body).toMatchObject({
      modelSlug: 'claude-opus-4-1',
      requestType: 'COMPLETION',
      rates: { perRequest: '6' },
    });
    // The wildcard still prices the others.
    expect(
      document.querySelector('[data-cell="starter-v2~claude-haiku-4-5"]'),
    ).toHaveTextContent('1.00');
  });

  it('opens the wildcard, with the warning of what it reprices', async () => {
    renderPricing({ cell: 'enterprise-v2~claude-haiku-4-5' });
    fireEvent.click(button(await panel(), 'AI.Panel.inherited.openWildcard'));

    await waitFor(async () =>
      expect(
        within(await panel()).getByRole('heading', { level: 2 }),
      ).toHaveTextContent(i18n.t('AI.Pricing.grid.anyModel')),
    );
    const aside = await panel();
    expect(aside).toHaveTextContent(
      i18n.t('AI.Panel.wildcard.editing', { count: 5, version: 'Enterprise' }),
    );
    expect(rate(aside, 'perInputToken')).toHaveValue('0.0005');
  });
});

describe('the panel of a model with its own rule', () => {
  it('reads a decimal comma as a point, as the refund form does', async () => {
    renderPricing({ cell: 'enterprise-v2~claude-sonnet-4-5' });
    const aside = await panel();
    await within(aside).findByRole('button', {
      name: i18n.t('AI.Panel.form.save'),
    });

    fireEvent.change(rate(aside, 'perOutputToken'), {
      target: { value: ' 0,0018 ' },
    });

    expect(rate(aside, 'perOutputToken')).toHaveValue('0.0018');
    expect(within(aside).queryByRole('alert')).toBeNull();
  });

  it('shows before and after as a rate is typed, and writes only the terms', async () => {
    const sent = recordWrites();
    renderPricing({ cell: 'enterprise-v2~claude-sonnet-4-5' });
    const aside = await panel();
    const save = await within(aside).findByRole('button', {
      name: i18n.t('AI.Panel.form.save'),
    });
    expect(save).toBeDisabled();
    expect(rate(aside, 'perOutputToken')).toHaveValue('0.002');

    fireEvent.change(rate(aside, 'perOutputToken'), {
      target: { value: '0.0018' },
    });

    const reference = within(aside).getByRole('rowheader', {
      name: new RegExp(i18n.t('AI.Panel.preview.calls.REFERENCE')),
    });
    await waitFor(() =>
      expect(reference.closest('tr')).toHaveTextContent('1.60 → 1.50'),
    );
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() =>
      expect(
        document.querySelector('[data-cell="enterprise-v2~claude-sonnet-4-5"]'),
      ).toHaveTextContent('1.50'),
    );
    const put = sent.find((item) => item.method === 'PUT');
    expect(put?.body).toMatchObject({
      chargeOnError: 'NEVER',
      maximumCreditsPerRequest: '250',
      minimumCreditsPerRequest: '0.5',
      rates: { perInputToken: '0.0004', perOutputToken: '0.0018' },
    });
    expect(put?.body).not.toHaveProperty('modelSlug');
    expect(put?.body).not.toHaveProperty('entitlementSlug');
  });

  it('asks before archiving, and falls back to the wildcard once confirmed', async () => {
    const sent = recordWrites();
    renderPricing({ cell: 'enterprise-v2~claude-sonnet-4-5' });
    const aside = await panel();

    fireEvent.click(await within(aside).findByRole('button', {
      name: i18n.t('AI.Panel.archive.action'),
    }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Claude Sonnet 4.5');
    expect(sent).toHaveLength(0);
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: i18n.t('AI.Panel.archive.confirm'),
      }),
    );

    await waitFor(() =>
      expect(
        document.querySelector('[data-cell="enterprise-v2~claude-sonnet-4-5"]'),
      ).toHaveTextContent('2.00'),
    );
    expect(sent.map((item) => item.method)).toEqual(['DELETE']);
    expect(
      await screen.findByRole('button', {
        name: i18n.t('AI.Panel.inherited.override'),
      }),
    ).toBeVisible();
  });

  it('keeps unsent changes when another cell is clicked, until told to drop them', async () => {
    renderPricing({ cell: 'enterprise-v2~claude-sonnet-4-5' });
    const aside = await panel();
    fireEvent.change(rate(aside, 'perOutputToken'), {
      target: { value: '0.0018' },
    });
    await waitFor(() =>
      expect(
        within(aside).getByRole('button', { name: i18n.t('AI.Panel.form.save') }),
      ).toBeEnabled(),
    );

    fireEvent.click(await findCell('starter-v2~claude-opus-4-1'));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: i18n.t('AI.Panel.discard.keep'),
      }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(rate(await panel(), 'perOutputToken')).toHaveValue('0.0018');

    fireEvent.click(await findCell('starter-v2~claude-opus-4-1'));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: i18n.t('AI.Panel.discard.confirm'),
      }),
    );
    await waitFor(async () =>
      expect(
        within(await panel()).getByRole('heading', { level: 2 }),
      ).toHaveTextContent('Claude Opus 4.1'),
    );
  });
  it('tells the router to stop what would leave the form, and the browser to ask on tab close, only while changes are unsent', async () => {
    renderPricing({ cell: 'enterprise-v2~claude-sonnet-4-5' });
    const aside = await panel();
    const here = { pathname: '/ai/pricing', search: { cell: 'enterprise-v2~claude-sonnet-4-5' } };
    const elsewhere = { pathname: '/ai/models', search: {} };
    const blocks = () => blocker.options?.shouldBlockFn({ action: 'BACK', current: here, next: elsewhere });
    const unloadAsks = () =>
      typeof blocker.options?.enableBeforeUnload === 'function' && blocker.options.enableBeforeUnload();

    expect(blocks()).toBe(false);
    expect(unloadAsks()).toBe(false);

    fireEvent.change(rate(aside, 'perOutputToken'), { target: { value: '0.0018' } });
    await waitFor(() => expect(blocks()).toBe(true));
    expect(unloadAsks()).toBe(true);
    // Typing in the search box keeps the form: nothing to stop.
    expect(
      blocker.options?.shouldBlockFn({ action: 'REPLACE', current: here, next: { ...here, search: { ...here.search, q: 'gpt' } } }),
    ).toBe(false);

    // The form's own Cancel drops the changes without asking, and nothing is stopped after.
    fireEvent.click(within(aside).getByRole('button', { name: i18n.t('Common.cancel') }));
    await waitFor(() => expect(blocks()).toBe(false));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('the panel of a model whose rule prices every request type', () => {
  const addTyped = () =>
    i18n.t('AI.Panel.exact.addTyped', {
      type: i18n.t('AI.Pricing.types.COMPLETION').toLocaleLowerCase(),
    });

  it('adds a rule for the request type alone, beside the rule for any type', async () => {
    const sent = recordWrites();
    renderPricing({ cell: 'enterprise-v2~gemini-2-5-flash' });
    const aside = await panel();
    // The panel opens on the rule that prices every type of the model.
    expect(rate(aside, 'perRequest')).toHaveValue('1.5');

    fireEvent.click(
      await within(aside).findByRole('button', { name: addTyped() }),
    );

    const form = await panel();
    const add = await within(form).findByRole('button', {
      name: i18n.t('AI.Panel.form.add'),
    });
    expect(add).toBeDisabled();
    expect(rate(form, 'perRequest')).toHaveValue('');
    fireEvent.change(rate(form, 'perRequest'), { target: { value: '0.75' } });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);

    await waitFor(() =>
      expect(
        document.querySelector('[data-cell="enterprise-v2~gemini-2-5-flash"]'),
      ).toHaveTextContent('0.75'),
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      body: {
        entitlementSlug: 'ai-credits',
        modelSlug: 'gemini-2-5-flash',
        rates: { perRequest: '0.75' },
        requestType: 'COMPLETION',
      },
      method: 'POST',
    });
    // The panel now edits the new rule, and offers no third one.
    await waitFor(async () =>
      expect(rate(await panel(), 'perRequest')).toHaveValue('0.75'),
    );
    expect(screen.queryByRole('button', { name: addTyped() })).toBeNull();
  });

  it('does not offer it over unsent changes, nor for a rule that already names the type', async () => {
    renderPricing({ cell: 'enterprise-v2~gemini-2-5-flash' });
    const aside = await panel();
    const offer = await within(aside).findByRole('button', {
      name: addTyped(),
    });
    expect(offer).toBeEnabled();

    fireEvent.change(rate(aside, 'perRequest'), { target: { value: '2' } });
    await waitFor(() => expect(offer).toBeDisabled());

    fireEvent.click(await findCell('enterprise-v2~claude-sonnet-4-5'));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: i18n.t('AI.Panel.discard.confirm'),
      }),
    );
    await waitFor(async () =>
      expect(
        within(await panel()).getByRole('heading', { level: 2 }),
      ).toHaveTextContent('Claude Sonnet 4.5'),
    );
    expect(screen.queryByRole('button', { name: addTyped() })).toBeNull();
  });
});

describe('the panel of an archived model, and of a session that only reads', () => {
  it('explains an archived model and offers no rule', async () => {
    renderPricing({
      cell: 'enterprise-v2~whisper-large-v3',
      family: 'enterprise',
      status: 'all',
      type: 'AUDIO',
    });
    const aside = await panel();

    expect(aside).toHaveTextContent(
      i18n.t('AI.Panel.archived.title', { model: 'Whisper large v3' }),
    );
    expect(within(aside).queryByRole('textbox')).toBeNull();
  });

  it('shows a rule without a way to save it to a session that may not write', async () => {
    renderPricing({ cell: 'enterprise-v2~claude-sonnet-4-5' }, [
      'read:licenses',
      'read:models',
      'read:entitlements',
    ]);
    const aside = await panel();

    expect(rate(aside, 'perOutputToken')).toBeDisabled();
    expect(
      within(aside).queryByRole('button', { name: i18n.t('AI.Panel.form.save') }),
    ).toBeNull();
    expect(
      within(aside).queryByRole('button', {
        name: i18n.t('AI.Panel.archive.action'),
      }),
    ).toBeNull();
  });
});
