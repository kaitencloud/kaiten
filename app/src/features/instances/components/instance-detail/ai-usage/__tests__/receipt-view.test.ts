import { describe, expect, it } from 'vite-plus/test';
import { receiptAction } from '../receipt/receipt-links';
import { termsDiffer } from '../receipt/receipt-terms';
import { buildReceiptView } from '../receipt/receipt-view';
import { acme, legacy, models, older, POOL, ruleOf, snapshotOf, viewOf } from './receipt-world';

describe('charge receipt of an older row, without a snapshot', () => {
  it('003: charged 1.38, recomputed from the rule as it is now and matching', () => {
    const view = viewOf(older(3), { creditValue: '0.01' });

    expect(view.kind).toBe('COMMITTED');
    expect(view.matchedBy).toBe('EXTERNAL_ID');
    expect(view.pricing).toMatchObject({
      kind: 'MATCHES',
      specificity: 'EXACT_TYPED',
      price: { ok: true, computed: '1.38', charged: '1.38', clamp: null },
    });
    expect(view.effect).toEqual({ reserved: '2.15', givenBack: '0.77', drawnAbove: null });
    expect(view.cost).toMatchObject({ reported: null, computedSource: 'TODAY', drift: null });
    expect(view.licence).toEqual({ source: 'CURRENT', slug: 'enterprise-v2', id: null });
    expect(view.cost?.vendor.known).toBe(true);
    expect(view.cost?.costPerCredit).not.toBeNull();
    expect(view.cost?.margin).not.toBeNull();
  });

  it('016: computed 0.128, raised to the 0.5 minimum', () => {
    const view = viewOf(older(16));

    expect(view.inference.credits).toMatchObject({ computed: '0.128', charged: '0.5' });
    expect(view.pricing).toMatchObject({
      kind: 'MATCHES',
      price: { clamp: 'MINIMUM', charged: '0.5' },
    });
  });

  it('005: priced by the exact model for any request type', () => {
    expect(viewOf(older(5)).pricing).toMatchObject({
      kind: 'MATCHES',
      specificity: 'EXACT_ALL',
    });
  });

  it('014: priced through the completion wildcard, and links to its `any` cell', () => {
    const view = viewOf(older(14));

    expect(view.pricing).toMatchObject({ kind: 'MATCHES', specificity: 'ANY_TYPED' });
    expect(receiptAction(view)).toEqual({
      kind: 'OPEN_RULE',
      search: {
        pool: 'ai-credits',
        version: 'enterprise-v2',
        type: 'COMPLETION',
        cell: 'enterprise-v2~*',
      },
    });
  });

  it('007: a provider error the rule does not charge', () => {
    const view = viewOf(older(7));

    expect(view.inference.requestStatus).toBe('PROVIDER_ERROR');
    expect(view.pricing).toMatchObject({
      kind: 'MATCHES',
      price: { chargeable: false, charged: '0' },
    });
    expect(view.effect.givenBack).toBe('3.4');
  });

  it.each([
    [11, 'NO_RULE', 'PRICE_IT'],
    [8, 'UNKNOWN_MODEL', 'OPEN_MODELS'],
    [9, 'MODEL_ARCHIVED', 'OPEN_MODEL'],
  ] as const)('%s: not authorized (%s), 0 credits, no arithmetic', (n, reason, action) => {
    const view = viewOf(older(n));

    expect(view.kind).toBe('UNAUTHORIZED');
    expect(view.denialReason).toBe(reason);
    expect(view.pricing).toBeNull();
    expect(view.cost).toBeNull();
    expect(view.inference.credits.charged).toBe('0');
    expect(receiptAction(view)?.kind).toBe(action);
  });

  it('011: "Price it" opens the rate-card cell of the model on the version', () => {
    expect(receiptAction(viewOf(older(11)))).toEqual({
      kind: 'PRICE_IT',
      search: {
        pool: 'ai-credits',
        version: 'enterprise-v2',
        type: 'EMBEDDING',
        cell: 'enterprise-v2~voyage-3',
      },
    });
  });

  it('012: an expired reservation gives back its hold and is never priced', () => {
    const view = viewOf(older(12));

    expect(view.kind).toBe('EXPIRED');
    expect(view.pricing).toBeNull();
    expect(view.effect).toEqual({ reserved: '2.4', givenBack: '2.4', drawnAbove: null });
  });

  it('001: an open hold is not a charge', () => {
    expect(viewOf(older(1))).toMatchObject({ kind: 'OPEN', pricing: null, cost: null });
  });

  it('cannot reconstruct when the rule was edited after the commit', () => {
    const row = older(3);
    const rule = { ...ruleOf(row)!, updatedAt: '2026-11-11T09:39:00.000Z' };

    expect(viewOf(row, { rule }).pricing).toMatchObject({
      kind: 'CANNOT_RECONSTRUCT',
      reason: 'RULE_EDITED_AFTER_COMMIT',
    });
  });

  it('cannot reconstruct when the rule is not found', () => {
    expect(viewOf(older(3), { rule: null }).pricing).toMatchObject({
      kind: 'CANNOT_RECONSTRUCT',
      reason: 'RULE_NOT_FOUND',
    });
  });

  it('cannot reconstruct when the recomputation differs from the stored amounts', () => {
    const row = { ...older(3), credits: { ...older(3).credits, charged: '1.4', computed: '1.4' } };

    expect(viewOf(row).pricing).toMatchObject({
      kind: 'CANNOT_RECONSTRUCT',
      reason: 'AMOUNT_MISMATCH',
    });
  });

  it('a row with a pricing snapshot is read from the snapshot, and flags a rule edited since', () => {
    const row = older(3);
    const rule = ruleOf(row)!;
    const snapshot = snapshotOf(rule);
    const withSnapshot = { ...row, pricing: snapshot, licenseSlug: 'enterprise-v2' };
    const unchanged = viewOf(withSnapshot);

    expect(unchanged.pricing).toMatchObject({ kind: 'SNAPSHOT', agreesWithStored: true });
    expect(unchanged).toMatchObject({ ruleCompared: true, editedSince: false });
    expect(unchanged.licence).toMatchObject({ slug: 'enterprise-v2', source: 'ROW' });

    const edited = viewOf(withSnapshot, {
      rule: { ...rule, rates: { ...rule.rates, perOutputToken: '0.003' } },
    });
    expect(edited.pricing?.kind).toBe('SNAPSHOT');
    expect(edited.editedSince).toBe(true);
  });

  it('compares terms by value, not by spelling', () => {
    const terms = {
      rates: { perInputToken: '0.0004' },
      minimumCreditsPerRequest: '0.5',
      maximumCreditsPerRequest: null,
      chargeOnError: 'NEVER' as const,
    };

    expect(termsDiffer(terms, { ...terms, rates: { perInputToken: '0.00040' } })).toBe(false);
    expect(termsDiffer(terms, { ...terms, maximumCreditsPerRequest: '10' })).toBe(true);
  });
});

