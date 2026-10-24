import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { Addon } from '@/api-client';
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
import { handleBillingProblem, useCanPerform } from '@/domains/billing';
import {
  ADDON_FREEZE_DESCRIPTION_KEYS,
  ADDON_FREEZE_TITLE_KEYS,
  getAddonFreezeReason,
} from '../utils/addon-freeze.utils';

type FrozenVersionDialogProps = {
  addon: Pick<Addon, 'familySlug'>;
  /** What the API refused with: it says why the version cannot be changed where it is. */
  error: unknown;
  onClose: () => void;
};

/**
 * What a change to a version that is frozen leads to. The API refuses to change what a
 * version sells when an instance with a live subscription holds it, and to price one
 * that is archived, and both answers are the same: a new version. So the refusal is a
 * dialog, not a toast, that says what the API said and offers it. A new version of an
 * add-on starts from nothing: the API copies no grant, no price and no license from
 * the version it follows, and the dialog says so. Nothing is sent to this version
 * again.
 */
export function FrozenVersionDialog({
  addon,
  error,
  onClose,
}: FrozenVersionDialogProps) {
  const { t } = useTranslation();
  const mayCreate = useCanPerform('addons.create');
  const problem = handleBillingProblem(error);
  // A refusal this dialog is opened for is one of the two; billed is the one that is
  // not a state of the version, and the safe thing to say of the rest.
  const reason = getAddonFreezeReason(problem.code) ?? 'billed';

  return (
    <AlertDialog onOpenChange={(open) => !open && onClose()} open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(ADDON_FREEZE_TITLE_KEYS[reason])}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(ADDON_FREEZE_DESCRIPTION_KEYS[reason])}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {problem.detail ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm" role="note">
            {problem.detail}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">
            {t('Common.cancel')}
          </AlertDialogCancel>
          {mayCreate ? (
            <Button
              nativeButton={false}
              render={
                <Link
                  search={{ family: addon.familySlug }}
                  to="/catalog/addons/new"
                >
                  {t('Pages.Addons.Freeze.createNewVersion')}
                </Link>
              }
              role="link"
            />
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
