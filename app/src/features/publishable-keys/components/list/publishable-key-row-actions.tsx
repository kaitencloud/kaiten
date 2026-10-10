import { Link } from '@tanstack/react-router';
import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PublishableKey } from '@/api-client';
import { TableActionButton, TableActions } from '@/functionals/table';
import { useCanPerform } from '@/domains/billing';
import { RevokePublishableKeyAction } from '../revoke/revoke-publishable-key-action';

type PublishableKeyRowActionsProps = {
  publishableKey: PublishableKey;
};

/**
 * What can be done to a key: change its label and its origins, or revoke it. A revoked
 * key has no action, since a revocation is final and the API refuses to change it, and a
 * session that may not write the keys is offered none.
 */
export function PublishableKeyRowActions({
  publishableKey,
}: PublishableKeyRowActionsProps) {
  const { t } = useTranslation();
  const mayUpdate = useCanPerform('publishableKeys.update');
  const mayRevoke = useCanPerform('publishableKeys.revoke');

  if (publishableKey.revokedAt || (!mayUpdate && !mayRevoke)) {
    return null;
  }

  return (
    <TableActions>
      {mayUpdate ? (
        <TableActionButton
          asChild
          tooltip={t('Pages.Integrations.PublishableKeys.List.Actions.edit', {
            label: publishableKey.label,
          })}
        >
          <Link
            params={{ keyId: publishableKey.id }}
            search={(previous) => previous}
            to="/integrations/publishable-keys/$keyId/edit"
          >
            <Pencil className="size-4" />
          </Link>
        </TableActionButton>
      ) : null}
      {mayRevoke ? (
        <RevokePublishableKeyAction publishableKey={publishableKey} />
      ) : null}
    </TableActions>
  );
}
