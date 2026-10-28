import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { EntitlementException, EntitlementUsage, NewEntitlementException } from '@/api-client';
import { handleCreateEntitlementException, handleGetEntitlementsUsageMetrics, handleListEntitlementExceptions, handleRevokeEntitlementException } from '@/api-client/msw.gen';
import { server } from '@/__tests__/msw-server';
import { createTestClient, renderWithClient, useBillingTexts } from '@/test-fixtures/billing-test-support';
import { setAiAccessInputsForTest } from '@/test-fixtures/ai-access';
import { useExceptionForm } from '../use-exception-form';
import { buildEntitlement } from '../../../../../e2e/app/_support/fixtures';
import { ExceptionsCard } from '../exceptions-card';
import { CreateExceptionDialog } from '../create-exception-dialog';
import { EndExceptionDialog } from '../end-exception-dialog';

const SSO = buildEntitlement({ name: 'SSO', slug: 'sso', type: 'BOOLEAN' });
const seats = buildEntitlement({ name: 'Seats', slug: 'seats', type: 'NUMBER' });
const config = buildEntitlement({ name: 'Settings', slug: 'settings', type: 'CONFIG' });
const pool = buildEntitlement({ name: 'AI pool', slug: 'ai-pool', type: 'NUMBER_AI_CREDIT' });
const row: EntitlementException = { id: 'exception-1', instanceSlug: 'test', entitlementSlug: 'sso', entitlementType: 'BOOLEAN', kind: 'SET', value: false, startsAt: '2026-10-01T00:00:00Z', endsAt: null, reason: 'Private reason', status: 'ACTIVE', createdAt: '2026-10-01T00:00:00Z', revokedAt: null };
const usage: EntitlementUsage = { entitlementId: SSO.id, entitlementSlug: 'sso', licenseId: 'license', licenseSlug: 'pro', source: 'license', value: { type: 'boolean', value: true }, limit: { type: 'boolean', value: true } };
const access = vi.hoisted(() => ({ scopes: null as string[] | null, isPending: false }));
const ai = vi.hoisted(() => ({ available: false, isPending: false }));
vi.mock('@/components/theme-provider', () => ({ useTheme: () => ({ theme: 'dark' }) }));
vi.mock('@/domains/ai-credits', async (original) => ({
  ...await original<typeof import('@/domains/ai-credits')>(), useAiAccess: () => ai,
}));

vi.mock('../../components/instance-detail/instance-detail-context', () => ({
  useInstanceDetail: () => ({ instance: { id: 'test', slug: 'test', name: 'Test' }, entitlements: [SSO, seats, pool, config] }),
}));
vi.mock('@/domains/billing', async (original) => ({ ...await original<typeof import('@/domains/billing')>(), useGrantedScopes: () => access }));
vi.mock('@tanstack/react-router', async (original) => ({
  ...await original<typeof import('@tanstack/react-router')>(),
  Link: ({ children, to, params = {}, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode; to: string; params?: Record<string, string> }) => <a href={Object.entries(params).reduce((path, [name, value]) => path.replace(`$${name}`, value), to)} {...props}>{children}</a>,
}));
useBillingTexts();

