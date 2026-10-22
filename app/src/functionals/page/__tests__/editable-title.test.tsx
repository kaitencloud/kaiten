import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { EditableTitle } from '../editable-title';

const save = async () => {};

describe('EditableTitle', () => {
  it('names the heading it stands in by the title, and describes what the button does', () => {
    render(
      <h1>
        <EditableTitle label="Edit name" onSave={save} value="Acme Corp" />
      </h1>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Acme Corp' }),
    ).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Acme Corp' });
    expect(button).toBeEnabled();
    expect(button).toHaveAccessibleDescription('Edit name');
  });

  it('is only the title when it may not be edited, not a button that says it is unavailable', () => {
    render(
      <h1>
        <EditableTitle disabled label="Edit name" onSave={save} value="Acme Corp" />
      </h1>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Acme Corp' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
