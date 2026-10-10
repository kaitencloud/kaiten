import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { useAppForm } from '@/hooks/form';

type DescriptionGetter = () => string | null;

function Harness({
  onReady,
}: {
  onReady?: (getDescription: DescriptionGetter) => void;
}) {
  const form = useAppForm({
    defaultValues: { description: null as string | null },
  });

  onReady?.(() => form.getFieldValue('description'));

  return (
    <form.AppField name="description">
      {(field) => <field.TextAreaField label="Description" />}
    </form.AppField>
  );
}

describe('TextareaField', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('does not emit a controlled-component warning when the value is null', async () => {
    render(<Harness />);

    const textarea = await screen.findByLabelText('Description');

    // The DOM value is coerced to '' so React treats it as controlled.
    expect((textarea as HTMLTextAreaElement).value).toBe('');

    // React logs this as a format string: "`value` prop on `%s` should not be
    // null." with the element name ("textarea") passed as a separate argument.
    const valueWarning = errorSpy.mock.calls.find(
      (call: unknown[]) =>
        String(call[0]).includes('`value` prop on `%s` should not be null') &&
        call[1] === 'textarea',
    );
    expect(valueWarning).toBeUndefined();
  });

  it('keeps the form value null until the user types (preserves API submission)', async () => {
    const user = userEvent.setup();
    let getDescription: DescriptionGetter | undefined;

    render(<Harness onReady={(getter) => (getDescription = getter)} />);
    await screen.findByLabelText('Description');

    // Untouched: the form still holds null, which the API serialises as null.
    expect(getDescription?.()).toBeNull();

    await user.type(screen.getByLabelText('Description'), 'hi');
    expect(getDescription?.()).toBe('hi');
  });
});
