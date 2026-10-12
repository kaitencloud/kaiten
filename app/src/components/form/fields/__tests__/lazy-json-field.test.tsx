import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { ThemeProvider } from '@/components/theme-provider';
import { useAppForm } from '@/hooks/form';

function Harness() {
  const form = useAppForm({ defaultValues: { config: '', name: '' } });

  return (
    <>
      <form.AppField name="name">
        {(field) => <field.TextField label="Name" />}
      </form.AppField>
      <form.AppField name="config">
        {(field) => <field.JsonField label="Config" />}
      </form.AppField>
    </>
  );
}

// CodeMirror is fetched when a form first draws the JSON field, and a field that
// suspends replaces whatever the nearest boundary above it holds: a dialog body, a
// page. The field carries its own boundary, so the form is on screen all along and
// only the editor's place is a placeholder.
describe('JsonField', () => {
  it('leaves the rest of the form on screen while the editor is fetched', async () => {
    render(
      <ThemeProvider>
        <Harness />
      </ThemeProvider>,
    );

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(await screen.findByText('Config')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });
});
