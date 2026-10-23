import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vite-plus/test';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import SubmitButton from '../submit-button';

// The form validates on mount here, so an empty name is invalid before any
// edit, the way a create form's required fields are.
function Harness({
  allowPristine,
  name,
}: {
  allowPristine?: boolean;
  name: string;
}) {
  const form = useAppForm({
    defaultValues: { name },
    validators: {
      onMount: ({ value }) => (value.name ? undefined : 'required'),
    },
  });

  return (
    <form.AppForm>
      <SubmitButton allowPristine={allowPristine} label="Save" />
    </form.AppForm>
  );
}

describe('SubmitButton', () => {
  it('waits for a change before an untouched form can be submitted', () => {
    render(<Harness name="Enterprise v2" />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('lets an untouched form be submitted when its defaults are complete', () => {
    render(<Harness allowPristine name="Enterprise v2" />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('still refuses an invalid form', () => {
    render(<Harness allowPristine name="" />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

// A form that sends what it holds and hears back: `refusal` is a message the API gives for
// the "Reason" field, or nothing when the send is accepted. A refusal is the way a form
// that was valid becomes invalid after a submit, with the focus on the button that sent it.
function SendingHarness({
  field = 'reason',
  refusal,
}: {
  /** Which field the refusal is about. */
  field?: 'days' | 'reason';
  refusal?: string;
}) {
  const form = useAppForm({
    defaultValues: { days: 30, name: 'Acme', reason: '' },
    onSubmit: async ({ formApi }) => {
      await Promise.resolve();
      if (refusal) {
        formApi.setFieldMeta(field, (meta) => ({
          ...meta,
          errorMap: { ...meta.errorMap, onServer: { message: refusal } },
          isTouched: true,
        }));
      }
    },
  });

  return (
    <form onSubmit={createFormSubmitHandler(form.handleSubmit)}>
      <form.AppForm>
        <form.AppField name="name">
          {(field) => <field.TextField label="Name" />}
        </form.AppField>
        <form.AppField name="days">
          {(field) => <field.NumberField label="Payment terms (days)" />}
        </form.AppField>
        <form.AppField name="reason">
          {(field) => <field.TextField label="Reason" />}
        </form.AppField>
        <form.SubmitButton allowPristine label="Send" />
      </form.AppForm>
    </form>
  );
}

describe('SubmitButton focus', () => {
  it('moves the focus to the first field that shows an error when a submit leaves the form invalid', async () => {
    const user = userEvent.setup();
    render(<SendingHarness refusal="reason is too long" />);

    const button = screen.getByRole('button', { name: 'Send' });
    button.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.getByLabelText('Reason')).toHaveFocus());
    expect(screen.getByLabelText('Reason')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(button).toBeDisabled();
  });

  it('moves the focus to the input of a number field the refusal is about', async () => {
    const user = userEvent.setup();
    render(<SendingHarness field="days" refusal="days is out of range" />);

    const button = screen.getByRole('button', { name: 'Send' });
    button.focus();
    await user.keyboard('{Enter}');

    // The group around the input is marked invalid too, and comes first.
    const input = screen.getByRole('textbox', { name: 'Payment terms (days)' });
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('puts the focus back on the button when the form is valid again after the submit', async () => {
    const user = userEvent.setup();
    render(<SendingHarness />);

    const button = screen.getByRole('button', { name: 'Send' });
    button.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(button).toHaveFocus());
  });

  it('leaves the focus where the person put it while the form was sending', async () => {
    const user = userEvent.setup();
    render(<SendingHarness refusal="reason is too long" />);

    const button = screen.getByRole('button', { name: 'Send' });
    button.focus();
    await user.keyboard('{Enter}');
    screen.getByLabelText('Name').focus();

    await waitFor(() => expect(button).toBeDisabled());
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(screen.getByLabelText('Name')).toHaveFocus();
  });

  // "Fill in the required fields" is about what is empty or mistyped. A refusal is the
  // server's word about a form that was complete, and is on its field already.
  it('does not ask for required fields after a refusal, since none is missing', async () => {
    const user = userEvent.setup();
    render(<SendingHarness refusal="reason is too long" />);

    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled(),
    );
    expect(screen.queryByText(/requiredFieldsHint/)).toBeNull();
  });

  it('still asks for them when a field is invalid for what was typed', async () => {
    const user = userEvent.setup();
    render(<TypedHarness />);

    await user.type(screen.getByLabelText('Name'), 'x');
    await user.clear(screen.getByLabelText('Name'));

    expect(await screen.findByText(/requiredFieldsHint/)).toBeInTheDocument();
  });
});

function TypedHarness() {
  const form = useAppForm({
    defaultValues: { name: 'Acme' },
    validators: {
      onChange: ({ value }) => (value.name ? undefined : 'required'),
    },
  });

  return (
    <form.AppForm>
      <form.AppField
        name="name"
        validators={{ onChange: ({ value }) => (value ? undefined : 'required') }}
      >
        {(field) => <field.TextField label="Name" />}
      </form.AppField>
      <form.SubmitButton label="Save" />
    </form.AppForm>
  );
}