describe('charge receipt from the stored snapshot', () => {
  it('003: the snapshot is the authority, the rule is unchanged, the licence is the row’s', () => {
    const view = viewOf(acme(3), { creditValue: '0.01' });

    expect(view.pricing).toMatchObject({
      kind: 'SNAPSHOT',
      specificity: 'EXACT_TYPED',
      agreesWithStored: true,
      price: { ok: true, computed: '1.38', charged: '1.38' },
    });
    expect(view).toMatchObject({ ruleCompared: true, editedSince: false, currentTerms: null });
    expect(view.licence).toMatchObject({ source: 'ROW', slug: 'enterprise-v2' });
    expect(view.inference.reportSeq).toEqual(expect.any(Number));
  });

  it('003: shows the cost computed at commit, the reported one and how far apart they are', () => {
    const { cost } = viewOf(acme(3), { creditValue: '0.01' });

    expect(cost).toMatchObject({
      computed: '0.01035',
      computedSource: 'STORED',
      reported: '0.0118',
      drift: '0.00145',
      costPerCredit: '0.0075',
      margin: '0.25',
    });
  });

  it('013: reported and computed agree, so there is no difference to show', () => {
    expect(viewOf(acme(13)).cost).toMatchObject({ computed: '0.0095', reported: '0.0095', drift: null });
  });

  it('005: a commit that reported no vendor cost', () => {
    expect(viewOf(acme(5)).cost).toMatchObject({ computedSource: 'STORED', reported: null, drift: null });
  });

  it('004: the rule was edited since; the current values of what changed are kept beside', () => {
    const view = viewOf(acme(4));

    expect(view.pricing).toMatchObject({ kind: 'SNAPSHOT', agreesWithStored: true });
    expect(view.inference.pricing?.rates).toEqual({ perInputToken: '0.000025', perOutputToken: '0.0002' });
    expect(view.editedSince).toBe(true);
    expect(view.currentTerms).toEqual({
      rates: { perInputToken: '0.00003', perOutputToken: '0.00025' },
    });
  });

  it('says which terms changed: a rate dropped, a bound, the error policy', () => {
    const row = acme(3);
    const rule = ruleOf(row)!;
    const view = viewOf(row, {
      rule: {
        ...rule,
        rates: { ...rule.rates, perCacheWriteToken: null },
        maximumCreditsPerRequest: null,
        chargeOnError: 'ALWAYS',
      },
    });

    expect(view.currentTerms).toEqual({
      rates: { perCacheWriteToken: null },
      maximumCreditsPerRequest: null,
      chargeOnError: 'ALWAYS',
    });
  });

  it('a snapshot whose rule is gone is still the receipt; nothing is compared', () => {
    const view = viewOf(acme(3), { rule: null });

    expect(view.pricing?.kind).toBe('SNAPSHOT');
    expect(view).toMatchObject({ ruleCompared: false, editedSince: false });
  });

  it('a row whose licence was deleted names it by its id alone', () => {
    const { licenseSlug: _slug, ...row } = acme(3);

    expect(viewOf(row).licence).toEqual({ source: 'DELETED', slug: null, id: row.licenseId });
  });

  it('015: an unreadable snapshot falls back to the reconstruction, and carries the warning', () => {
    const view = viewOf(acme(15));

    expect(view.warnings).toEqual(['PRICING_SNAPSHOT_UNREADABLE']);
    expect(view.pricing).toMatchObject({ kind: 'MATCHES', specificity: 'ANY_TYPED' });
  });

  it('020 carries its warning; 019 is a release that closed no reservation', () => {
    expect(viewOf(acme(20)).warnings).toEqual(['COUNTER_PRECISION_DEGRADED']);
    expect(viewOf(acme(19))).toMatchObject({ kind: 'RELEASED', pricing: null, refund: null, warnings: ['NO_RESERVATION'] });
  });
});

