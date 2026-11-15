import { expect, test } from '../_support/app-test';
import { AiUsageDriver } from '../_support/drivers/ai-usage.driver';
import { installAiWorldMocks } from '../_support/mocks/install-ai-app-mocks';
import { signInWithScopes } from '../_support/session-scopes';
import { createAiWorldModels } from './ai.scenarios';

// The charge receipt of a row of Acme Production's feed: the call, how it was
// priced, what it did to the pool and what it cost. A row with a snapshot shows
// the rates applied at commit; an older one is reconstructed from the rule as it
// is now, and says so.

const ACME = 'acme-production';

test.describe('the charge receipt', () => {
  test.beforeEach(async ({ page }) => {
    await installAiWorldMocks(page, createAiWorldModels());
  });

  test('reads a charge from its snapshot, with the vendor cost reported beside the computed one', async ({
    page,
  }) => {
    const usage = new AiUsageDriver(page);
    await usage.goto(ACME);
    await usage.openReceipt('txn_acme_003');
    await expect(page).toHaveURL(/[?&]receipt=txn_acme_003/);

    const call = usage.section('Call');
    await expect(call).toContainText('claude-sonnet-4-5-20250929');
    await expect(call).toContainText('Claude Sonnet 4.5');
    await expect(call).toContainText('matched by external ID');
    await expect(call).toContainText('Enterprise 2026');

    const priced = usage.section('How it was priced');
    await expect(priced).toContainText(
      'Rates as applied at commit, read from the inference row. The rule has not changed since.',
    );
    await expect(priced).toContainText('1,240 input × 0.0004');
    await expect(priced).toContainText('3,100 cache read × 0.00004');
    await expect(priced).toContainText('380 output × 0.002');
    await expect(priced).toContainText('1.38 credits');

    const pool = usage.section('What it did to the pool');
    await expect(pool).toContainText('183,420.50 / 275,000');

    const cost = usage.section('What it cost you');
    await expect(cost).toContainText('$0.0104');
    await expect(cost).toContainText('$0.0118');
    await expect(cost).toContainText('+$0.00145');
    await expect(cost).toContainText(
      'the integration reports more than the catalogue computes',
    );
    await expect(usage.receiptButton('Refund 1.38 credits…')).toBeVisible();
  });

  test('says when the rule was edited since the commit, beside each rate that changed', async ({
    page,
  }) => {
    const usage = new AiUsageDriver(page);
    await usage.goto(ACME, '?receipt=txn_acme_004');

    await expect(usage.receipt()).toContainText('Rule edited since');
    const priced = usage.section('How it was priced');
    await expect(priced).toContainText(
      'The rule has changed since this commit.',
    );
    // Applied at commit, then the value now.
    await expect(priced).toContainText(
      /Per input token0\.000025\s*now 0\.00003/,
    );
    await expect(priced).toContainText(
      /Per output token0\.0002\s*now 0\.00025/,
    );
    await expect(priced).toContainText('0.475 credits');
  });

  test('reconstructs an older row from the rule as it is now, and says it is not the snapshot', async ({
    page,
  }) => {
    const usage = new AiUsageDriver(page);
    await usage.goto(ACME, '?receipt=txn_acme_014');

    await expect(usage.section('Call')).toContainText(
      'current version; this older row does not store the version at commit',
    );
    await expect(usage.section('How it was priced')).toContainText(
      'Recomputed from the rule as it is now; it matches the stored amount. This older row does not store the rates applied at commit.',
    );
    await expect(usage.section('What it cost you')).toContainText('not stored');
  });

  test('shows a warning as a badge with its sentence', async ({ page }) => {
    const usage = new AiUsageDriver(page);
    await usage.goto(ACME, '?receipt=txn_acme_020');

    await expect(usage.section('Warnings')).toContainText(
      'Counter precision degraded',
    );
    await expect(usage.section('Warnings')).toContainText(
      'The charge on this receipt is exact; the counter is rounded.',
    );

    await usage.closeReceipt();
    await usage.openReceipt('txn_acme_015');
    await expect(usage.section('Warnings')).toContainText(
      'Stored rates unreadable',
    );
    await expect(usage.section('How it was priced')).toContainText(
      'Recomputed from the rule as it is now',
    );
  });

  test('explains a call refused for an unknown model, with nothing charged', async ({
    page,
  }) => {
    const usage = new AiUsageDriver(page);
    await usage.goto(ACME, '?receipt=txn_acme_008');

    await expect(usage.receipt()).toContainText('Unknown model');
    await expect(usage.section('Why it was not charged')).toContainText(
      'mistral-large-2411 is neither a model slug nor an external ID in the catalogue',
    );
    await expect(usage.section('What it did to the pool')).toContainText(
      'refused, nothing held',
    );
    await expect(usage.receiptButton(/^Refund/)).toHaveCount(0);
  });

  test('a tombstone is in the feed of released rows only, and its receipt says what happened', async ({
    page,
  }) => {
    const usage = new AiUsageDriver(page);
    await usage.goto(ACME);
    await expect(usage.feedRow('txn_acme_003')).toBeVisible();
    await expect(usage.feedRow('txn_acme_019')).toHaveCount(0);

    await usage.chooseFilter('Status', 'Released');
    await expect(usage.feedRow('txn_acme_019')).toBeVisible();
    await usage.openReceipt('txn_acme_019');

    await expect(usage.section('Warnings')).toContainText('No reservation');
    await expect(usage.section('What happened')).toContainText(
      'Nothing was held and nothing was charged',
    );
    await expect(usage.section('How it was priced')).toHaveCount(0);
  });

  test('a session that reads instances only gets the stored facts, and is told what was not read', async ({
    page,
  }) => {
    const asked: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (/\/api\/.*(conversion-rules|models)/.test(pathname)) {
        asked.push(pathname);
      }
    });
    // Signed in again, over the session of the `beforeEach`.
    await signInWithScopes(page, [
      'read:instances',
      'read:customers',
      'read:entitlements',
    ]);
    const usage = new AiUsageDriver(page);
    await usage.goto(ACME, '?receipt=txn_acme_003');

    const priced = usage.section('How it was priced');
    await expect(priced).toContainText(
      'This session may not read licences, so the rule as it is now was not read',
    );
    await expect(priced).toContainText('1,240 input × 0.0004');
    await expect(priced).toContainText('1.38 credits');
    const call = usage.section('Call');
    await expect(call).toContainText('claude-sonnet-4-5');
    await expect(call).toContainText(
      'not named: this session may not read the model catalogue',
    );
    await expect(usage.section('What it cost you')).toContainText('$0.0118');
    await expect(usage.receipt().getByRole('alert')).toHaveCount(0);
    await expect(usage.receiptButton(/^Refund/)).toHaveCount(0);
    // Neither the rule nor the catalogue is asked for: the API would refuse.
    expect(asked).toEqual([]);
  });
});
