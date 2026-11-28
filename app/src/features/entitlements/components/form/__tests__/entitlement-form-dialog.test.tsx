import { setAiAccessInputsForTest } from '@/test-fixtures/ai-access';
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import { server } from '@/__tests__/msw-server';
import type { Entitlement } from '@/api-client';
import { handleListEntitlementGroups, handleListEntitlements } from '@/api-client/msw.gen';
import { HttpResponse } from 'msw/http';
import en from '@/lib/i18n/locales/en';
import '@/lib/api/bootstrap';
import { EntitlementFormDialog } from '../entitlement-form-dialog';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
  useRouter: () => ({ navigate: vi.fn() }),
}));

const entitlement: Entitlement = {
  aggregationMethod: 'SUM', warningThresholdPercent: 70,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  description: 'Original description', id: 'credits', name: 'AI credits', slug: 'credits', type: 'NUMBER_AI_CREDIT',
};

beforeEach(() => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  void testI18n.changeLanguage('en');
  server.use(handleListEntitlementGroups({ body: { hasMore: false, items: [] } }));
});

function DialogHarness({ onClose, definition = entitlement }: { onClose: () => void; definition?: Entitlement }) {
  const [open, setOpen] = useState(true);
  const client = useState(() => {
    const current = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    if (definition.type === 'NUMBER_AI_CREDIT') setAiAccessInputsForTest(current, { capability: true, flag: true });
    return current;
  })[0];
  function changeOpen(next: boolean) { setOpen(next); if (!next) onClose(); }
  return <QueryClientProvider client={client}><EntitlementFormDialog open={open} onOpenChange={changeOpen} entitlement={definition} /></QueryClientProvider>;
}

describe('AI entitlement dialog discard protection', () => {
  it('closes a pristine form without a discard prompt', async () => {
    const person = userEvent.setup(); const onClose = vi.fn();
    render(<DialogHarness onClose={onClose} />);
    await person.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  it('keeps changed input until the user explicitly discards it', async () => {
    const person = userEvent.setup(); const onClose = vi.fn();
    render(<DialogHarness onClose={onClose} />);
    const description = await screen.findByLabelText('Description');
    await person.clear(description); await person.type(description, 'Unsaved credit settings');
    await person.click(screen.getByRole('button', { name: 'Cancel' }));
    const prompt = await screen.findByRole('alertdialog');
    expect(onClose).not.toHaveBeenCalled();
    await person.click(within(prompt).getByRole('button', { name: 'Cancel' }));
    expect(description).toHaveValue('Unsaved credit settings');
    await person.click(screen.getByRole('button', { name: 'Cancel' }));
    await person.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: en.Common.discardFormChangesConfirm }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
  it('closes without prompting when the original values are restored', async () => {
    const person = userEvent.setup(); const onClose = vi.fn();
    render(<DialogHarness onClose={onClose} />);
    const description = await screen.findByLabelText('Description');
    await person.clear(description); await person.type(description, 'Temporary');
    await person.clear(description); await person.type(description, entitlement.description!);
    await person.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  it('protects changed input when Escape closes the dialog', async () => {
    const person = userEvent.setup(); const onClose = vi.fn();
    render(<DialogHarness onClose={onClose} />);
    await person.type(await screen.findByLabelText('Description'), ' changed');
    await person.keyboard('{Escape}');
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ordinary entitlement dialogs retain their existing dismissal', () => {
  it.each(['BOOLEAN', 'NUMBER', 'CONFIG'] as const)('%s closes changed input on Cancel without an AI discard prompt', async (type) => {
    const person = userEvent.setup(); const onClose = vi.fn();
    render(<DialogHarness onClose={onClose} definition={{ ...entitlement, type }} />);
    await person.type(await screen.findByLabelText('Description'), ' changed');
    await person.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  it.each(['BOOLEAN', 'NUMBER', 'CONFIG'] as const)('%s closes changed input on Escape without an AI discard prompt', async (type) => {
    const person = userEvent.setup(); const onClose = vi.fn();
    render(<DialogHarness onClose={onClose} definition={{ ...entitlement, type }} />);
    await person.type(await screen.findByLabelText('Description'), ' changed');
    await person.keyboard('{Escape}');
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('the dialog of a combined entitlement', () => {
  const combined: Entitlement = {
    ...entitlement, type: 'NUMBER', id: 'total', name: 'Total', slug: 'total', usageSource: 'COMBINED_USAGE',
    resetAnchor: 'CALENDAR', resetPeriod: 'MONTH', warningThresholdPercent: 0,
    sources: [{ entitlementSlug: 'ai-credits', weight: '0.6' }, { entitlementSlug: 'firecrawl-credits', weight: '0.4' }],
  };
  const source = (slug: string, name: string): Entitlement => ({
    ...entitlement, type: 'NUMBER', id: slug, name, slug, resetAnchor: 'CALENDAR', resetPeriod: 'MONTH',
  });

  it('fixes where the usage comes from, keeps the sources open and asks for no window of its own', async () => {
    server.use(handleListEntitlements(() => HttpResponse.json({
      hasMore: false, items: [source('ai-credits', 'AI Credits'), source('firecrawl-credits', 'Firecrawl Credits'), combined],
    })));
    const person = userEvent.setup();
    render(<DialogHarness onClose={vi.fn()} definition={combined} />);

    await person.click(await screen.findByRole('button', { name: 'Next' }));

    expect(await screen.findByRole('combobox', { name: /^Usage source/ })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /^Usage source/ })).toHaveTextContent('Combined');
    expect(await screen.findAllByRole('group', { name: /^Source \d+$/ })).toHaveLength(2);
    expect(within(screen.getByRole('group', { name: 'Source 1' })).getByLabelText('Weight')).toHaveValue('0.6');
    expect(within(screen.getByRole('group', { name: 'Source 2' })).getByLabelText('Weight')).toHaveValue('0.4');
    // The window is the sources', said and not asked.
    expect(screen.getByTestId('combined-window')).toHaveTextContent('Every month');
    expect(screen.queryByRole('combobox', { name: /^Reset period/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('combined-revalue-hint')).not.toBeInTheDocument();
  });
});
