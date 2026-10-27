import { act, screen, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Grant, Validity, Voucher } from '@/api-client';
import { handleGetEntitlementsUsageMetrics, handleGetUpcomingInvoice, handleRedeemVoucher, handleValidateVoucher } from '@/api-client/msw.gen';
import { server } from '@/__tests__/msw-server';
import { createTestClient, refusal, renderWithClient, useBillingTexts } from '@/test-fixtures/billing-test-support';
import { setAiAccessInputsForTest } from '@/test-fixtures/ai-access';
import { useRedeemVoucher } from '../../../../../../hooks/use-redeem-voucher';
import { RedeemVoucherVerdict } from '../redeem-voucher-verdict';
import { RedeemVoucherOutcome } from '../redeem-voucher-outcome';
import { BOOST_REDEMPTION, STORAGE_BOOST, upcoming, usageOf } from './vouchers-fixtures';

vi.mock('@/lib/auth-token', () => ({ getAuthToken: async () => null }));
useBillingTexts();
const entitlements = [
  { name: 'Storage', slug: 'storage-gb', type: 'NUMBER' as const },
  { name: 'AI pool', slug: 'ai-pool', type: 'NUMBER_AI_CREDIT' as const },
  { name: 'SSO', slug: 'sso', type: 'BOOLEAN' as const },
  { name: 'Settings', slug: 'settings', type: 'CONFIG' as const },
];
// Original discriminator if supplied by a read, not the normalized numeric grant value.
const aiGrant: Grant & { entitlementType: string } = { entitlementSlug: 'ai-pool', entitlementType: 'NUMBER_AI_CREDIT', modifierType: 'ADD', modifierValue: '999' };
const mixed: Voucher = { ...STORAGE_BOOST, voucherType: 'COMPOSITE', grants: [...STORAGE_BOOST.grants, aiGrant], priceDiscountType: 'PERCENTAGE', priceDiscountValue: '20', flagGrants: [{ flagSlug: 'preview', variant: 'on' }] };
let retained: ReturnType<typeof useRedeemVoucher>;
function Harness({ voucher = mixed, catalogue = entitlements }: { voucher?: Voucher; catalogue?: typeof entitlements }) {
  retained = useRedeemVoucher('instance', catalogue);
  return <>
    {retained.checked && <RedeemVoucherVerdict entitlements={catalogue} instanceName="Instance" validity={retained.checked.validity} />}
    {retained.outcome && <RedeemVoucherOutcome entitlements={catalogue} outcome={retained.outcome} />}
    {retained.failure ? <span data-testid="failure">refused</span> : null}
    <span data-testid="fixture-type">{voucher.voucherType}</span>
  </>;
}
const writes = vi.fn();
beforeEach(() => {
  writes.mockReset();
  server.use(
    handleValidateVoucher(() => HttpResponse.json({ valid: true, voucher: mixed } satisfies Validity)),
    handleRedeemVoucher(() => { writes(); return HttpResponse.json({ ...BOOST_REDEMPTION, voucherType: 'COMPOSITE' }, { status: 201 }); }),
    handleGetEntitlementsUsageMetrics(() => HttpResponse.json([usageOf('storage-gb', writes.mock.calls.length ? 100 : 50), usageOf('ai-pool', writes.mock.calls.length ? 1000 : 1)])),
    handleGetUpcomingInvoice(() => HttpResponse.json(writes.mock.calls.length ? upcoming(8000, 2000) : upcoming(10000))),
  );
});
function mount(enabled: boolean) {
  const client = createTestClient();
  setAiAccessInputsForTest(client, { capability: true, flag: enabled });
  return renderWithClient(<Harness />, client);
}
async function validate() { await act(async () => { await retained.check('mixed-code'); }); }
async function redeem() { await act(async () => { await retained.confirm(); }); }

