import { z } from 'zod';
import { zCreateRole, zUpdateUserBody } from '@/api-client/zod.gen';
import { isApiError, getApiErrorMessage } from '@/lib/errors';
import type { ManagedUser } from '@/api-client';
import type { Role } from './user-management.api';

export type AccessLevel = 'none' | 'read' | 'write';
export type AccessSearch = {
  tab: 'users' | 'roles';
  q?: string;
  status?: 'enabled' | 'disabled';
  manageUser?: string;
  manageRole?: string;
  createRole?: boolean;
};
export function parseAccessSearch(
  search: Record<string, unknown>,
): AccessSearch {
  const text = (value: unknown) =>
    typeof value === 'string' && value.trim() ? value : undefined;
  return {
    tab: search.tab === 'roles' ? 'roles' : 'users',
    q: text(search.q),
    status:
      search.status === 'enabled' || search.status === 'disabled'
        ? search.status
        : undefined,
    manageUser: text(search.manageUser),
    manageRole: text(search.manageRole),
    createRole:
      search.createRole === true || search.createRole === 'true'
        ? true
        : undefined,
  };
}
export const profileSchema = zUpdateUserBody.extend({
  name: z.string().trim().min(1, 'Pages.Access.validation.name').max(200),
  email: z.string().trim().email('Pages.Access.validation.email'),
});
export const roleSchema = zCreateRole.extend({
  name: z.string().trim().min(1, 'Pages.Access.validation.name').max(200),
  slug: zCreateRole.shape.slug,
});
export function permissionResources(available: string[]) {
  return [
    ...new Set(
      available
        .filter((scope) => /^(read|write):/.test(scope))
        .map((scope) => scope.split(':')[1]),
    ),
  ].sort();
}
export function permissionLevel(
  scopes: string[],
  resource: string,
): AccessLevel {
  return scopes.includes(`write:${resource}`)
    ? 'write'
    : scopes.includes(`read:${resource}`)
      ? 'read'
      : 'none';
}
export function changePermissionLevel(
  scopes: string[],
  resource: string,
  level: AccessLevel,
  available: string[],
) {
  const retained = scopes.filter(
    (scope) => scope !== `read:${resource}` && scope !== `write:${resource}`,
  );
  const next =
    level === 'none'
      ? []
      : level === 'read'
        ? [`read:${resource}`]
        : [`read:${resource}`, `write:${resource}`];
  return [
    ...new Set([
      ...retained,
      ...next.filter((scope) => available.includes(scope)),
    ]),
  ].sort();
}
export function effectivePermissions(
  roleSlugs: string[],
  overrides: string[],
  roles: Role[],
) {
  return [
    ...new Set([
      ...overrides,
      ...roles
        .filter((role) => roleSlugs.includes(role.slug))
        .flatMap((role) => role.permissions),
    ]),
  ].sort();
}
export function filterUsers(users: ManagedUser[], search: AccessSearch) {
  const query = search.q?.trim().toLocaleLowerCase() ?? '';
  return users.filter(
    (user) =>
      (!search.status ||
        user.authorization.enabled === (search.status === 'enabled')) &&
      [user.name, user.email, user.externalId].some((value) =>
        value?.toLocaleLowerCase().includes(query),
      ),
  );
}
export function accessErrorMessage(error: unknown, t: (key: string) => string) {
  if (isApiError(error) && error.data && typeof error.data === 'object') {
    const data = error.data as {
      code?: string;
      title?: string;
      detail?: string;
      errors?: { message?: string }[];
    };
    const codes = [
      'Users.LastAdministrator',
      'Users.RoleInUse',
      'Users.BuiltInRole',
      'Users.InvalidAuthorization',
    ];
    const code = codes.find((candidate) =>
      [
        data.code,
        data.title,
        data.detail,
        ...(data.errors?.map((item) => item.message) ?? []),
      ].some((value) => value?.includes(candidate)),
    );
    if (code) return t(`Pages.Access.errors.${code.split('.')[1]}`);
  }
  return getApiErrorMessage(error, t);
}
