import { Link } from '@tanstack/react-router';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AddonEntitlement, Entitlement } from '@/api-client';
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
import {
  handleBillingProblem,
  ProblemAlert,
  useCanPerform,
} from '@/domains/billing';
import { useAddonGrantMutations } from '../../hooks';
import { getAddonFreezeReason } from '../../utils/addon-freeze.utils';

type AddonGrantRowActionsProps = {
  addonSlug: string;
  entitlement: Entitlement | undefined;
  grant: AddonEntitlement;
  onFrozen: (error: unknown) => void;
};

type RemoveGrantDialogProps = AddonGrantRowActionsProps & {
  name: string;
  onClose: () => void;
};

/**
 * Asks before a grant is taken away: instances that hold the version lose the
 * entitlement at once. A version an instance with a live subscription holds is frozen,
 * and the refusal leads to a new version instead; any other refusal is read in the
 * dialog, which stays open.
 */
function RemoveGrantDialog({
  addonSlug,
  grant,
  name,
  onClose,
  onFrozen,
}: RemoveGrantDialogProps) {
  const { t } = useTranslation();
  const { unassign } = useAddonGrantMutations(addonSlug);
  const [error, setError] = useState<unknown>(null);

  async function confirm() {
    setError(null);
    try {
      await unassign.mutateAsync({
        path: { addonSlug, entitlementSlug: grant.entitlementSlug },
      });
      onClose();
    } catch (failure) {
      if (getAddonFreezeReason(handleBillingProblem(failure).code)) {
        onClose();
        onFrozen(failure);

        return;
      }
      setError(failure);
    }
  }

  return (
    <AlertDialog onOpenChange={(open) => !open && onClose()} open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('Pages.Addons.Grants.Remove.title', { name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('Pages.Addons.Grants.Remove.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <ProblemAlert error={error} onRetry={confirm} /> : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">
            {t('Common.cancel')}
          </AlertDialogCancel>
          {/* Not an AlertDialogAction: that one closes the dialog, and a refusal has
              to be read where it was asked for. */}
          <Button
            disabled={unassign.isPending}
            onClick={confirm}
            type="button"
            variant="destructive"
          >
            {t('Pages.Addons.Grants.Remove.confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * What can be done to one grant: edit it, which opens its dialog by the URL, and take
 * it away after a confirmation. An action the scopes of the session do not cover is
 * not there, and a row with nothing to offer shows none.
 */
export function AddonGrantRowActions(props: AddonGrantRowActionsProps) {
  const { addonSlug, entitlement, grant } = props;
  const { t } = useTranslation();
  const mayUpdate = useCanPerform('addonGrants.update');
  const mayUnassign = useCanPerform('addonGrants.unassign');
  const [removing, setRemoving] = useState(false);
  const name = entitlement?.name ?? grant.entitlementSlug;

  return (
    <div className="flex h-8 items-center justify-end gap-1" data-row-actions>
      {mayUpdate ? (
        <Button
          aria-label={t('Pages.Addons.Grants.Actions.editAria', { name })}
          className="gap-1"
          nativeButton={false}
          render={
            <Link
              params={{ addonSlug }}
              search={{ grant: grant.entitlementSlug }}
              to="/catalog/addons/$addonSlug/entitlements"
            >
              <Pencil className="size-3" />
              {t('Pages.Addons.Grants.Actions.edit')}
            </Link>
          }
          role="link"
          size="sm"
          variant="ghost"
        />
      ) : null}
      {mayUnassign ? (
        <Button
          aria-label={t('Pages.Addons.Grants.Actions.removeAria', { name })}
          className="gap-1"
          onClick={() => setRemoving(true)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Trash2 className="size-3" />
          {t('Pages.Addons.Grants.Actions.remove')}
        </Button>
      ) : null}
      {removing ? (
        <RemoveGrantDialog
          {...props}
          name={name}
          onClose={() => setRemoving(false)}
        />
      ) : null}
    </div>
  );
}
