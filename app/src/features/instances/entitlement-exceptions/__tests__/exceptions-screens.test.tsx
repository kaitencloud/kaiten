import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { EntitlementException, EntitlementUsage, NewEntitlementException } from '@/api-client';
import { handleCreateEntitlementException, handleGetEntitlementsUsageMetrics, handleListEntitlementExceptions, handleRevokeEntitlementException } from '@/api-client/msw.gen';
import { server } from '@/__tests__/msw-server';
import { renderWithClient, useBillingTexts } from '@/test-fixtures/billing-test-support';
import { buildEntitlement } from '../../../../../e2e/app/_support/fixtures';
import { ExceptionsCard } from '../exceptions-card';
import { CreateExceptionDialog } from '../create-exception-dialog';
import { EndExceptionDialog } from '../end-exception-dialog';

const SSO = buildEntitlement({ name: 'SSO', slug: 'sso', type: 'BOOLEAN' });
const seats = buildEntitlement({ name: 'Seats', slug: 'seats', type: 'NUMBER' });
const row: EntitlementException = { id: 'exception-1', instanceSlug: 'test', entitlementSlug: 'sso', entitlementType: 'BOOLEAN', kind: 'SET', value: false, startsAt: '2026-10-01T00:00:00Z', endsAt: null, reason: 'Private reason', status: 'ACTIVE', createdAt: '2026-10-01T00:00:00Z', revokedAt: null };
const usage: EntitlementUsage = { entitlementId: SSO.id, entitlementSlug: 'sso', licenseId: 'license', licenseSlug: 'pro', source: 'license', value: { type: 'boolean', value: true }, limit: { type: 'boolean', value: true } };
const access = vi.hoisted(() => ({ scopes: null as string[] | null, isPending: false }));

vi.mock('../../components/instance-detail/instance-detail-context', () => ({
  useInstanceDetail: () => ({ instance: { id: 'test', slug: 'test', name: 'Test' }, entitlements: [SSO, seats] }),
}));
vi.mock('@/domains/billing', async (original) => ({ ...await original<typeof import('@/domains/billing')>(), useGrantedScopes: () => access }));
vi.mock('@tanstack/react-router', async (original) => ({
  ...await original<typeof import('@tanstack/react-router')>(),
  Link: ({ children, to, params = {}, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode; to: string; params?: Record<string, string> }) => <a href={Object.entries(params).reduce((path, [name, value]) => path.replace(`$${name}`, value), to)} {...props}>{children}</a>,
}));
useBillingTexts();

beforeEach(() => {
  access.scopes = null;
  server.use(handleListEntitlementExceptions(() => HttpResponse.json([row])), handleGetEntitlementsUsageMetrics(() => HttpResponse.json([usage])));
});

describe('the exception screens', () => {
  it('requests filter=all, names the entitlement and keeps the reason in the vendor panel', async () => {
    const filters: Array<string | null> = [];
    server.use(handleListEntitlementExceptions(({ request }) => { filters.push(new URL(request.url).searchParams.get('filter')); return HttpResponse.json([row]); }));
    renderWithClient(<ExceptionsCard />);
    expect(await screen.findByText('Private reason')).toBeInTheDocument();
    expect(screen.getByText('SSO', { exact: true })).toBeInTheDocument();
    expect(filters).toContain('all');
    expect(screen.getByRole('link', { name: 'Create an exception' })).toBeInTheDocument();
  });
  it('hides writes from an instance reader', async () => {
    access.scopes = ['read:instances'];
    renderWithClient(<ExceptionsCard />);
    await screen.findByText('Private reason');
    expect(screen.queryByRole('link', { name: 'Create an exception' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'End exception' })).not.toBeInTheDocument();
  });
  it('warns before disabling a BOOLEAN, sends false and refreshes the effective view', async () => {
    const asked: NewEntitlementException[] = [];
    const saved = vi.fn();
    let reads = 0;
    server.use(handleGetEntitlementsUsageMetrics(() => { reads++; return HttpResponse.json([usage]); }), handleCreateEntitlementException(async ({ request }) => { asked.push(await request.json()); return HttpResponse.json(row, { status: 201 }); }));
    renderWithClient(<CreateExceptionDialog onClose={saved} />);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: /^Entitlement/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'SSO' }));
    expect(await screen.findByTestId('exception-lowers-warning')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), 'Pilot');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create exception' }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(asked).toEqual([{ entitlementSlug: 'sso', kind: 'SET', value: false, reason: 'Pilot' }]);
    expect(reads).toBeGreaterThanOrEqual(2);
  });
  it('retrieves a conflicting exception by the response id', async () => {
    server.use(handleCreateEntitlementException(() => HttpResponse.json({ code: 'CreateEntitlementException.Overlap', detail: 'Overlap', errors: [{ value: { exceptionId: row.id } }] }, { status: 409 })));
    renderWithClient(<CreateExceptionDialog onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: /^Entitlement/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'SSO' }));
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), 'Overlap pilot');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create exception' }));
    expect(await screen.findByRole('link', { name: 'Review the existing exception' })).toHaveAttribute('href', '/customers/instances/test/entitlements/exceptions/exception-1/revoke');
  });
  it('ends once and waits for invalidation before closing', async () => {
    const saved = vi.fn(); const writes = vi.fn();
    server.use(handleRevokeEntitlementException(() => { writes(); return new HttpResponse(null, { status: 204 }); }));
    renderWithClient(<EndExceptionDialog exceptionId={row.id} onClose={saved} />);
    const button = await screen.findByRole('button', { name: 'End exception' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.dblClick(button);
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(writes).toHaveBeenCalledOnce();
  });
});
