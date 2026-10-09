import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import { ApiError } from '@/lib/errors';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { z } from 'zod';
import { ReasonDialog } from '../components/reason-dialog';
import { reasonSchema } from '../logic/reason';

// The shape every audited action gives its form: a body with a reason of one to five
// hundred characters, which the callers derive from the contract's own body.
const voidFormSchema = z.object({ reason: reasonSchema });

beforeAll(async () => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  testI18n.addResourceBundle('fr', 'translation', fr, true, true);
  await testI18n.changeLanguage('en');
});

afterAll(async () => {
  await testI18n.changeLanguage('en');
});

function renderDialog(
  onSubmit: (reason: string) => Promise<unknown> = async () => undefined,
) {
  const onClose = vi.fn();
  render(
    <ReasonDialog
      confirmLabel="Void invoice"
      description="Voiding is final."
      destructive
      fieldLabel="Reason"
      onClose={onClose}
      onSubmit={onSubmit}
      schema={voidFormSchema}
      title="Void the invoice"
    />,
  );

  return { onClose };
}

const confirm = () => screen.findByRole('button', { name: 'Void invoice' });

describe('the dialog of an audited action', () => {
  it('keeps the confirmation disabled until a reason is typed', async () => {
    renderDialog();

    expect(await confirm()).toBeDisabled();

    await userEvent.type(await screen.findByLabelText(/Reason/), 'Duplicate of inv-9');

    await waitFor(async () => expect(await confirm()).toBeEnabled());
  });

  it('keeps it disabled for spaces alone: they are not a reason', async () => {
    renderDialog();

    await userEvent.type(await screen.findByLabelText(/Reason/), '    ');

    await waitFor(async () => expect(await confirm()).toBeDisabled());
  });

  it('sends the reason trimmed and closes once the API accepted it', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { onClose } = renderDialog(onSubmit);

    await userEvent.type(await screen.findByLabelText(/Reason/), '  Wrong boundary  ');
    await waitFor(async () => expect(await confirm()).toBeEnabled());
    await userEvent.click(await confirm());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Wrong boundary'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('stays open with what was typed when the API refuses, and says why', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError({
        data: {
          code: 'VoidInvoice.InvalidStatus',
          detail: 'a PAID invoice cannot be voided',
          status: 409,
        },
        status: 409,
      }),
    );
    const { onClose } = renderDialog(onSubmit);

    await userEvent.type(await screen.findByLabelText(/Reason/), 'Mistake');
    await waitFor(async () => expect(await confirm()).toBeEnabled());
    await userEvent.click(await confirm());

    expect(await screen.findByText('a PAID invoice cannot be voided')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Reason/)).toHaveValue('Mistake');
  });

  it('is closed by Cancel without sending anything', async () => {
    const onSubmit = vi.fn();
    const { onClose } = renderDialog(onSubmit);

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
