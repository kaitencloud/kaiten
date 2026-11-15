import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArchiveIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Model } from '@/api-client';
import { deleteModelMutation } from '@/api-client/@tanstack/react-query.gen';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  archiveModel,
  invalidateAiQueries,
  useAiAccess,
} from '@/domains/ai-credits';
import { getApiErrorMessage, isApiError, isProblem } from '@/lib/errors';

type ModelRemovalDialogProps = {
  model: Model;
  /** The active rules that name the model, when the rate card is read. */
  rulesCount: number | undefined;
  onClose: () => void;
};

const isInUse = (error: unknown) =>
  isApiError(error) &&
  isProblem(error.data) &&
  error.data.code === 'DeleteModel.InUse';

/**
 * Asked when Delete is pressed on a model. A model no rule names is deleted,
 * after the usual confirmation. A model a rule names cannot be: the API refuses
 * it (409 `DeleteModel.InUse`), so the dialog offers to archive it instead and
 * says what that does. The same offer follows a refusal the count did not
 * foresee (a rule the rate card does not list, such as an archived one).
 */
export function ModelRemovalDialog({
  model,
  rulesCount,
  onClose,
}: ModelRemovalDialogProps) {
  const { t } = useTranslation();
  const access = useAiAccess();
  const client = useQueryClient();
  // The API refused the deletion: the model is in use, whatever the count said.
  const [refused, setRefused] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const remove = useMutation(deleteModelMutation());
  const archive = useMutation({ mutationFn: () => archiveModel(model.slug) });
  const inUse = refused || (rulesCount ?? 0) > 0;
  const archived = model.status === 'ARCHIVED';
  const pending = remove.isPending || archive.isPending;

  async function confirmDelete() {
    setFailure(null);
    try {
      await remove.mutateAsync({ path: { modelSlug: model.slug } });
      await invalidateAiQueries(client);
      toast.success(t('AI.Models.removal.deleted', { model: model.name }));
      onClose();
    } catch (error) {
      if (isInUse(error)) {
        setRefused(true);
      } else {
        setFailure(getApiErrorMessage(error));
      }
    }
  }

  async function confirmArchive() {
    setFailure(null);
    try {
      await archive.mutateAsync();
      await invalidateAiQueries(client);
      toast.success(t('AI.Models.removal.archived', { model: model.name }));
      onClose();
    } catch (error) {
      setFailure(getApiErrorMessage(error));
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia
            className={
              inUse
                ? 'bg-warning-subtle text-warning-subtle-foreground'
                : 'bg-destructive-subtle text-destructive-subtle-foreground'
            }
          >
            {inUse ? <ArchiveIcon /> : <Trash2Icon />}
          </AlertDialogMedia>
          <AlertDialogTitle>
            {inUse
              ? t('AI.Models.removal.inUseTitle', { model: model.name })
              : t('Common.confirmDeleteTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            {inUse ? (
              <>
                <span className="block">
                  {refused
                    ? t('AI.Models.removal.refused')
                    : t('AI.Models.removal.inUse', { count: rulesCount ?? 0 })}
                </span>
                <span className="block">
                  {archived
                    ? t('AI.Models.removal.alreadyArchived')
                    : t('AI.Models.removal.archiveInstead')}
                </span>
              </>
            ) : (
              t('Common.confirmDeleteDescription', { name: model.name })
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failure ? (
          <p
            role="alert"
            className="rounded-lg bg-destructive-subtle p-3 text-sm text-destructive-subtle-foreground"
          >
            {failure}
          </p>
        ) : null}
        <AlertDialogFooter>
          {inUse ? (
            <Button
              nativeButton={false}
              variant="ghost"
              className="sm:mr-auto"
              render={
                <Link
                  to="/ai/pricing"
                  search={{ q: model.slug, status: 'all' }}
                />
              }
            >
              {t('AI.Models.removal.openRules')}
            </Button>
          ) : null}
          <AlertDialogCancel variant="outline">
            {t('Common.cancel')}
          </AlertDialogCancel>
          {/* Plain buttons, not the dialog's own action: that one closes the
              dialog when pressed, and a refusal has to be shown in it. */}
          {!inUse ? (
            <Button
              key="delete"
              disabled={pending}
              onClick={() => void confirmDelete()}
              type="button"
              variant="destructive"
            >
              {t('Common.delete')}
            </Button>
          ) : archived || !access.allows('updateModel') ? null : (
            <Button
              key="archive"
              disabled={pending}
              onClick={() => void confirmArchive()}
              type="button"
            >
              {t('AI.Models.removal.archive')}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
