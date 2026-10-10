import { Ban } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublishableKey } from '@/api-client';
import { TableActionButton } from '@/functionals/table';
import { RevokePublishableKeyDialog } from './revoke-publishable-key-dialog';

type RevokePublishableKeyActionProps = {
  publishableKey: PublishableKey;
};

/**
 * The button of a row that revokes its key, and the confirmation it opens. The dialog
 * is local state, not a route: it confirms an action on the key of a page and edits
 * nothing, and what it changes shows on the list behind it.
 */
export function RevokePublishableKeyAction({
  publishableKey,
}: RevokePublishableKeyActionProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableActionButton
        className="text-destructive-subtle-foreground hover:text-destructive-subtle-foreground"
        onClick={() => setOpen(true)}
        tooltip={t('Pages.Integrations.PublishableKeys.List.Actions.revoke', {
          label: publishableKey.label,
        })}
      >
        <Ban className="size-4" />
      </TableActionButton>
      {open ? (
        <RevokePublishableKeyDialog
          onClose={() => setOpen(false)}
          publishableKey={publishableKey}
        />
      ) : null}
    </>
  );
}
