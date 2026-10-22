import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ManagedUser } from '@/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { accessErrorMessage } from '../access-helpers';
import { useAccessMutations } from '../user-management.queries';
import { AccessConfirmation } from './access-confirmation';

export function UserStatus({
  user,
  currentId,
}: {
  user: ManagedUser;
  currentId?: string;
}) {
  const { t } = useTranslation();
  const { enabled } = useAccessMutations();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setError('');
    try {
      await enabled.mutateAsync({
        id: user.id,
        enabled: !user.authorization.enabled,
      });
      toast.success(t('Pages.Access.accessSaved'));
      setConfirm(false);
    } catch (cause) {
      setError(accessErrorMessage(cause, t));
    }
  }
  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-3">
        <Badge variant={user.authorization.enabled ? 'success' : 'secondary'}>
          {t(
            user.authorization.enabled
              ? 'Pages.Access.enabled'
              : 'Pages.Access.disabled',
          )}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          disabled={enabled.isPending || user.id === currentId}
          onClick={() => setConfirm(true)}
        >
          {t(
            user.authorization.enabled
              ? 'Pages.Access.disableUser'
              : 'Pages.Access.enableUser',
          )}
        </Button>
      </div>
      <AccessConfirmation
        open={confirm}
        destructive={user.authorization.enabled}
        confirmLabel={t(
          user.authorization.enabled
            ? 'Pages.Access.disableUser'
            : 'Pages.Access.enableUser',
        )}
        pending={enabled.isPending}
        error={error}
        title={t(
          user.authorization.enabled
            ? 'Pages.Access.confirmDisable'
            : 'Pages.Access.confirmEnable',
        )}
        description={t(
          user.authorization.enabled
            ? 'Pages.Access.disableImpact'
            : 'Pages.Access.accessImpact',
          { name: user.name },
        )}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void save()}
      />
    </div>
  );
}
