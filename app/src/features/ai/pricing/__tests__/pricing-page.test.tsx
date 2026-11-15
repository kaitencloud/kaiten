import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import i18n from 'i18next';
import { HttpResponse } from 'msw/http';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { handleListModels } from '@/api-client/msw.gen';
import { buildAiModels } from '../../../../../e2e/app/_support/fixtures';
import {
  findCell,
  renderPricing,
  resetPricingTest,
} from './pricing-test-support';
import { router } from './router-mock';

vi.mock('@tanstack/react-router', async () =>
  (await import('./router-mock')).routerMock,
);

beforeEach(resetPricingTest);

const lastSearch = () =>
  router.navigations.at(-1)?.search?.({}) as Record<string, unknown>;

describe('the rate card over the mock world', () => {
  it('prices the reference call on each version, and says where the price comes from', async () => {
    renderPricing();

    const onStarter = await findCell('starter-v2~claude-sonnet-4-5');
    expect(onStarter).toHaveTextContent('1.00');
    expect(onStarter).toHaveTextContent(i18n.t('AI.Pricing.cell.viaAnyAll'));
    expect(onStarter).toHaveAccessibleName(
      expect.stringContaining('Claude Sonnet 4.5'),
    );
    expect(onStarter).toHaveAccessibleName(expect.stringContaining('Starter'));

    const onEnterprise = await findCell('enterprise-v2~claude-sonnet-4-5');
    expect(onEnterprise).toHaveTextContent('1.60');
    expect(onEnterprise).toHaveTextContent('$0.0075');
    expect(onEnterprise).toHaveTextContent(i18n.t('AI.Pricing.cell.ownRule'));

    // Sonnet has its own rule on Business; Haiku there goes through the wildcard.
    expect(await findCell('business~claude-sonnet-4-5')).toHaveTextContent(
      '2.40',
    );
    expect(await findCell('business~claude-haiku-4-5')).toHaveTextContent(
      '2.00',
    );
  });

  it('flags a version that grants the pool and has no rule', async () => {
    renderPricing();

    const onTrial = await findCell('trial~claude-sonnet-4-5');
    expect(onTrial).toHaveTextContent(i18n.t('AI.Pricing.cell.noRuleRefused'));
    const head = screen.getByRole('columnheader', { name: /trial/ });
    expect(head).toHaveTextContent(i18n.t('AI.Pricing.version.noRule'));
    expect(await findCell('trial~*')).toHaveTextContent(
      i18n.t('AI.Pricing.wildcard.add'),
    );
  });

  it('names each cell by its row and column headers', async () => {
    renderPricing();
    await findCell('starter-v2~claude-opus-4-1');

    expect(
      screen.getByRole('rowheader', { name: /Claude Opus 4\.1/ }),
    ).toHaveTextContent('$0.0600');
    expect(screen.getAllByRole('columnheader')).toHaveLength(5);
    expect(await findCell('starter-v2~*')).toHaveTextContent('1.00');
  });

  it('has one tab per request type a model takes, with its count', async () => {
    renderPricing();
    await findCell('starter-v2~*');

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      `${i18n.t('AI.Pricing.types.COMPLETION')}8`,
      `${i18n.t('AI.Pricing.types.EMBEDDING')}2`,
      `${i18n.t('AI.Pricing.types.IMAGE_GENERATION')}1`,
      // One audio model is archived, and archived models are hidden by default.
      `${i18n.t('AI.Pricing.types.AUDIO')}1`,
    ]);

    fireEvent.click(tabs[1]!);
    await waitFor(() => expect(lastSearch()).toMatchObject({ type: 'EMBEDDING' }));
    expect(await findCell('enterprise-v2~text-embedding-3-small')).toBeVisible();
    expect(
      document.querySelector('[data-cell="enterprise-v2~claude-sonnet-4-5"]'),
    ).toBeNull();
  });

  it('shows archived models only when asked', async () => {
    renderPricing({ type: 'AUDIO', status: 'all' });

    const archived = await findCell('enterprise-v2~whisper-large-v3');
    expect(archived).toHaveTextContent(i18n.t('AI.Pricing.cell.archived'));
    expect(screen.getAllByRole('tab').at(-1)).toHaveTextContent('2');
  });

  it('gives the margin only once a credit value is typed, and marks a negative one', async () => {
    renderPricing();
    const haiku = await findCell('starter-v2~claude-haiku-4-5');
    const opus = await findCell('starter-v2~claude-opus-4-1');
    expect(haiku).not.toHaveTextContent('%');

    const value = screen.getByRole('textbox', {
      name: new RegExp(i18n.t('AI.Pricing.controls.creditValue').slice(0, 12)),
    });
    fireEvent.change(value, { target: { value: '0.01' } });

    await waitFor(() => expect(haiku).toHaveTextContent('60%'));
    expect(opus).toHaveTextContent('-500%');
    expect(within(opus).getByRole('img')).toHaveAccessibleName(
      i18n.t('AI.Pricing.cell.negativeMargin'),
    );
    expect(within(haiku).queryByRole('img')).toBeNull();

    fireEvent.change(value, { target: { value: '' } });
    await waitFor(() => expect(haiku).not.toHaveTextContent('%'));
  });

  it('says a vendor cost is partial, with no cost per credit and no margin, on the cell and in the panel', async () => {
    renderPricing({ cell: 'enterprise-v2~claude-sonnet-4-5' });
    // Sonnet with an input cost and no output cost.
    server.use(
      handleListModels(() =>
        HttpResponse.json({
          hasMore: false,
          items: buildAiModels().map((model) =>
            model.slug === 'claude-sonnet-4-5'
              ? {
                  ...model,
                  vendorCosts: {
                    currency: 'USD' as const,
                    perInputToken: '0.000003',
                  },
                }
              : model,
          ),
        }),
      ),
    );
    const sonnet = await findCell('enterprise-v2~claude-sonnet-4-5');
    const haiku = await findCell('starter-v2~claude-haiku-4-5');
    fireEvent.change(
      screen.getByRole('textbox', {
        name: new RegExp(
          i18n.t('AI.Pricing.controls.creditValue').slice(0, 12),
        ),
      }),
      { target: { value: '0.01' } },
    );
    await waitFor(() => expect(haiku).toHaveTextContent('60%'));

    expect(sonnet).toHaveTextContent('1.60');
    expect(sonnet).toHaveTextContent(i18n.t('AI.Pricing.cell.costPartial'));
    expect(sonnet).not.toHaveTextContent('/ credit');
    expect(sonnet).not.toHaveTextContent('%');
    expect(sonnet).toHaveAccessibleName(
      expect.stringContaining(i18n.t('AI.Pricing.cell.label.costPartial')),
    );

    const aside = await screen.findByRole('complementary');
    await waitFor(() =>
      expect(aside).toHaveTextContent(i18n.t('AI.Panel.breakdown.partial')),
    );
    const reference = within(aside).getByRole('rowheader', {
      name: new RegExp(i18n.t('AI.Panel.preview.calls.REFERENCE')),
    });
    // Vendor $0.0045 (input only), marked partial; no $ / credit, no margin.
    expect(reference.closest('tr')).toHaveTextContent(
      i18n.t('AI.Panel.preview.partial'),
    );
    expect(reference.closest('tr')).not.toHaveTextContent('%');
    expect(aside).not.toHaveTextContent(/\d%/);
  });

  it('puts the clicked cell in the URL and opens its panel beside the grid', async () => {
    renderPricing();
    const cell = await findCell('starter-v2~claude-opus-4-1');
    expect(screen.queryByRole('complementary')).toBeNull();

    fireEvent.click(cell);

    await waitFor(() =>
      expect(lastSearch()).toMatchObject({ cell: 'starter-v2~claude-opus-4-1' }),
    );
    const panel = await screen.findByRole('complementary');
    expect(
      within(panel).getByRole('heading', { level: 2 }),
    ).toHaveTextContent('Claude Opus 4.1');
    expect(cell).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('table', { name: i18n.t('AI.Pricing.grid.region') }),
    ).toBeVisible();
  });

  it('shows the short checklist for a pool nothing prices', async () => {
    renderPricing({ pool: 'agent-credits' });
    await findCell('starter-v2~*');

    expect(
      screen.getByRole('heading', { name: /Agent credits/ }),
    ).toBeVisible();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(4);
    expect(await findCell('starter-v2~claude-haiku-4-5')).toHaveTextContent(
      i18n.t('AI.Pricing.cell.poolNotGranted'),
    );
  });

  it('says what a session that may not read prices is missing', async () => {
    renderPricing({}, ['read:models']);

    expect(await screen.findByRole('status')).toHaveTextContent(
      i18n.t('AI.Pricing.readDenied'),
    );
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('names a family after the version it serves and orders its columns by version number', async () => {
    renderPricing({ family: 'starter' });
    const table = await screen.findByRole('table', { name: i18n.t('AI.Pricing.grid.region') });

    const heads = within(table)
      .getAllByRole('columnheader')
      .map((head) => head.textContent ?? '')
      .filter((text) => text.includes('starter'));
    expect(heads.map((text) => /starter(-v\d)?/.exec(text)?.[0])).toEqual(['starter', 'starter-v2', 'starter-v3']);
  });
});

