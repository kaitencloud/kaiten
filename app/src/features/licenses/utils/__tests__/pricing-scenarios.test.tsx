import { expect, it, vi } from 'vite-plus/test';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PriceMeterPicker, getMeterOptions } from '@/domains/billing';
import { createTestClient, renderWithClient, useBillingTexts } from '@/test-fixtures/billing-test-support';
import { setAiAccessInputsForTest } from '@/test-fixtures/ai-access';
import {
  createAiMeterCatalogModel,
  createBilledCatalogModel,
  createDraftPricesModel,
  createFreeDraftModel,
  createPricedCatalogModel,
  createTwoFlatFeesModel,
} from '../../../../../e2e/app/licenses/licenses.scenarios';
import { assertCopiableGrants } from '../ai-grant-preflight';
import { resolveLicenseEntitlements } from '../license-entitlements.utils';

it.each([
  createPricedCatalogModel,
  createBilledCatalogModel,
  createDraftPricesModel,
  createFreeDraftModel,
  createTwoFlatFeesModel,
])('keeps %s ordinary while AI is off, including unlimited Credits and copy preflights', (factory) => {
  const model = factory();
  const catalogue = model.listEntitlements();
  expect(catalogue.find((entitlement) => entitlement.slug === 'credits')).toMatchObject({
    type: 'NUMBER', aggregationMethod: 'SUM', resetPeriod: 'MONTH',
  });
  expect(catalogue.some((entitlement) => entitlement.type === 'NUMBER_AI_CREDIT')).toBe(false);
  const grants = model.listGrants('pro-v4');
  expect(grants.find((grant) => grant.entitlementSlug === 'credits')?.value).toMatchObject({ type: 'number', value: -1 });
  expect(() => assertCopiableGrants(resolveLicenseEntitlements(grants, catalogue), catalogue, false)).not.toThrow();
});

it('gives dedicated AI meter coverage its own original type and preserves off-state copy denial', () => {
  const model = createAiMeterCatalogModel();
  const catalogue = model.listEntitlements();
  expect(catalogue.find((entitlement) => entitlement.slug === 'credits')?.type).toBe('NUMBER');
  expect(catalogue.find((entitlement) => entitlement.slug === 'ai-credits')).toMatchObject({
    type: 'NUMBER_AI_CREDIT', aggregationMethod: 'SUM', resetPeriod: 'MONTH',
  });
  const rows = resolveLicenseEntitlements(model.listGrants('pro-v4'), catalogue);
  expect(rows.find((row) => row.catalogueEntitlementType === 'NUMBER_AI_CREDIT')).toMatchObject({ entitlementType: 'NUMBER' });
  expect(() => assertCopiableGrants(rows, catalogue, false)).toThrow('AIUsage.Disabled');
  expect(() => assertCopiableGrants(rows, catalogue, true)).not.toThrow();
});

useBillingTexts();

it.each([
  { capability: false, flag: false },
  { capability: true, flag: false },
  { capability: false, flag: true },
  { capability: true, flag: true },
])('keeps ordinary meters for inputs %j and only offers AI when both are true', async (inputs) => {
  const model = createAiMeterCatalogModel();
  const client = createTestClient();
  setAiAccessInputsForTest(client, inputs);
  const onSelect = vi.fn();
  renderWithClient(<PriceMeterPicker
    model="USAGE_BASED" onSelect={onSelect} value=""
    options={getMeterOptions({ entitlements: model.listEntitlements(), grants: model.listGrants('pro-v4'), model: 'USAGE_BASED', overage: 'license', prices: [] })}
  />, client);
  expect(screen.getByRole('button', { name: /^Credits/ })).toBeEnabled();
  const ai = screen.queryByRole('button', { name: /^AI credits/ });
  if (inputs.capability && inputs.flag) {
    expect(ai).toBeEnabled();
    await userEvent.click(ai!);
    expect(onSelect).toHaveBeenCalledWith('ai-credits');
  } else {
    expect(ai).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Credits/ }));
    expect(onSelect).toHaveBeenCalledWith('credits');
  }
});
