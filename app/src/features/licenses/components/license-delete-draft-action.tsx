import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { type MouseEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { License } from '@/api-client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useDeleteLicenseDraft } from '../hooks/use-delete-license-draft';
import { getLicenseLifecycleState } from '../utils/license-lifecycle.utils';

const APPEARANCES = {
  card: { className: 'gap-1', variant: 'outline' },
  row: {
    className:
      'gap-1 px-0 text-destructive-subtle-foreground hover:text-destructive-subtle-foreground',
    variant: 'ghost',
  },
} as const;

type LicenseDeleteDraftActionProps = {
  appearance: keyof typeof APPEARANCES;
  license: Pick<License, 'lifecycleState' | 'name' | 'slug' | 'version'>;
  onDeleted?: () => void;
};

type Target = Pick<License, 'name' | 'version'> & { licenseSlug: string };

function keepClickOffTheRow(event: MouseEvent) {
  event.stopPropagation();
}

// Deletes a draft, confirmed first. Archiving is for versions that have been
// on sale; a draft that will not be published is removed instead, with the
// grants it was given. Nothing is offered for other states.
export function LicenseDeleteDraftAction({
  appearance,
  license,
  onDeleted,
}: LicenseDeleteDraftActionProps) {
  const { t } = useTranslation();
  const { deleteDraft, isPending } = useDeleteLicenseDraft(onDeleted);
  const [target, setTarget] = useState<Target | null>(null);
  const look = APPEARANCES[appearance];

  if (getLicenseLifecycleState(license) !== 'DRAFT' && target === null) {
    return null;
  }

  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        setTarget(
          open && license.slug
            ? {
                licenseSlug: license.slug,
                name: license.name,
                version: license.version,
              }
            : null,
        );
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={look.variant}
          size="sm"
          className={look.className}
          disabled={isPending || !license.slug}
          onClick={keepClickOffTheRow}
        >
          <Trash2 className="size-3" />
          {t('Pages.Licenses.DeleteDraft.label')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('Pages.Licenses.DeleteDraft.title', {
              name: target?.name ?? license.name,
              version: target?.version ?? license.version,
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('Pages.Licenses.DeleteDraft.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">
            {t('Common.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (target) {
                deleteDraft({ licenseSlug: target.licenseSlug });
              }
            }}
          >
            {t('Pages.Licenses.DeleteDraft.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