describe('a pool an add-on can grant', () => {
  const head = async (slug: string) => {
    const table = await screen.findByRole('table', { name: i18n.t('AI.Pricing.grid.region') });
    const found = within(table)
      .getAllByRole('columnheader')
      .find((item) => within(item).queryByText(slug));
    if (!found) throw new Error(`No column ${slug}`);

    return found;
  };

  it('says "through add-on" with its name on the head and in the cells, in place of "pool not granted"', async () => {
    renderPricing({ pool: 'partner-ai-credits' });
    const business = await head('business');

    const chip = await within(business).findByRole('button', { name: 'Through add-on · Partner credit pack' });
    expect(business).not.toHaveTextContent(i18n.t('AI.Pricing.version.notGranted'));
    const cell = await findCell('business~claude-sonnet-4-5');
    await waitFor(() => expect(cell).toHaveTextContent('Through add-on · Partner credit pack'));
    expect(cell).not.toHaveTextContent(i18n.t('AI.Pricing.cell.notGrantedChip'));
    expect(cell).toHaveAccessibleName(/Through add-on/);

    fireEvent.click(chip);
    const details = await screen.findByRole('dialog');
    // It can grant the pool to an instance: it does not say every instance holds it.
    expect(details).toHaveTextContent('It does not mean every instance holds it');
    expect(details).toHaveTextContent('partner-credit-pack-v2');
    expect(details).toHaveTextContent(i18n.t('AI.Pool.addons.lifecycle.ARCHIVED'));
  });

  it('keeps "pool not granted" where neither the licence nor an add-on grants it', async () => {
    renderPricing({ pool: 'partner-ai-credits', family: 'enterprise' });

    expect(await head('enterprise')).toHaveTextContent(i18n.t('AI.Pricing.version.notGranted'));
    expect(await findCell('enterprise~claude-sonnet-4-5')).toHaveTextContent(i18n.t('AI.Pricing.cell.notGrantedChip'));
  });

  it('adds a short "+ add-on" beside a grant of the licence itself', async () => {
    renderPricing({ family: 'starter' });
    const starter = await head('starter-v2');

    expect(starter).toHaveTextContent('Grants pool');
    expect(await within(starter).findByRole('button', { name: i18n.t('AI.Pool.addons.alsoThrough') })).toBeVisible();
  });

  it('shows the boolean alone to a session that may not read add-ons', async () => {
    renderPricing({ pool: 'partner-ai-credits' }, [
      'read:models',
      'read:licenses',
      'read:entitlements',
      'write:licenses',
    ]);
    const business = await head('business');

    fireEvent.click(await within(business).findByRole('button', { name: i18n.t('AI.Pool.addons.through') }));
    expect(await screen.findByRole('dialog')).toHaveTextContent(i18n.t('AI.Pool.addons.unreadable.NO_SCOPE'));
  });

  it('explains it in the panel of a cell, with the add-ons', async () => {
    renderPricing({ pool: 'partner-ai-credits', cell: 'business~claude-sonnet-4-5' });
    const panel = await screen.findByRole('complementary');

    expect(panel).toHaveTextContent('does not grant Partner AI credits itself');
    expect(await within(panel).findByText('partner-credit-pack-v2')).toBeInTheDocument();
    expect(panel).not.toHaveTextContent('receive the pool another way');
  });
});

describe('who wrote a rule', () => {
  it('says who last edited it and who created it, with when', async () => {
    renderPricing({ cell: 'enterprise-v2~gpt-5-mini' });
    const panel = await screen.findByRole('complementary');

    expect(await within(panel).findByText(/^Last edited by Grace Hopper · /)).toBeInTheDocument();
    expect(within(panel).getByText(/^Created by E2E Tester · /)).toBeInTheDocument();
  });

  it('shows an edit by the person who created the rule as an edit', async () => {
    renderPricing({ cell: 'enterprise-v2~*' });
    const panel = await screen.findByRole('complementary');

    expect(await within(panel).findByText(/^Created by E2E Tester · Sep 15, 2026/)).toBeInTheDocument();
    expect(within(panel).getByText(/^Last edited by E2E Tester · Oct 28, 2026/)).toBeInTheDocument();
  });
});
