import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import en from '@/lib/i18n/locales/en';
import type { WebhookHistoryEntry } from '../../../types';
import { deliveryFromHistoryEntry } from '../../../utils/webhook-deliveries';
import { WebhookDeliveryDetailDialog } from '../webhook-delivery-detail-dialog';

vi.mock('@/hooks/use-granted-scopes', () => ({
  useGrantedScopes: () => ({ isPending: false, scopes: null }),
}));

// An older saas-api: no message id, so the detail reads nothing.
const success: WebhookHistoryEntry = {
  date: '2026-11-25T10:00:00Z',
  hookId: 'ep_orders',
  hookUrl: 'https://api.example.com/hooks',
  eventType: 'com.kaiten.release.v1.created',
  status: 'success',
  responseStatusCode: 200,
  responseStatusText: 'ok',
};

function renderDialog(
  entry: WebhookHistoryEntry | null,
  onOpenChange = vi.fn(),
) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WebhookDeliveryDetailDialog
        delivery={entry ? deliveryFromHistoryEntry(entry) : null}
        onOpenChange={onOpenChange}
        open
      />
    </QueryClientProvider>,
  );
  return onOpenChange;
}

beforeAll(() => {
  i18n.addResourceBundle('en', 'translation', en, true, true);
});

describe('WebhookDeliveryDetailDialog', () => {
  it('opens for a successful delivery, named by its event', () => {
    renderDialog(success);

    const dialog = screen.getByRole('dialog', { name: 'Delivery details' });
    expect(dialog).toHaveAccessibleDescription(/^Release published at /);
    expect(screen.getByText('Response · attempt 1 of 1')).toBeInTheDocument();
  });

  it('stays closed without a delivery', () => {
    renderDialog(null);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks to close from its close button', async () => {
    const user = userEvent.setup();
    const onOpenChange = renderDialog(success);

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });
});
