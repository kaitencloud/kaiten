import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { EditableLicenseEntitlement } from '../../../utils';
import { LicenseEntitlementsCard } from '../license-entitlements-card';

vi.mock('../add-entitlement-dialog', () => ({
  AddEntitlementDialog: () => null,
}));

// react-i18next memoises `t` per language, so the mock keeps one identity too:
// a fresh object on every render would rebuild the columns and remount the
// inline editor, hiding the very regressions these tests pin down.
vi.mock('react-i18next', () => {
  const translation = {
    t: (key: string, options?: unknown) => {
      if (typeof options === 'string') {
        return options;
      }

      if (key === 'Common.tableShowingRecords') {
        const values = (options ?? {}) as {
          end: number;
          start: number;
          total: number;
        };

        return `Showing ${values.start}-${values.end} of ${values.total} records`;
      }

      const translations: Record<string, string> = {
        'Common.firstPage': 'First page',
        'Common.lastPage': 'Last page',
        'Common.next': 'Next',
        'Common.noResults': 'No results',
        'Common.previous': 'Previous',
        'Common.rowsPerPage': 'Rows per page',
        'Pages.Entitlements.EntitlementTypes.BOOLEAN': 'Boolean',
        'Pages.Entitlements.EntitlementTypes.NUMBER': 'Number',
        'Pages.Entitlements.EntitlementTypes.CONFIG': 'Config',
        'Pages.Licenses.Entitlements.Columns.actions': 'Actions',
        'Pages.Licenses.Entitlements.Columns.entitlement': 'Entitlement',
        'Pages.Licenses.Entitlements.Columns.overagePercent': 'Overage',
        'Pages.Licenses.Entitlements.Columns.threshold': 'Threshold',
        'Pages.Licenses.Entitlements.Columns.type': 'Type',
        'Pages.Licenses.Entitlements.Status.configured': 'Configured',
        'Pages.Licenses.Entitlements.Status.disabled': 'Disabled',
        'Pages.Licenses.Entitlements.Status.enabled': 'Enabled',
        'Pages.Licenses.Entitlements.Status.hardLimit': 'Hard limit',
        'Pages.Licenses.Entitlements.Status.softLimit': `+${(options as { percent?: number } | undefined)?.percent}% overage`,
        'Pages.Licenses.Entitlements.Status.unlimited': 'Unlimited',
        'Pages.Licenses.Entitlements.addButton': 'Add entitlement',
        'Pages.Licenses.Entitlements.cancelButton': 'Cancel',
        'Pages.Licenses.Entitlements.cardDescription': 'Description',
        'Pages.Licenses.Entitlements.cardTitle': 'Entitlements',
        'Pages.Licenses.Entitlements.emptyMessage': 'No entitlements',
        'Pages.Licenses.Entitlements.overagePercentPlaceholder': 'Overage value',
        'Pages.Licenses.Entitlements.saveButton': 'Save',
        'Pages.Licenses.Entitlements.thresholdPlaceholder': 'Threshold value',
        'Pages.Licenses.Entitlements.removeAction': 'Remove',
        'Pages.Licenses.Entitlements.confirmRemoveTitle':
          'Remove this entitlement from this license?',
        'Common.cancel': 'Cancel',
      };

      return translations[key] ?? key;
    },
  };

  return { useTranslation: () => translation };
});

const entitlements = [
  {
    id: 'entitlement-seats',
    name: 'Seats',
    slug: 'seats',
    type: 'NUMBER',
  },
  {
    id: 'entitlement-can-export',
    name: 'Can export',
    slug: 'can-export',
    type: 'BOOLEAN',
  },
] as any[];

const rows: EditableLicenseEntitlement[] = [
  {
    enabled: null,
    entitlementIcon: null,
    entitlementId: 'entitlement-seats',
    entitlementName: 'Seats',
    entitlementType: 'NUMBER',
    limitCapExceededOveragePercent: 20,
    threshold: 10,
  },
  {
    enabled: true,
    entitlementIcon: null,
    entitlementId: 'entitlement-can-export',
    entitlementName: 'Can export',
    entitlementType: 'BOOLEAN',
    limitCapExceededOveragePercent: null,
    threshold: null,
  },
  {
    enabled: null,
    entitlementIcon: null,
    entitlementId: 'entitlement-api-calls',
    entitlementName: 'API calls',
    entitlementType: 'NUMBER',
    limitCapExceededOveragePercent: -1,
    threshold: -1,
  },
];