beforeEach(() => {
  access.scopes = null;
  ai.available = false;
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


describe('AI exception rollout visibility', () => {
  const aiRow: EntitlementException = {
    ...row, id: 'ai-exception', entitlementSlug: 'ai-pool',
    entitlementType: 'NUMBER_AI_CREDIT', value: 10, reason: 'AI operational exception',
  };
  it('keeps ordinary exceptions while hiding existing AI rows and actions off', async () => {
    server.use(handleListEntitlementExceptions(() => HttpResponse.json([row, aiRow])));
    renderWithClient(<ExceptionsCard />);
    await screen.findByText('Private reason');
    expect(screen.queryByText('AI operational exception')).not.toBeInTheDocument();
    expect(screen.getByText('SSO', { exact: true })).toBeInTheDocument();
  });
  it('does not offer AI targets in the ordinary exception picker off', async () => {
    renderWithClient(<CreateExceptionDialog onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: /^Entitlement/ }));
    expect(await screen.findByRole('option', { name: 'SSO' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Seats' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'AI pool' })).not.toBeInTheDocument();
  });
  it('does not expose or revoke an AI target through a directly mounted dialog off', async () => {
    const writes = vi.fn();
    server.use(handleListEntitlementExceptions(() => HttpResponse.json([aiRow])),
      handleRevokeEntitlementException(() => { writes(); return new HttpResponse(null, { status: 204 }); }));
    renderWithClient(<EndExceptionDialog exceptionId={aiRow.id} onClose={vi.fn()} />);
    await screen.findByRole('alert');
    expect(screen.queryByText(/AI operational exception/)).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'End exception' });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(writes).not.toHaveBeenCalled();
  });
  it('shows the original-type AI exception when rollout availability is enabled', async () => {
    ai.available = true;
    server.use(handleListEntitlementExceptions(() => HttpResponse.json([aiRow])));
    renderWithClient(<ExceptionsCard />);
    expect(await screen.findByText('AI operational exception')).toBeInTheDocument();
    expect(screen.getByText('AI pool', { exact: true })).toBeInTheDocument();
  });
});


describe('retained AI exception drafts after availability loss', () => {
  it('hides the selection, kind, value and warning without losing the draft; restores it on enable', async () => {
    ai.available = true;
    const client = createTestClient();
    setAiAccessInputsForTest(client, { capability: true, flag: true });
    const writes = vi.fn();
    server.use(handleGetEntitlementsUsageMetrics(() => HttpResponse.json([{ ...usage, entitlementSlug: 'ai-pool', limit: { type: 'number', value: 100 } }])),
      handleCreateEntitlementException(() => { writes(); return HttpResponse.json(row, { status: 201 }); }));
    const rendered = renderWithClient(<CreateExceptionDialog onClose={vi.fn()} />, client);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: /^Entitlement/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'AI pool' }));
    await userEvent.type(within(dialog).getByLabelText(/^Value/), '10');
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), 'Retained pilot');
    expect(await screen.findByTestId('exception-lowers-warning')).toBeInTheDocument();
    await act(async () => {
      ai.available = false;
      setAiAccessInputsForTest(client, { capability: true, flag: false });
      rendered.rerender(<CreateExceptionDialog onClose={vi.fn()} />);
    });
    expect(within(dialog).getByRole('combobox', { name: /^Entitlement/ })).not.toHaveTextContent('ai-pool');
    expect(within(dialog).getByRole('combobox', { name: /^Entitlement/ })).not.toHaveTextContent('AI pool');
    expect(within(dialog).queryByRole('combobox', { name: /^Operation/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/^Value/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('exception-lowers-warning')).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create exception' }));
    await screen.findByRole('alert');
    expect(writes).not.toHaveBeenCalled();
    await act(async () => {
      ai.available = true;
      setAiAccessInputsForTest(client, { capability: true, flag: true });
      rendered.rerender(<CreateExceptionDialog onClose={vi.fn()} />);
    });
    expect(within(dialog).getByLabelText(/^Value/)).toHaveValue('10');
    expect(within(dialog).getByLabelText(/^Reason/)).toHaveValue('Retained pilot');
    expect(within(dialog).getByRole('combobox', { name: /^Entitlement/ })).toHaveTextContent('AI pool');
    expect(screen.getByTestId('exception-lowers-warning')).toBeInTheDocument();
  });
  it.each(['SSO', 'Seats', 'Settings'])('keeps the ordinary %s picker and controls usable after hiding a retained AI choice', async (name) => {
    ai.available = true;
    const rendered = renderWithClient(<CreateExceptionDialog onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: /^Entitlement/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'AI pool' }));
    ai.available = false;
    rendered.rerender(<CreateExceptionDialog onClose={vi.fn()} />);
    await userEvent.click(within(dialog).getByRole('combobox', { name: /^Entitlement/ }));
    expect(screen.queryByRole('option', { name: 'AI pool' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('option', { name }));
    expect(await within(dialog).findByRole('combobox', { name: /^Operation/ })).toBeInTheDocument();
    if (name === 'Settings') {
      await waitFor(() => expect(dialog.querySelector('.cm-editor')).toBeInTheDocument());
      expect(within(dialog).getByText('Value', { exact: true })).toBeInTheDocument();
    } else if (name === 'SSO') expect(await within(dialog).findByRole('switch', { name: 'Value' })).toBeInTheDocument();
    else expect(await within(dialog).findByLabelText(/^Value/)).toBeInTheDocument();
  });
  it('blocks a retained submit callback using the canonical AI target even if draft type says NUMBER', async () => {
    const client = createTestClient();
    setAiAccessInputsForTest(client, { capability: true, flag: true });
    const writes = vi.fn();
    server.use(handleCreateEntitlementException(() => { writes(); return HttpResponse.json(row, { status: 201 }); }));
    let held!: ReturnType<typeof useExceptionForm>;
    function Harness() { held = useExceptionForm('test', vi.fn(), [pool]); return null; }
    renderWithClient(<Harness />, client);
    await act(async () => {
      held.form.setFieldValue('entitlementSlug', 'ai-pool');
      held.form.setFieldValue('entitlementType', 'NUMBER');
      held.form.setFieldValue('valueText', '10');
      held.form.setFieldValue('reason', 'Retained callback');
    });
    const submit = held.form.handleSubmit;
    await act(async () => {
      setAiAccessInputsForTest(client, { capability: true, flag: false });
      await submit();
    });
    expect(writes).not.toHaveBeenCalled();
    expect(held.failure).toBeInstanceOf(Error);
  });
});
