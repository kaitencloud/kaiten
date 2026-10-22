import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  dataTableSortableHeader,
  type ColumnDef,
} from '@/functionals/table';
import type { ManagedUser } from '@/api-client';
import type { Role } from '../user-management.api';

export function RoleBadges({
  slugs,
  roles,
}: {
  slugs: string[];
  roles: Role[];
}) {
  const { t } = useTranslation();
  function renderRole(slug: string) {
    const role = roles.find((item) => item.slug === slug);
    return (
      <Badge
        key={slug}
        variant={role?.isAdministrator ? 'default' : 'secondary'}
      >
        {role?.name ?? slug}
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {slugs.length ? (
        slugs.map(renderRole)
      ) : (
        <span className="text-xs text-muted-foreground">
          {t('Pages.Access.noRoles')}
        </span>
      )}
    </div>
  );
}

export function UsersTable({
  users,
  roles,
  currentId,
  onManage,
  canWrite = true,
}: {
  users: ManagedUser[];
  roles: Role[];
  currentId?: string;
  canWrite?: boolean;
  onManage: (id: string) => void;
}) {
  const { t } = useTranslation();
  const columns: ColumnDef<ManagedUser>[] = [
    {
      accessorKey: 'name',
      header: dataTableSortableHeader(t('Pages.Access.user')),
      cell: ({ row }) => (
        <div className="py-1">
          <div className="font-medium">
            {row.original.name}{' '}
            {row.original.id === currentId && (
              <Badge variant="outline">{t('Pages.Access.you')}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {row.original.email || row.original.externalId}
          </p>
        </div>
      ),
    },
    {
      id: 'roles',
      header: t('Pages.Access.roles'),
      cell: ({ row }) => (
        <RoleBadges slugs={row.original.authorization.roles} roles={roles} />
      ),
    },
    {
      id: 'overrides',
      header: t('Pages.Access.overrides'),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {t('Pages.Access.scopeCount', {
            count: row.original.authorization.permissions.length,
          })}
        </span>
      ),
    },
    {
      id: 'status',
      header: t('Pages.Access.status'),
      cell: ({ row }) => (
        <Badge
          variant={row.original.authorization.enabled ? 'success' : 'secondary'}
        >
          {t(
            row.original.authorization.enabled
              ? 'Pages.Access.enabled'
              : 'Pages.Access.disabled',
          )}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onManage(row.original.id)}
          aria-label={t('Pages.Access.manageNamedUser', {
            name: row.original.name,
          })}
        >
          {t(canWrite ? 'Pages.Access.manage' : 'Pages.Access.view')}
        </Button>
      ),
    },
  ];
  return (
    <DataTable
      data={users}
      columns={columns}
      getRowId={(user) => user.id}
      emptyMessage={t('Common.noResults')}
      pagination={{ defaultPageSize: 20 }}
    />
  );
}

export function RolesTable({
  roles,
  users,
  onManage,
  canWrite = true,
}: {
  roles: Role[];
  users: ManagedUser[];
  canWrite?: boolean;
  onManage: (slug: string) => void;
}) {
  const { t } = useTranslation();
  const columns: ColumnDef<Role>[] = [
    {
      accessorKey: 'name',
      header: dataTableSortableHeader(t('Pages.Access.role')),
      cell: ({ row }) => (
        <div className="space-y-1 py-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            {row.original.builtIn && (
              <Badge variant="outline">{t('Pages.Access.builtIn')}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {row.original.description}
          </p>
        </div>
      ),
    },
    {
      id: 'permissions',
      header: t('Pages.Access.access'),
      cell: ({ row }) =>
        row.original.isAdministrator ? (
          <Badge>{t('Pages.Access.administrator')}</Badge>
        ) : (
          <span className="text-sm">
            {t('Pages.Access.scopeCount', {
              count: row.original.permissions.length,
            })}
          </span>
        ),
    },
    {
      id: 'assigned',
      header: t('Pages.Access.assignedUsers'),
      cell: ({ row }) =>
        users.filter((user) =>
          user.authorization.roles.includes(row.original.slug),
        ).length,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onManage(row.original.slug)}
          aria-label={t('Pages.Access.manageNamedRole', {
            name: row.original.name,
          })}
        >
          {t(
            row.original.builtIn || !canWrite
              ? 'Pages.Access.view'
              : 'Pages.Access.edit',
          )}
        </Button>
      ),
    },
  ];
  return (
    <DataTable
      data={roles}
      columns={columns}
      getRowId={(role) => role.slug}
      emptyMessage={t('Common.noResults')}
      pagination={{ defaultPageSize: 20 }}
    />
  );
}
