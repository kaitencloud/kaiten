import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
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
import { handleBillingProblem } from '@/domains/billing';
import {
  getVersionFreezeReason,
  VERSION_FREEZE_DESCRIPTION_KEYS,
  VERSION_FREEZE_TITLE_KEYS,
} from '../utils/license-freeze.utils';

type NewVersionDialogProps = {
  /** What the API refused with: it says why the version cannot be changed where it is. */
  error: unknown;
  licenseSlug: string;
  onClose: () => void;
};

/**
 * What a change to a version that is frozen leads to. The API refuses to change
 * what a version sells when a live subscription bills it, when its prices are
 * published, or when it is archived, and every one of those answers the same: a
 * new version. So the refusal is a dialog, not a toast, that says what the API
 * said and offers it. The new version is a form that starts from this one, with
 * its entitlements and its prices, offered as a draft since a draft is what can
 * be changed. Nothing is sent to this version again.
 */
export function NewVersionDialog({
  error,
  licenseSlug,
  onClose,
}: NewVersionDialogProps) {
  const { t } = useTranslation();
  const problem = handleBillingProblem(error);
  // A refusal this dialog is opened for is one of the three; billed is the one
  // that is not a state of the version, and the safe thing to say of the rest.
  const reason = getVersionFreezeReason(problem.code) ?? 'billed';

  return (
    <AlertDialog onOpenChange={(open) => !open && onClose()} open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(VERSION_FREEZE_TITLE_KEYS[reason])}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(VERSION_FREEZE_DESCRIPTION_KEYS[reason])}
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
          <Button
            nativeButton={false}
            render={
              <Link
                params={{ licenseSlug }}
                search={{ draft: true }}
                to="/licenses/versions/$licenseSlug"
              >
                {t('Pages.Licenses.Freeze.createNewVersion')}
              </Link>
            }
            role="link"
          />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
