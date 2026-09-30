import type { Meta, StoryObj } from '@storybook/react-vite';
import { Edit, Eye, Trash2 } from 'lucide-react';
import { TableActionButton } from '..';

const meta = {
  title: 'Functionals/Table',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const TableActionButtons: Story = {
  render: () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Table Action Buttons</h3>
      <div className="flex gap-2 items-center">
        <TableActionButton
          tooltip="View details"
          onClick={() => alert('View clicked')}
        >
          <Eye className="h-4 w-4" />
        </TableActionButton>

        <TableActionButton
          tooltip="Edit item"
          onClick={() => alert('Edit clicked')}
        >
          <Edit className="h-4 w-4" />
        </TableActionButton>

        <TableActionButton
          tooltip="Delete item"
          onClick={() => alert('Delete clicked')}
        >
          <Trash2 className="h-4 w-4 text-destructive-subtle-foreground" />
        </TableActionButton>
      </div>
    </div>
  ),
};

export const TableActionButtonsInTable: Story = {
  render: () => {
    const users = [
      { id: 1, name: 'John Doe', email: 'john@example.com' },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
      { id: 3, name: 'Bob Johnson', email: 'bob@example.com' },
    ];

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">
          Action Buttons in Table Context
        </h3>
        <div className="border rounded-lg">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-4">Name</th>
                <th className="text-left p-4">Email</th>
                <th className="text-right p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b last:border-0 hover:bg-muted/50"
                >
                  <td className="p-4">{user.name}</td>
                  <td className="p-4">{user.email}</td>
                  <td className="p-4">
                    <div className="flex gap-1 justify-end">
                      <TableActionButton
                        tooltip="View user"
                        onClick={() => alert(`View ${user.name}`)}
                      >
                        <Eye className="h-4 w-4" />
                      </TableActionButton>
                      <TableActionButton
                        tooltip="Edit user"
                        onClick={() => alert(`Edit ${user.name}`)}
                      >
                        <Edit className="h-4 w-4" />
                      </TableActionButton>
                      <TableActionButton
                        tooltip="Delete user"
                        onClick={() => alert(`Delete ${user.name}`)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive-subtle-foreground" />
                      </TableActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  },
};