describe('what the rule of a snapshot is today', () => {
  const row = acme(3);
  const rule = ruleOf(row)!;
  const after = new Date(Date.parse(row.committedAt!) + 60_000).toISOString();
  const before = new Date(Date.parse(row.committedAt!) - 60_000).toISOString();

  it('is unchanged only when it is active and was not written since the commit', () => {
    expect(viewOf(row, { rule: { ...rule, updatedAt: before } })).toMatchObject({ ruleToday: 'UNCHANGED', ruleCompared: true });
  });

  it('written since with the same terms: the same today, not "unchanged"', () => {
    const view = viewOf(row, { rule: { ...rule, updatedAt: after } });

    expect(view).toMatchObject({ ruleToday: 'SAME_TERMS', editedSince: false, currentTerms: null });
  });

  it('without a date to compare, nothing says it is unchanged', () => {
    const undated = { ...rule, updatedAt: undefined as unknown as string };

    expect(viewOf(row, { rule: undated }).ruleToday).toBe('SAME_TERMS');
  });

  it('archived since, whatever its terms: it prices nothing today, so no "now" value is shown', () => {
    const archived = { ...rule, status: 'ARCHIVED' as const, updatedAt: after, rates: { perInputToken: '9' } };

    expect(viewOf(row, { rule: archived })).toMatchObject({ ruleToday: 'ARCHIVED', editedSince: false, currentTerms: null });
  });

  it('edited, gone, and a row without a snapshot', () => {
    expect(viewOf(acme(4)).ruleToday).toBe('EDITED');
    expect(viewOf(row, { rule: null }).ruleToday).toBe('NOT_FOUND');
    expect(viewOf(older(3)).ruleToday).toBeNull();
  });
});

describe('a session that may read the row and nothing else', () => {
  it('003: the snapshot is the receipt; the rule is said unread, never unchanged or gone', () => {
    const view = viewOf(acme(3), { ruleUnread: true });

    expect(view.pricing).toMatchObject({ kind: 'SNAPSHOT', agreesWithStored: true });
    expect(view).toMatchObject({ ruleToday: 'UNREAD', ruleCompared: false, editedSince: false, currentTerms: null });
  });

  it('an older row is not reconstructed, and the reason is that the rule was not read', () => {
    expect(viewOf(older(3), { ruleUnread: true }).pricing).toMatchObject({ kind: 'CANNOT_RECONSTRUCT', reason: 'RULE_NOT_READ' });
  });

  it('003: without the catalogue no model is named, the stored cost stays, and the link uses the slug of the row', () => {
    const view = viewOf(acme(3), { catalogueUnread: true, creditValue: '0.01' });

    expect(view).toMatchObject({ model: null, matchedBy: null, catalogueUnread: true, knownSince: false });
    expect(view.cost).toMatchObject({ computed: '0.01035', computedSource: 'STORED', margin: '0.25' });
    expect(receiptAction(view)).toMatchObject({ kind: 'OPEN_RULE', search: { cell: 'enterprise-v2~claude-sonnet-4-5' } });
  });

  it('an older row without the catalogue has no cost to show', () => {
    expect(viewOf(older(3), { catalogueUnread: true }).cost).toBeNull();
  });
});

