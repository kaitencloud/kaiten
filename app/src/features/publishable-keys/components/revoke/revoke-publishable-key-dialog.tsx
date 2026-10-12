import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublishableKey } from '@/api-client';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ProblemAlert } from '@/domains/billing';
import { useRevokePublishableKey } from '../../hooks/use-revoke-publishable-key';

type RevokePublishableKeyDialogProps = {
  onClose: () => void;
  publishableKey: Pick<PublishableKey, 'id' | 'keyHint' | 'label'>;
};

/**
 * Asks before a key is revoked, which cannot be undone. The text says what revoking
 * does: the key stops authenticating on the next request, so every page that sends it
 * stops reading the catalogue, and a new key has to be put in its place. A refusal is
 * read in the dialog, which stays open.
 */
export function RevokePublishableKeyDialog({
  onClose,
  publishableKey,
}: RevokePublishableKeyDialogProps) {
  const { t } = useTranslation();
  const revoke = useRevokePublishableKey();
  const [error, setError] = useState<unknown>(null);

  async function confirm() {
    setError(null);
    try {
      await revoke.mutateAsync({ path: { keyId: publishableKey.id } });
      onClose();
    } catch (failure) {
      setError(failure);
    }
  }

  return (
    <AlertDialog onOpenChange={(open) => !open && onClose()} open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('Pages.Integrations.PublishableKeys.Revoke.title', {
              label: publishableKey.label,
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('Pages.Integrations.PublishableKeys.Revoke.description', {
              hint: publishableKey.keyHint,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <ProblemAlert autoFocus error={error} onRetry={confirm} />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">
            {t('Common.cancel')}
          </AlertDialogCancel>
          {/* Not an AlertDialogAction: that one closes the dialog, and a refusal has to
              be read where it was asked for. */}
          <Button
            disabled={revoke.isPending}
            onClick={confirm}
            type="button"
            variant="destructive"
          >
            {t('Pages.Integrations.PublishableKeys.Revoke.confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
