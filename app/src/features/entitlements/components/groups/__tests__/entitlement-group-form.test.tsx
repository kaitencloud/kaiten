import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw/http';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { EntitlementGroup } from '@/api-client';
import {
  handleGetEntitlementGroup,
  handleListEntitlementGroups,
  handleUpdateEntitlementGroup,
} from '@/api-client/msw.gen';
import {
  createTestClient,
  renderWithClient,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { EntitlementGroupForm } from '../entitlement-group-form';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('sonner', () => ({ toast }));

useBillingTexts();

const opened = {
  createdAt: '2026-03-01T09:00:00.000Z',
  description: 'Everything metered',
  id: 'group-usage',
  name: 'Usage',
  slug: 'usage',
  updatedAt: '2026-03-01T09:00:00.000Z',
} as EntitlementGroup;

let stored: EntitlementGroup;
let updates: unknown[];

beforeEach(() => {
  toast.error.mockReset();
  stored = opened;
  updates = [];
  server.use(
    handleGetEntitlementGroup(() => HttpResponse.json(stored)),
    handleListEntitlementGroups({ body: { hasMore: false, items: [] } }),
    handleUpdateEntitlementGroup(async ({ request }) => {
      updates.push(await request.json());

      return new HttpResponse(null, { status: 204 });
    }),
  );
});

const renderForm = () => {
  const onSuccess = vi.fn();
  renderWithClient(
    <EntitlementGroupForm group={opened} onSuccess={onSuccess} />,
    createTestClient(),
  );

  return onSuccess;
};

const save = () =>
  userEvent.click(screen.getByRole('button', { name: 'Update Group' }));

describe('the form that edits an entitlement group', () => {
  it('sends the name on top of the group as the API holds it, and gives back what was sent', async () => {
    const onSuccess = renderForm();
    const name = await screen.findByLabelText(/^Name/);

    // Another tab rewrote the description after the form opened.
    stored = { ...opened, description: 'Edited in another tab' };
    await userEvent.clear(name);
    await userEvent.type(name, 'Usage quotas');
    await save();

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(updates).toEqual([
      { description: 'Edited in another tab', name: 'Usage quotas' },
    ]);
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Edited in another tab',
        name: 'Usage quotas',
        slug: 'usage',
      }),
    );
  });

  it('says the group is gone when it was deleted meanwhile, and writes nothing', async () => {
    const onSuccess = renderForm();
    const name = await screen.findByLabelText(/^Name/);
    server.use(
      handleGetEntitlementGroup(() =>
        HttpResponse.json(
          { detail: 'The group does not exist', status: 404 },
          { status: 404 },
        ),
      ),
    );

    await userEvent.type(name, ' quotas');
    await save();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('The group does not exist'),
    );
    expect(updates).toEqual([]);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
