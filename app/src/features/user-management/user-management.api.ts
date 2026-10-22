import {
  createRole,
  deleteRole as deleteRoleOperation,
  getUser,
  listRoles as listRolesOperation,
  setUserEnabled as setUserEnabledOperation,
  updateRole,
  updateUser,
  type ManagedUser,
  type Profile,
  type Role as ApiRole,
  type CreateRole,
} from '@/api-client';
import { FRESH_READ_OPTIONS, writeOnFresh } from '@/lib/api/fresh-write';

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

/** The update that restates the profile of a user as it stands: the name and the e-mail. */
export const userToProfile = (
  user: Pick<ManagedUser, 'email' | 'name'>,
): Profile => ({
  email: user.email ?? '',
  name: user.name,
});

export type SaveProfileVariables = {
  /** What the form sends, built from the profile it opened with. */
  edited: Profile;
  id: string;
  /** What the form opened with. */
  opened: Profile;
};

/**
 * Updates the profile of a user without overwriting what changed since the form
 * opened. The update replaces the name and the e-mail together, so saving the name
 * from an old form would take back an e-mail saved from another tab: the user is
 * read again and the form's changes are applied on top of it (`writeOnFresh`). A
 * user deleted meanwhile is refused by the read, and nothing is written.
 */
export function saveProfileOnFresh({
  edited,
  id,
  opened,
}: SaveProfileVariables) {
  return writeOnFresh({
    edited,
    opened,
    read: async () =>
      (
        await getUser({
          ...FRESH_READ_OPTIONS,
          path: { id },
          throwOnError: true,
        })
      ).data,
    restate: userToProfile,
    write: async (body) =>
      (await updateUser({ body, path: { id }, throwOnError: true })).data,
  });
}
