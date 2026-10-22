import { useTranslation } from 'react-i18next';
import type { Role } from '../user-management.api';
import {
  effectivePermissions,
  permissionLevel,
  permissionResources,
} from '../access-helpers';

export function AccessSummary({
  slugs,
  permissions,
  roles,
  available,
}: {
  slugs: string[];
  permissions: string[];
  roles: Role[];
  available: string[];
}) {
  const { t } = useTranslation();
  const administrator = roles.some(
    (role) => slugs.includes(role.slug) && role.isAdministrator,
  );
  const inherited = effectivePermissions(slugs, [], roles);
  const effective = effectivePermissions(slugs, permissions, roles);
  if (administrator)
    return (
      <div className="rounded-md bg-primary-subtle p-3 text-sm text-primary-subtle-foreground">
        <p className="font-semibold">{t('Pages.Access.fullAdministrator')}</p>
        <p className="mt-1">{t('Pages.Access.adminExplanation')}</p>
      </div>
    );
  const resources = permissionResources(available).filter(
    (resource) => permissionLevel(effective, resource) !== 'none',
  );
  return (
    <section
      className="rounded-md border p-3"
      aria-label={t('Pages.Access.effectiveAccess')}
    >
      <h4 className="text-sm font-semibold">
        {t('Pages.Access.effectiveAccess')}
      </h4>
      {resources.length ? (
        <ul className="mt-2 space-y-2">
          {resources.map((resource) => (
            <li
              key={resource}
              className="flex flex-wrap justify-between gap-2 text-xs"
            >
              <span>{t(`Pages.Access.resources.${resource}`)}</span>
              <span className="text-muted-foreground">
                {t(
                  `Pages.Access.levels.${permissionLevel(effective, resource)}`,
                )}{' '}
                ·{' '}
                {[
                  permissionLevel(inherited, resource) !== 'none'
                    ? t('Pages.Access.inherited')
                    : null,
                  permissionLevel(permissions, resource) !== 'none'
                    ? t('Pages.Access.direct')
                    : null,
                ]
                  .filter(Boolean)
                  .join(' + ')}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          {t('Pages.Access.noResourceAccess')}
        </p>
      )}
    </section>
  );
}
