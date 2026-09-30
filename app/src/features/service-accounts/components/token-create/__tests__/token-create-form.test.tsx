import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { webhooksFlagQueryOptions } from '@/lib/feature-flags';
// Initializes the shared i18next instance with the app's locales.
import '@/lib/i18n/config';
import { TokenCreateForm } from '../token-create-form';

function renderForm() {
  const onSubmit = vi.fn(async () => {});
  // Kaiten Cloud, where the `webhooks` platform flag is on, so the table offers
  // every scope. Where it is off is scope-access-table.test.tsx's concern.
  // Never refetched: the seeded answer is the whole point.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { enabled: false } },
  });
  queryClient.setQueryData(webhooksFlagQueryOptions.queryKey, true);
  render(
    <QueryClientProvider client={queryClient}>
      <TokenCreateForm
        serviceAccountName="SDK"
        onCancel={() => {}}
        onSubmit={onSubmit}
      />
    </QueryClientProvider>,
  );
  return { onSubmit, user: userEvent.setup() };
}

const accessOf = (resource: string) =>
  screen.getByRole('radiogroup', { name: `Access to ${resource}` });

const levelOf = (resource: string) =>
  within(accessOf(resource))
    .getAllByRole('radio')
    .find((radio) => radio.getAttribute('aria-checked') === 'true')
    ?.textContent;

describe('TokenCreateForm', () => {
  it('offers every scope a token can carry, webhooks included', async () => {
    renderForm();

    // The form's fields are code-split: wait for the first one to land.
    expect(
      await screen.findByRole('radiogroup', { name: 'Access to Webhooks' }),
    ).toBeInTheDocument();
    expect(accessOf('Metadata Fields')).toBeInTheDocument();
    expect(levelOf('Webhooks')).toBe('No access');
  });

  // Next to the button it is about, and read out with it.
  it('says by Create Token that the token is shown once', async () => {
    renderForm();

    expect(
      await screen.findByRole('button', { name: 'Create Token' }),
    ).toHaveAccessibleDescription(
      'The token is shown once, right after it is created: Kaiten keeps only a hash of it.',
    );
  });

  it('creates a data-plane token with what the SDK runtime calls', async () => {
    const { onSubmit, user } = renderForm();

    await user.type(
      await screen.findByRole('textbox', { name: /^Name/ }),
      '  Production SDK ',
    );
    await user.click(screen.getByRole('button', { name: 'Data plane' }));

    expect(
      screen.getByRole('button', { name: 'Data plane' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(levelOf('Instances')).toBe('Read & write');
    expect(levelOf('Feature Flags')).toBe('Read');
    expect(screen.getByText('6 scopes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create Token' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Production SDK',
        scopes: [
          'read:customers',
          'read:entitlements',
          'read:feature_flags',
          'read:instances',
          'read:licenses',
          'write:instances',
        ],
        expiresAt: undefined,
      }),
    );
  });

  it('adds a single scope from its row and takes a preset back out', async () => {
    const { user } = renderForm();

    await user.click(
      await screen.findByRole('button', { name: 'Control plane' }),
    );
    await user.click(
      within(accessOf('Webhooks')).getByRole('radio', { name: 'Read' }),
    );
    expect(screen.getByText('17 scopes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Control plane' }));

    expect(
      screen.getByRole('button', { name: 'Control plane' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(levelOf('Releases')).toBe('No access');
    expect(levelOf('Webhooks')).toBe('Read');
    expect(screen.getByText('1 scope')).toBeInTheDocument();
  });

  // On a viewport too short for the inline table (below the `tall` variant),
  // the same table opens in a dialog. jsdom applies no CSS, so both are here.
  it('edits the same field from the dialog a short viewport uses', async () => {
    const { user } = renderForm();

    await user.click(
      await screen.findByRole('button', { name: 'Adjust per resource' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Access per resource',
    });
    await user.click(
      within(
        within(dialog).getByRole('radiogroup', { name: 'Access to Webhooks' }),
      ).getByRole('radio', { name: 'Read & write' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('write:webhooks')).toBeInTheDocument();
    expect(levelOf('Webhooks')).toBe('Read & write');
  });

  it('refuses a token with no access, and says why', async () => {
    const { onSubmit, user } = renderForm();

    await user.type(
      await screen.findByRole('textbox', { name: /^Name/ }),
      'Empty',
    );
    await user.click(
      within(accessOf('Licenses')).getByRole('radio', { name: 'Read' }),
    );
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(
      await screen.findByText('Grant access to at least one resource'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Token' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
