import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw/http';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { ManagedUser } from '@/api-client';
import { handleGetUser, handleUpdateUser } from '@/api-client/msw.gen';
import '@/lib/api/bootstrap';
import '@/lib/i18n/config';
import { ProfileForm } from './profile-form';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('sonner', () => ({ toast }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), track: vi.fn(), warn: vi.fn() },
}));

const opened: ManagedUser = {
  authorization: { enabled: true, permissions: [], roles: ['support'] },
  createdAt: '2026-10-22T00:00:00Z',
  email: 'alex@example.com',
  externalId: 'external-alex',
  id: 'person',
  name: 'Alex',
};

let stored: ManagedUser;
let updates: unknown[];

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
  stored = opened;
  updates = [];
  server.use(
    handleGetUser(() => HttpResponse.json(stored)),
    handleUpdateUser(async ({ request }) => {
      updates.push(await request.json());

      return new HttpResponse(null, { status: 204 });
    }),
  );
});

const renderForm = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            mutations: { retry: false },
            queries: { retry: false },
          },
        })
      }
    >
      <ProfileForm onStateChange={vi.fn()} user={opened} />
    </QueryClientProvider>,
  );

const save = () =>
  userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

describe('the profile of a user', () => {
  it('sends the name on top of the user as the API holds it now', async () => {
    renderForm();
    const name = await screen.findByRole('textbox', { name: 'Name' });

    // Another tab changed the e-mail after the form opened.
    stored = { ...opened, email: 'alex@acme.test' };
    await userEvent.clear(name);
    await userEvent.type(name, 'Alexandre');
    await save();

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({ email: 'alex@acme.test', name: 'Alexandre' });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('compares a second save with what the first one saved', async () => {
    renderForm();
    const name = await screen.findByRole('textbox', { name: 'Name' });

    await userEvent.clear(name);
    await userEvent.type(name, 'Alexandre');
    await save();
    await waitFor(() => expect(updates).toHaveLength(1));
    // Back to the name the form opened with: a change from what was saved.
    stored = { ...opened, name: 'Alexandre' };
    await userEvent.clear(name);
    await userEvent.type(name, 'Alex');
    await save();

    await waitFor(() => expect(updates).toHaveLength(2));
    expect(updates[1]).toEqual({ email: 'alex@example.com', name: 'Alex' });
  });

  it('says why and writes nothing when the user was deleted meanwhile', async () => {
    renderForm();
    const name = await screen.findByRole('textbox', { name: 'Name' });
    server.use(
      handleGetUser(() =>
        HttpResponse.json(
          { detail: 'The user does not exist', status: 404 },
          { status: 404 },
        ),
      ),
    );

    await userEvent.type(name, ' B');
    await save();

    expect(await screen.findByText(/does not exist/)).toBeInTheDocument();
    expect(updates).toEqual([]);
    expect(toast.success).not.toHaveBeenCalled();
  });
});