const paginatedRows: EditableLicenseEntitlement[] = Array.from(
  { length: 12 },
  (_, index) => ({
    enabled: null,
    entitlementIcon: null,
    entitlementId: `entitlement-${index + 1}`,
    entitlementName: `Entitlement ${index + 1}`,
    entitlementType: 'NUMBER',
    limitCapExceededOveragePercent: 0,
    threshold: index + 1,
  }),
);

describe('LicenseEntitlementsCard', () => {
  it('keeps inline edition behavior with save on enter for number entitlements', async () => {
    const user = userEvent.setup();
    const onUpdateEntitlementGrant = vi.fn().mockResolvedValue(undefined);

    render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={onUpdateEntitlementGrant}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '10' }));

    const input = screen.getByPlaceholderText('Threshold value');
    await user.clear(input);
    await user.type(input, '15{enter}');

    await waitFor(() => {
      expect(onUpdateEntitlementGrant).toHaveBeenCalledWith(
        'entitlement-seats',
        15,
        20,
      );
    });
  });

  it('forces the overage percent to -1 when the threshold becomes unlimited', async () => {
    const user = userEvent.setup();
    const onUpdateEntitlementGrant = vi.fn().mockResolvedValue(undefined);

    render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={onUpdateEntitlementGrant}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '10' }));

    const input = screen.getByPlaceholderText('Threshold value');
    await user.clear(input);
    await user.type(input, 'Unlimited{enter}');

    await waitFor(() => {
      expect(onUpdateEntitlementGrant).toHaveBeenCalledWith(
        'entitlement-seats',
        -1,
        -1,
      );
    });
  });

  it('edits the overage percent inline and re-sends the current threshold', async () => {
    const user = userEvent.setup();
    const onUpdateEntitlementGrant = vi.fn().mockResolvedValue(undefined);

    render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={onUpdateEntitlementGrant}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '+20% overage' }));

    const input = screen.getByPlaceholderText('Overage value');
    await user.clear(input);
    await user.type(input, '0{enter}');

    await waitFor(() => {
      expect(onUpdateEntitlementGrant).toHaveBeenCalledWith(
        'entitlement-seats',
        10,
        0,
      );
    });
  });

  it('does not offer an overage percent on unlimited or non-numeric grants', () => {
    render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '+20% overage' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '-' })).not.toBeInTheDocument();
    expect(screen.getAllByText('-')).toHaveLength(2);
  });

  it('sends a hard limit when an unlimited threshold becomes capped', async () => {
    const user = userEvent.setup();
    const onUpdateEntitlementGrant = vi.fn().mockResolvedValue(undefined);

    render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={onUpdateEntitlementGrant}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Unlimited' }));

    const input = screen.getByRole('textbox', { name: 'Threshold' });
    await user.clear(input);
    await user.type(input, '100{enter}');

    await waitFor(() => {
      expect(onUpdateEntitlementGrant).toHaveBeenCalledWith(
        'entitlement-api-calls',
        100,
        0,
      );
    });
  });

  it('rejects an invalid overage percent and keeps the input open', async () => {
    const user = userEvent.setup();
    const onUpdateEntitlementGrant = vi.fn().mockResolvedValue(undefined);

    render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={onUpdateEntitlementGrant}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '+20% overage' }));

    const input = screen.getByRole('textbox', { name: 'Overage' });
    await user.clear(input);
    await user.type(input, '2.5{enter}');

    expect(onUpdateEntitlementGrant).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Overage' })).toBeInTheDocument();
  });

  it('saves exactly once when Enter is followed by a blur', async () => {
    const user = userEvent.setup();
    const onUpdateEntitlementGrant = vi.fn().mockResolvedValue(undefined);

    render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={onUpdateEntitlementGrant}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '10' }));

    const input = screen.getByRole('textbox', { name: 'Threshold' });
    await user.clear(input);
    await user.type(input, '15{enter}');
    await user.tab();

    await waitFor(() => {
      expect(onUpdateEntitlementGrant).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('textbox', { name: 'Threshold' })).not.toBeInTheDocument();
  });

  it('cancels the edit on Escape without saving', async () => {
    const user = userEvent.setup();
    const onUpdateEntitlementGrant = vi.fn().mockResolvedValue(undefined);

    render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={onUpdateEntitlementGrant}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '10' }));

    const input = screen.getByRole('textbox', { name: 'Threshold' });
    await user.type(input, '{escape}');
    await user.tab();

    expect(onUpdateEntitlementGrant).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '10' })).toBeInTheDocument();
  });

  it('keeps the saving row locked and leaves the other rows editable', async () => {
    const user = userEvent.setup();
    let resolveSave: () => void = () => {};
    const onUpdateEntitlementGrant = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );

    render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={onUpdateEntitlementGrant}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '10' }));
    await user.type(screen.getByRole('textbox', { name: 'Threshold' }), '{enter}');

    await waitFor(() => {
      expect(onUpdateEntitlementGrant).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole('button', { name: '+20% overage' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '10' })).toBeDisabled();
    // Another row keeps its own state: the lock is per row.
    expect(screen.getByRole('button', { name: 'Unlimited' })).toBeEnabled();

    resolveSave();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '+20% overage' })).toBeEnabled();
    });
  });

  it('keeps each row locked until its own save settles', async () => {
    const user = userEvent.setup();
    const resolvers: Array<() => void> = [];
    const onUpdateEntitlementGrant = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );

    render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={onUpdateEntitlementGrant}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '10' }));
    await user.type(screen.getByRole('textbox', { name: 'Threshold' }), '{enter}');
    await waitFor(() => {
      expect(onUpdateEntitlementGrant).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Unlimited' }));
    const secondInput = screen.getByRole('textbox', { name: 'Threshold' });
    await user.clear(secondInput);
    await user.type(secondInput, '50{enter}');
    await waitFor(() => {
      expect(onUpdateEntitlementGrant).toHaveBeenCalledTimes(2);
    });

    // The first row is still saving, so it must still be locked.
    expect(screen.getByRole('button', { name: '10' })).toBeDisabled();

    resolvers[0]();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '10' })).toBeEnabled();
    });
    // The second row's request has not settled yet, so it stays locked (its
    // displayed value is unchanged: the rows prop is not refetched here).
    expect(screen.getByRole('button', { name: 'Unlimited' })).toBeDisabled();
  });

  it('does not navigate when the delete button of a saving row is clicked', async () => {
    const user = userEvent.setup();
    const onClickEntitlement = vi.fn();
    const onUpdateEntitlementGrant = vi.fn(() => new Promise<void>(() => {}));

    render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onClickEntitlement={onClickEntitlement}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={onUpdateEntitlementGrant}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '10' }));
    await user.type(screen.getByRole('textbox', { name: 'Threshold' }), '{enter}');

    await waitFor(() => {
      expect(onUpdateEntitlementGrant).toHaveBeenCalledTimes(1);
    });

    const seatsRow = screen.getByText('Seats').closest('tr');
    const deleteButton = seatsRow?.querySelector(
      'button.text-destructive-subtle-foreground',
    );

    if (!deleteButton) {
      throw new Error('Expected delete button was not rendered');
    }

    // The Button primitive disables pointer events on a disabled button, so the
    // click lands on the row itself.
    fireEvent.click(deleteButton);
    fireEvent.click(seatsRow as HTMLElement);

    expect(onClickEntitlement).not.toHaveBeenCalled();
  });

  it('lets a rejected value be corrected and saved', async () => {
    const user = userEvent.setup();
    const onUpdateEntitlementGrant = vi.fn().mockResolvedValue(undefined);

    render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={onUpdateEntitlementGrant}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '+20% overage' }));

    const input = screen.getByRole('textbox', { name: 'Overage' });
    await user.clear(input);
    await user.type(input, '2.5{enter}');

    expect(onUpdateEntitlementGrant).not.toHaveBeenCalled();

    await user.clear(screen.getByRole('textbox', { name: 'Overage' }));
    await user.type(screen.getByRole('textbox', { name: 'Overage' }), '30{enter}');

    await waitFor(() => {
      expect(onUpdateEntitlementGrant).toHaveBeenCalledWith(
        'entitlement-seats',
        10,
        30,
      );
    });
    expect(onUpdateEntitlementGrant).toHaveBeenCalledTimes(1);
  });

  it('saves a rejected value corrected through a blur', async () => {
    const user = userEvent.setup();
    const onUpdateEntitlementGrant = vi.fn().mockResolvedValue(undefined);

    render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={onUpdateEntitlementGrant}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '10' }));

    const input = screen.getByRole('textbox', { name: 'Threshold' });
    await user.clear(input);
    await user.type(input, 'abc{enter}');

    expect(onUpdateEntitlementGrant).not.toHaveBeenCalled();

    await user.clear(screen.getByRole('textbox', { name: 'Threshold' }));
    await user.type(screen.getByRole('textbox', { name: 'Threshold' }), '42');
    await user.tab();

    await waitFor(() => {
      expect(onUpdateEntitlementGrant).toHaveBeenCalledWith(
        'entitlement-seats',
        42,
        20,
      );
    });
  });

  it('focuses the inline editor and keeps the typed value across re-renders', async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '10' }));

    const input = screen.getByRole('textbox', { name: 'Threshold' });
    expect(input).toHaveFocus();

    await user.clear(input);
    await user.type(input, '77');

    rerender(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={[...rows]}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={vi.fn()}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Threshold' })).toHaveValue('77');
  });

  it('keeps the same input element while typing, so the caret never jumps', async () => {
    const user = userEvent.setup();

    render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '10' }));

    const input = screen.getByRole('textbox', { name: 'Threshold' });
    await user.clear(input);
    await user.type(input, '123');

    // A remount would replace the node and reset the caret to the end.
    expect(screen.getByRole('textbox', { name: 'Threshold' })).toBe(input);
    expect(input).toHaveValue('123');
    expect(input).toHaveFocus();
  });

  it('selects the value of a fresh edit but not of a re-render', async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '10' }));

    const input = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Threshold',
    });
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(2);

    // Typed without clicking first, so the selection is still in place: the
    // keystroke must replace the whole value.
    await user.keyboard('7');
    rerender(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={[...rows]}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={vi.fn()}
      />,
    );

    const rerendered = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Threshold',
    });
    expect(rerendered).toHaveValue('7');
    expect(rerendered.selectionStart).toBe(rerendered.value.length);
  });

  it('closes an open editor when its row disappears', () => {
    const { rerender } = render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '10' }));
    expect(screen.getByRole('textbox', { name: 'Threshold' })).toBeInTheDocument();

    rerender(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={[]}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={vi.fn()}
      />,
    );
    rerender(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('textbox', { name: 'Threshold' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10' })).toBeInTheDocument();
  });

  it('never navigates to the entitlement while using the inline editors', async () => {
    const user = userEvent.setup();
    const onClickEntitlement = vi.fn();

    render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onClickEntitlement={onClickEntitlement}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '+20% overage' }));

    const input = screen.getByRole('textbox', { name: 'Overage' });
    await user.click(input);
    await user.type(input, ' 30{enter}');

    expect(onClickEntitlement).not.toHaveBeenCalled();
  });

  it('does not render save and cancel buttons while editing inline field', () => {
    render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '10' }));

    expect(
      screen.queryByRole('button', { name: 'Save' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument();
  });

  it('removes an entitlement only once the removal is confirmed', async () => {
    const user = userEvent.setup();
    const onDeleteEntitlement = vi.fn();

    render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={onDeleteEntitlement}
        onUpdateEntitlementGrant={vi.fn()}
      />,
    );

    const seatsRow = screen.getByText('Seats').closest('tr');

    if (!seatsRow) {
      throw new Error('Expected entitlement row was not rendered');
    }

    const deleteButton = seatsRow.querySelector('button.text-destructive-subtle-foreground');

    if (!deleteButton) {
      throw new Error('Expected delete button was not rendered');
    }

    await user.click(deleteButton);
    expect(onDeleteEntitlement).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDeleteEntitlement).not.toHaveBeenCalled();

    await user.click(deleteButton);
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(onDeleteEntitlement).toHaveBeenCalledTimes(1);
    expect(onDeleteEntitlement).toHaveBeenCalledWith('entitlement-seats');
  });

  it('does not treat the delete action as a row click', () => {
    const onClickEntitlement = vi.fn();

    render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={rows}
        onAddEntitlement={vi.fn()}
        onClickEntitlement={onClickEntitlement}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={vi.fn()}
      />,
    );

    const seatsRow = screen.getByText('Seats').closest('tr');
    const deleteButton = seatsRow?.querySelector(
      'button.text-destructive-subtle-foreground',
    );

    if (!deleteButton) {
      throw new Error('Expected delete button was not rendered');
    }

    fireEvent.click(deleteButton);

    expect(onClickEntitlement).not.toHaveBeenCalled();
  });

  it('shows pagination controls with many rows and the rows-per-page selector', () => {
    render(
      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={paginatedRows}
        onAddEntitlement={vi.fn()}
        onDeleteEntitlement={vi.fn()}
        onUpdateEntitlementGrant={vi.fn()}
      />,
    );

    expect(screen.getByText('Showing 1-10 of 12 records')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByText('Rows per page')).toBeInTheDocument();
  });
});