describe('known AI voucher admission and live operational projections', () => {
  it('refuses the whole validated mixed boost/price/flag voucher with capability true and platform false', async () => {
    mount(false);
    await validate();
    expect(retained.checked).toBeNull();
    expect(screen.queryByTestId('redeem-verdict-valid')).not.toBeInTheDocument();
    await redeem();
    expect(writes).not.toHaveBeenCalled();
    expect(screen.queryByTestId('redeem-outcome')).not.toBeInTheDocument();
  });
  it('rechecks a retained confirmation before state reads after availability loss', async () => {
    const { client } = mount(true);
    await validate();
    const confirm = retained.confirm;
    const fetch = vi.spyOn(client, 'fetchQuery');
    await act(async () => setAiAccessInputsForTest(client, { capability: true, flag: false }));
    await waitFor(() => expect(retained.checked).toBeNull());
    await act(async () => { await confirm(); });
    expect(fetch).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
  });
  it('rechecks after asynchronous state reads, immediately before redemption', async () => {
    const { client } = mount(true);
    await validate();
    server.use(handleGetUpcomingInvoice(() => {
      setAiAccessInputsForTest(client, { capability: true, flag: false });
      return HttpResponse.json(upcoming(10000));
    }));
    await redeem();
    expect(writes).not.toHaveBeenCalled();
  });
  it('rechecks the automatic boundary retry rather than sending its retained AI mutation', async () => {
    const { client } = mount(true);
    await validate();
    server.use(handleRedeemVoucher(() => {
      writes();
      setAiAccessInputsForTest(client, { capability: true, flag: false });
      return refusal(409, { code: 'RedeemVoucher.BoundaryPending', detail: 'closing' }, { 'Retry-After': '0' });
    }));
    await redeem();
    expect(writes).toHaveBeenCalledOnce();
    expect(retained.failure).toBeInstanceOf(Error);
    expect(retained.outcome).toBeNull();
  });
  it('restores AI with both inputs and filters subsequent live deltas without changing financial evidence', async () => {
    const { client } = mount(true);
    await validate();
    expect(screen.getByTestId('redeem-verdict-valid')).toHaveTextContent('AI pool + 999');
    await redeem();
    expect(writes).toHaveBeenCalledOnce();
    expect(screen.getByTestId('redeem-outcome')).toHaveTextContent('AI pool: 1 → 1,000');
    const evidence = retained.outcome;
    await act(async () => setAiAccessInputsForTest(client, { capability: true, flag: false }));
    const outcome = screen.getByTestId('redeem-outcome');
    await waitFor(() => expect(outcome).not.toHaveTextContent('AI pool'));
    expect(outcome).toHaveTextContent('Storage: 50 → 100');
    expect(outcome).toHaveTextContent('preview: on');
    expect(screen.getByTestId('redeem-outcome-invoice')).toHaveTextContent('Before$100.00After$80.00Discount$20.00');
    expect(retained.outcome).toBe(evidence);
    expect(retained.outcome?.redemption).toEqual({ ...BOOST_REDEMPTION, voucherType: 'COMPOSITE' });
    await act(async () => setAiAccessInputsForTest(client, { capability: true, flag: true }));
    await waitFor(() => expect(outcome).toHaveTextContent('AI pool: 1 → 1,000'));
  });
  it('keeps a completed redemption and invoice truthful when access is lost during its response', async () => {
    const { client } = mount(true);
    await validate();
    server.use(handleRedeemVoucher(() => {
      writes();
      setAiAccessInputsForTest(client, { capability: true, flag: false });
      return HttpResponse.json({ ...BOOST_REDEMPTION, voucherType: 'COMPOSITE' }, { status: 201 });
    }));
    await redeem();
    expect(retained.outcome?.redemption.id).toBe(BOOST_REDEMPTION.id);
    expect(screen.getByTestId('redeem-outcome-invoice')).toHaveTextContent('After$80.00');
    expect(screen.getByTestId('redeem-outcome')).not.toHaveTextContent('AI pool');
  });
  it('filters the shared verdict while preserving ordinary price/flag parts and the raw grants', async () => {
    const client = createTestClient();
    setAiAccessInputsForTest(client, { capability: true, flag: true });
    renderWithClient(<RedeemVoucherVerdict entitlements={entitlements} instanceName="Instance" validity={{ valid: true, voucher: mixed }} />, client);
    expect(screen.getByTestId('redeem-verdict-valid')).toHaveTextContent('AI pool + 999');
    await act(async () => setAiAccessInputsForTest(client, { capability: true, flag: false }));
    const verdict = screen.getByTestId('redeem-verdict-valid');
    await waitFor(() => expect(verdict).not.toHaveTextContent('AI pool'));
    expect(verdict).toHaveTextContent('Storage + 50');
    expect(verdict).toHaveTextContent('20%');
    expect(verdict).toHaveTextContent('preview: on');
    expect(mixed.grants).toEqual([...STORAGE_BOOST.grants, aiGrant]);
  });
  it.each(['original', 'canonical'] as const)('classifies from the %s discriminator, not normalized numeric shape', async (source) => {
    const voucher = { ...mixed, grants: source === 'original' ? [aiGrant] : [{ entitlementSlug: 'ai-pool', modifierType: 'ADD' as const, modifierValue: '999' }] };
    server.use(handleValidateVoucher(() => HttpResponse.json({ valid: true, voucher })));
    const client = createTestClient();
    setAiAccessInputsForTest(client, { capability: true, flag: false });
    renderWithClient(<Harness voucher={voucher} catalogue={source === 'original' ? [] : entitlements} />, client);
    await validate();
    await redeem();
    expect(writes).not.toHaveBeenCalled();
    expect(retained.checked).toBeNull();
  });
  it('does not classify ordinary BOOLEAN/CONFIG grants from arbitrary JSON keys or values', async () => {
    const voucher: Voucher = { ...STORAGE_BOOST, voucherType: 'COMPOSITE', grants: [
      { entitlementSlug: 'sso', modifierType: 'SET', value: false },
      { entitlementSlug: 'settings', modifierType: 'SET', value: { type: 'NUMBER_AI_CREDIT', entitlementType: 'NUMBER_AI_CREDIT', ai_usage: 'ordinary configuration' } },
    ] };
    server.use(handleValidateVoucher(() => HttpResponse.json({ valid: true, voucher })));
    mount(false);
    await validate();
    expect(retained.checked?.validity.voucher?.grants).toEqual(voucher.grants);
    await redeem();
    expect(writes).toHaveBeenCalledOnce();
  });
  it('keeps an ordinary numeric BOOST redeemable off, without requiring catalogue-read scopes', async () => {
    server.use(handleValidateVoucher(() => HttpResponse.json({ valid: true, voucher: STORAGE_BOOST })));
    mount(false);
    await validate();
    expect(retained.checked?.validity.valid).toBe(true);
    await redeem();
    expect(writes).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByTestId('redeem-outcome')).toHaveTextContent('Storage: 50 → 100'));
    expect(screen.getByTestId('redeem-outcome')).not.toHaveTextContent('AI pool');
  });
});
