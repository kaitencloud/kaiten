import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, Users, Search, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Page } from '@/functionals/page';
import { isAdministrator, useCurrentAccess } from '@/domains/access-management';
import { isForbiddenError, getApiErrorMessage } from '@/lib/errors';
import { allUsersOptions, rolesOptions } from '../user-management.queries';
import { filterUsers, type AccessSearch } from '../access-helpers';
import { UsersTable, RolesTable } from './access-tables';
import { UserEditor } from './user-editor';
import { RoleEditor } from './role-editor';

export function AccessPage({
  search,
  onSearchChange,
}: {
  search: AccessSearch;
  onSearchChange: (search: AccessSearch) => void;
}) {
  const { t } = useTranslation();
  const me = useCurrentAccess();
  const administrator = isAdministrator(me.data);
  const users = useQuery({ ...allUsersOptions(), enabled: administrator });
  const roles = useQuery({ ...rolesOptions(), enabled: administrator });
  const denied =
    (me.isSuccess && !administrator) ||
    isForbiddenError(me.error) ||
    isForbiddenError(users.error) ||
    isForbiddenError(roles.error);
  const error = me.error ?? users.error ?? roles.error;
  const loading =
    me.isPending || (administrator && (users.isPending || roles.isPending));
  const allUsers = users.data?.items ?? [];
  const allRoles = roles.data ?? [];
  const selectedUser = allUsers.find((user) => user.id === search.manageUser);
  const selectedRole = allRoles.find((role) => role.slug === search.manageRole);
  const creatingRole = search.createRole === true;
  function closeEditor() {
    onSearchChange({
      ...search,
      manageUser: undefined,
      manageRole: undefined,
      createRole: undefined,
    });
  }
  function changeTab(value: unknown) {
    onSearchChange({
      ...search,
      tab: value === 'roles' ? 'roles' : 'users',
      q: undefined,
      status: undefined,
      manageUser: undefined,
      manageRole: undefined,
      createRole: undefined,
    });
  }
  function retry() {
    void me.refetch();
    if (administrator) {
      void users.refetch();
      void roles.refetch();
    }
  }
  const missing =
    !loading &&
    !error &&
    !denied &&
    ((search.manageUser && !selectedUser) ||
      (search.manageRole && !creatingRole && !selectedRole));
  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <Page.Header>
        <Page.Leading>
          <Page.Icon>
            <ShieldCheck
              className="size-8 text-primary-subtle-foreground"
              aria-hidden
            />
          </Page.Icon>
          <Page.Heading>
            <Page.Title>{t('Pages.Access.title')}</Page.Title>
            <Page.Subtitle>{t('Pages.Access.subtitle')}</Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
      </Page.Header>
      <div className="mt-6 min-h-0 flex-1 overflow-auto space-y-4">
        {denied ? (
          <div className="rounded-md border p-6">
            <h2 className="font-semibold">{t('Pages.Access.accessDenied')}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('Pages.Access.accessDeniedDescription')}
            </p>
          </div>
        ) : error ? (
          <div role="alert" className="space-y-3 rounded-md border p-6">
            <p>{getApiErrorMessage(error)}</p>
            <Button variant="outline" onClick={retry}>
              {t('Errors.retry')}
            </Button>
          </div>
        ) : loading ? (
          <p role="status" className="p-6 text-sm text-muted-foreground">
            {t('Pages.Access.loading')}
          </p>
        ) : (
          <>
            <p className="rounded-md border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              {t('Pages.Access.adminExplanation')}
            </p>
            {allUsers.filter(
              (user) =>
                user.authorization.enabled &&
                user.authorization.roles.includes('administrator'),
            ).length === 1 && (
              <div
                role="status"
                className="rounded-md border bg-warning-subtle p-3 text-sm text-warning-subtle-foreground"
              >
                <p className="font-semibold">
                  {t('Pages.Access.singleAdministrator')}
                </p>
                <p className="mt-1">
                  {t('Pages.Access.singleAdministratorDescription')}
                </p>
              </div>
            )}
            <Tabs value={search.tab} onValueChange={changeTab}>
              <TabsList variant="line" aria-label={t('Pages.Access.title')}>
                <TabsTrigger value="users">
                  <Users aria-hidden />
                  {t('Pages.Access.users')}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {allUsers.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="roles">
                  <ShieldCheck aria-hidden />
                  {t('Pages.Access.roles')}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {allRoles.length}
                  </span>
                </TabsTrigger>
              </TabsList>
              <div className="my-3 flex flex-wrap items-end gap-3">
                <div className="min-w-48 flex-1">
                  <Label htmlFor="access-search" className="mb-2 text-xs">
                    {t(
                      search.tab === 'users'
                        ? 'Pages.Access.searchUsers'
                        : 'Pages.Access.searchRoles',
                    )}
                  </Label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      id="access-search"
                      value={search.q ?? ''}
                      className="pl-9"
                      onChange={(event) =>
                        onSearchChange({
                          ...search,
                          q: event.target.value || undefined,
                        })
                      }
                    />
                  </div>
                </div>
                {search.tab === 'users' ? (
                  <div>
                    <Label htmlFor="access-status" className="mb-2 text-xs">
                      {t('Pages.Access.status')}
                    </Label>
                    <select
                      id="access-status"
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={search.status ?? ''}
                      onChange={(event) =>
                        onSearchChange({
                          ...search,
                          status: event.target.value
                            ? (event.target.value as 'enabled' | 'disabled')
                            : undefined,
                        })
                      }
                    >
                      <option value="">{t('Pages.Access.allStatuses')}</option>
                      <option value="enabled">
                        {t('Pages.Access.enabled')}
                      </option>
                      <option value="disabled">
                        {t('Pages.Access.disabled')}
                      </option>
                    </select>
                  </div>
                ) : (
                  <Button
                    onClick={() =>
                      onSearchChange({
                        ...search,
                        manageRole: undefined,
                        createRole: true,
                      })
                    }
                  >
                    <Plus className="size-4" aria-hidden />
                    {t('Pages.Access.createRole')}
                  </Button>
                )}
              </div>
              <TabsContent value="users">
                <UsersTable
                  users={filterUsers(allUsers, search)}
                  roles={allRoles}
                  currentId={me.data?.user.id}
                  onManage={(id) =>
                    onSearchChange({ ...search, manageUser: id })
                  }
                />
              </TabsContent>
              <TabsContent value="roles">
                <RolesTable
                  roles={allRoles.filter((role) =>
                    `${role.name} ${role.description} ${role.slug}`
                      .toLocaleLowerCase()
                      .includes(search.q?.toLocaleLowerCase() ?? ''),
                  )}
                  users={allUsers}
                  onManage={(slug) =>
                    onSearchChange({
                      ...search,
                      manageRole: slug,
                      createRole: undefined,
                    })
                  }
                />
              </TabsContent>
            </Tabs>
            {missing && (
              <div role="alert" className="rounded-md border p-4">
                <p className="text-sm">{t('Pages.Access.notFound')}</p>
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={closeEditor}
                >
                  {t('Common.close')}
                </Button>
              </div>
            )}
            {selectedUser && (
              <UserEditor
                key={selectedUser.id}
                user={selectedUser}
                roles={allRoles}
                available={me.data?.availablePermissions ?? []}
                currentId={me.data?.user.id}
                onClose={closeEditor}
              />
            )}
            {(selectedRole || creatingRole) && (
              <RoleEditor
                key={creatingRole ? 'create-role' : search.manageRole}
                role={selectedRole}
                available={me.data?.availablePermissions ?? []}
                assignedCount={
                  allUsers.filter((user) =>
                    user.authorization.roles.includes(selectedRole?.slug ?? ''),
                  ).length
                }
                onClose={closeEditor}
              />
            )}
          </>
        )}
      </div>
    </Page>
  );
}