describe('a cost from today’s catalogue that covers part of the usage', () => {
  const inputOnly = models.map((model) =>
    model.slug === 'claude-sonnet-4-5' ? { ...model, vendorCosts: { currency: 'USD' as const, perInputToken: '0.000003' } } : model,
  );

  it('an older row: the cost is a floor, said partial, with no cost per credit and no margin', () => {
    const row = older(3);
    const { cost } = buildReceiptView({ inference: row, rule: ruleOf(row), models: inputOnly, pool: POOL, creditValue: '0.01' });

    expect(cost).toMatchObject({ computedSource: 'TODAY', partial: true, costPerCredit: null, margin: null });
    expect(cost?.computed).not.toBeNull();
  });

  it('a row that stores its cost is not judged by today’s catalogue', () => {
    const row = acme(3);
    const { cost } = buildReceiptView({ inference: row, rule: ruleOf(row), models: inputOnly, pool: POOL, creditValue: '0.01' });

    expect(cost).toMatchObject({ computedSource: 'STORED', partial: false, costPerCredit: '0.0075', margin: '0.25' });
  });
});

describe('the margin of a refunded charge', () => {
  it('017: is on what the charge kept, 48.5 of 78.5 credits', () => {
    const kept = viewOf(acme(17), { creditValue: '0.01' }).cost!;
    const { refunded: _refunded, ...credits } = acme(17).credits;
    const gross = viewOf({ ...acme(17), credits, refunds: [] }, { creditValue: '0.01' }).cost!;

    expect(kept.marginAfterRefunds).toBe(true);
    expect(gross.marginAfterRefunds).toBe(false);
    // Same vendor cost, less revenue: 1 − cost ÷ (48.5 × 0.01) against 1 − cost ÷ (78.5 × 0.01).
    expect(Number(kept.margin)).toBeLessThan(Number(gross.margin));
    expect(Number(kept.margin)).toBeCloseTo(1 - Number(kept.computed) / 0.485, 6);
  });

  it('a charge refunded in full keeps nothing to compute a margin on', () => {
    const row = acme(17);
    const view = viewOf({ ...row, credits: { ...row.credits, refunded: row.credits.charged } }, { creditValue: '0.01' });

    expect(view.cost).toMatchObject({ margin: null, marginAfterRefunds: true });
  });
});

describe('what a receipt can refund', () => {
  it('017: refunded 30 of 78.5, 48.5 left', () => {
    const { refund } = viewOf(acme(17));

    expect(refund).toMatchObject({ state: 'REFUNDABLE', charged: '78.5', refunded: '30', refundable: '48.5' });
    expect(refund?.refunds).toHaveLength(1);
    expect(refund?.refunds[0]).toMatchObject({ credits: '30', reason: 'Duplicate call after a client retry' });
  });

  it('003: nothing refunded yet, everything is left', () => {
    expect(viewOf(acme(3)).refund).toMatchObject({ state: 'REFUNDABLE', refunded: '0', refundable: '1.38', refunds: [] });
  });

  it('a charge refunded in full has nothing left', () => {
    const row = acme(17);
    const view = viewOf({ ...row, credits: { ...row.credits, refunded: '78.5' } });

    expect(view.refund).toMatchObject({ state: 'NOTHING_LEFT', refundable: '0' });
  });

  it('007: committed and charged nothing', () => {
    expect(viewOf(acme(7)).refund).toMatchObject({ state: 'NOT_CHARGED', refundable: '0' });
  });

  it.each([1, 8, 12])('%s: not a committed charge, so no refund at all', (n) => {
    expect(viewOf(acme(n)).refund).toBeNull();
  });

  it('an older row is refunded like any other', () => {
    expect(viewOf(legacy(acme(17))).refund?.state).toBe('REFUNDABLE');
  });
});

describe('an unknown model the catalogue has learnt since', () => {
  it('008: still unknown, so the name can be taught', () => {
    const view = viewOf(acme(8));

    expect(view).toMatchObject({ denialReason: 'UNKNOWN_MODEL', knownSince: false, model: null });
    expect(receiptAction(view)).toEqual({ kind: 'OPEN_MODELS' });
  });

  it('018, once its name is an external id of a model: the row stays refused, and says the name is known now', () => {
    const view = buildReceiptView({
      inference: acme(18),
      rule: null,
      models: models.map((model) =>
        model.slug === 'gpt-5-mini' ? { ...model, externalIds: ['gpt-5-mini-2025-08-07'] } : model,
      ),
      pool: POOL,
      creditValue: null,
    });

    expect(view).toMatchObject({ kind: 'UNAUTHORIZED', denialReason: 'UNKNOWN_MODEL', knownSince: true });
    expect(view.model?.slug).toBe('gpt-5-mini');
    expect(receiptAction(view)).toEqual({ kind: 'OPEN_MODEL', modelSlug: 'gpt-5-mini' });
  });
});
