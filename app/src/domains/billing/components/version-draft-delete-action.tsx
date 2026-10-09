import { Trash2 } from 'lucide-react';
import { type MouseEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DELETE_ACTION_LOOKS,
  type RowActionAppearance,
} from './row-action-looks';

type Target = {
  name: string;
  slug: string;
  version: number | string | undefined;
};

/** The keys of the words of the deletion: its button, its confirmation and what confirming says. */
export type VersionDeleteKeys = Record<
  'confirm' | 'description' | 'label' | 'title',
  string
>;

type VersionDraftDeleteActionProps = {
  appearance: RowActionAppearance;
  isPending: boolean;
  keys: VersionDeleteKeys;
  name: string;
  /** What confirming does, with the slug of the version the confirmation was opened for. */
  onDelete: (slug: string) => void;
  /** The slug of the version; the action is disabled without one. */
  slug: string | undefined;
  /** Whether the action is offered: a draft, and a session that may delete it. */
  offered: boolean;
  version: number | string | undefined;
};

// A versions table row opens its version when clicked; this button is not a click on
// the row.
function keepClickOffTheRow(event: MouseEvent) {
  event.stopPropagation();
}

/**
 * Deletes a draft, confirmed first. Archiving is for versions that have been on sale;
 * a draft that will not be published is removed instead, with what it was given.
 * Nothing is offered for other states. The versions of a license and those of an
 * add-on share the dialog and the looks; each feature brings its words, its guard and
 * the deletion itself.
 */
export function VersionDraftDeleteAction({
  appearance,
  isPending,
  keys,
  name,
  offered,
  onDelete,
  slug,
  version,
}: VersionDraftDeleteActionProps) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<Target | null>(null);
  const look = DELETE_ACTION_LOOKS[appearance];

  if (!offered && target === null) {
    return null;
  }

  return (
    <AlertDialog
      onOpenChange={(open) => {
        setTarget(open && slug ? { name, slug, version } : null);
      }}
      open={target !== null}
    >
      <AlertDialogTrigger
        render={
          <Button
            className={look.className}
            disabled={isPending || !slug}
            onClick={keepClickOffTheRow}
            size="sm"
            type="button"
            variant={look.variant}
          >
            <Trash2 className="size-3" />
            {t(keys.label)}
          </Button>
        }
      />
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(keys.title, {
              name: target?.name ?? name,
              version: target?.version ?? version,
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t(keys.description)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">
            {t('Common.cancel')}
          </AlertDialogCancel>
          <AlertDialogClose
            render={
              <AlertDialogAction
                onClick={() => {
                  if (target) {
                    onDelete(target.slug);
                  }
                }}
                variant="destructive"
              >
                {t(keys.confirm)}
              </AlertDialogAction>
            }
          />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
