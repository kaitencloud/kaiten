import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, type Ref } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { EntitlementGroupSelector } from '../entitlement-group-selector';

const { createGroupMutateAsyncMock, createGroupPendingMock } = vi.hoisted(
  () => ({
    createGroupMutateAsyncMock: vi.fn(),
    createGroupPendingMock: vi.fn(() => false),
  }),
);

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();

  return {
    ...actual,
    useMutation: () => ({
      isPending: createGroupPendingMock(),
      mutateAsync: createGroupMutateAsyncMock,
    }),
    useQuery: () => ({
      data: {
        hasMore: false,
        items: [
          { id: 'group-1', name: 'Usage', slug: 'usage' },
          { id: 'group-2', name: 'Security', slug: 'security' },
        ],
      },
    }),
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
      setQueryData: vi.fn(),
    }),
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'Pages.Entitlements.Mutation.Form.Actions.createGroup') {
        return `Create "${options?.name}"`;
      }

      if (key === 'Pages.Entitlements.Mutation.Form.Actions.creatingGroup') {
        return `Creating "${options?.name}"`;
      }

      if (key === 'Pages.Entitlements.Mutation.Form.Actions.removeGroup') {
        return `Remove group ${options?.name}`;
      }

      const translations: Record<string, string> = {
        'Pages.Entitlements.Mutation.Form.Empty.noGroupResults':
          'No matching groups',
        'Pages.Entitlements.Mutation.Form.Empty.noGroupsSelected':
          'No groups selected yet',
        'Pages.Entitlements.Mutation.Form.Placeholders.groups':
          'Search or create groups',
        'Pages.Entitlements.Mutation.Form.Placeholders.groupSearch':
          'Search groups',
        'Pages.EntitlementGroups.Mutation.titleNew': 'New entitlement group',
        'Pages.EntitlementGroups.Mutation.Form.inlineDescription':
          'Create a new group and immediately associate it with this entitlement.',
      };

      return translations[key] ?? key;
    },
  }),
}));

vi.mock('@/components/dialog', () => ({
  FormDialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div data-testid="form-dialog">{children}</div> : null,
}));

vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  CommandGroup: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  CommandInput: ({
    autoFocus,
    onValueChange,
    placeholder,
    value,
    ref,
  }: {
    autoFocus?: boolean;
    onValueChange: (value: string) => void;
    placeholder: string;
    value: string;
    ref?: Ref<HTMLInputElement>;
  }) => (
    <input
      ref={ref}
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  ),
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode;
    onSelect?: () => void;
  }) => (
    <button type="button" onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/popover', () => ({
  PopoverAnchor: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe('EntitlementGroupSelector', () => {
  it('focuses the search input when opened inline', async () => {
    render(
      <EntitlementGroupSelector
        autoFocusSearch
        open
        value={[]}
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search groups')).toHaveFocus();
    });
  });

  it('creates a new group inline and selects it', async () => {
    const handleChange = vi.fn();
    createGroupPendingMock.mockReturnValue(false);
    createGroupMutateAsyncMock.mockResolvedValue({
      id: 'group-3',
      name: 'New Group',
      slug: 'new-group',
    });

    render(<EntitlementGroupSelector value={[]} onChange={handleChange} />);

    fireEvent.change(screen.getByPlaceholderText('Search groups'), {
      target: { value: 'New Group' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create "New Group"' }));

    await waitFor(() => {
      expect(createGroupMutateAsyncMock).toHaveBeenCalledWith({
        body: {
          description: '',
          name: 'New Group',
        },
      });
    });

    await waitFor(() => {
      expect(handleChange).toHaveBeenCalledWith(['new-group']);
    });

    expect(screen.getByText('New Group')).toBeInTheDocument();
    expect(screen.queryByText('new-group')).not.toBeInTheDocument();
  });
});
