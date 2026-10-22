import {
  createRole,
  deleteRole as deleteRoleOperation,
  listRoles as listRolesOperation,
  setUserEnabled as setUserEnabledOperation,
  updateRole,
  type Role as ApiRole,
  type CreateRole,
} from '@/api-client';

export type Role = ApiRole;
export type RoleInput = CreateRole;

export async function listRoles(signal?: AbortSignal) {
  return (await listRolesOperation({ signal, throwOnError: true })).data;
}

export async function saveRole(body: RoleInput, existingSlug?: string) {
  if (existingSlug) {
    const { slug: _slug, ...update } = body;
    await updateRole({
      path: { slug: existingSlug },
      body: update,
      throwOnError: true,
    });
  } else {
    await createRole({ body, throwOnError: true });
  }
}

export async function setUserEnabled({
  id,
  enabled,
}: {
  id: string;
  enabled: boolean;
}) {
  await setUserEnabledOperation({
    path: { id },
    body: { enabled },
    throwOnError: true,
  });
}

export async function deleteRole(slug: string) {
  await deleteRoleOperation({ path: { slug }, throwOnError: true });
}
