import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
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

  it('puts the focus back on the title when the person leaves the input with Escape', async () => {
    const user = userEvent.setup();
    render(
      <h1>
        <EditableTitle label="Edit name" onSave={save} value="Acme Corp" />
      </h1>,
    );

    await user.click(screen.getByRole('button', { name: 'Acme Corp' }));
    await user.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: 'Acme Corp' })).toHaveFocus();
  });

  it('puts the focus back on the new title when the person saves with Enter', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => {});
    const { rerender } = render(
      <h1>
        <EditableTitle label="Edit name" onSave={onSave} value="Acme Corp" />
      </h1>,
    );

    await user.click(screen.getByRole('button', { name: 'Acme Corp' }));
    await user.clear(screen.getByRole('textbox', { name: 'Edit name' }));
    await user.type(screen.getByRole('textbox', { name: 'Edit name' }), 'Acme Inc{Enter}');
    rerender(
      <h1>
        <EditableTitle label="Edit name" onSave={onSave} value="Acme Inc" />
      </h1>,
    );

    expect(onSave).toHaveBeenCalledWith('Acme Inc');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Acme Inc' })).toHaveFocus(),
    );
  });

  it('does not take the focus from a person who went elsewhere', async () => {
    const user = userEvent.setup();
    render(
      <>
        <h1>
          <EditableTitle label="Edit name" onSave={save} value="Acme Corp" />
        </h1>
        <button type="button">Elsewhere</button>
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Acme Corp' }));
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));

    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
  });
});
