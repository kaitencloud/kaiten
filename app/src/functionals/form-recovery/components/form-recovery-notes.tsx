import { CircleCheck, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FormRecovery } from '../types';
import { useRecoveryText } from './use-recovery-text';

export type FormRecoveryNotesProps = {
  recovery: FormRecovery<any, any>;
  /** Readable names of the omitted paths: `{ code: t('...code') }`. */
  fieldLabels?: Partial<Record<string, string>>;
  className?: string;
};

/**
 * In the step, where the person corrects: what the restore removed or reset,
 * the never-kept fields to enter again, and the note of a chain left
 * unfinished. Persistent until dismissed: an alert that goes by itself would
 * be missed. Escape does not close it, it closes the dialog around.
 */
export function FormRecoveryNotes({
  recovery,
  fieldLabels,
  className,
}: FormRecoveryNotesProps) {
  const text = useRecoveryText();
  const { t } = text;

  const omitted = recovery.notices.find((notice) => notice.kind === 'omitted');
  const pending = recovery.notices.some(
    (notice) => notice.kind === 'followUpPending',
  );
  const { followUpMessageKeys } = recovery.internals.descriptor;

  if (
    !recovery.persistent ||
    (recovery.notes.length === 0 && !omitted && !pending)
  ) {
    return null;
  }

  const dismissLabel = t('Functionals.FormRecovery.dismiss');

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {recovery.notes.length > 0 && (
        <Alert role="status">
          <CircleCheck aria-hidden="true" />
          <AlertTitle className="line-clamp-none">
            {t('Functionals.FormRecovery.notes.title')}
          </AlertTitle>
          <AlertDescription>
            <p>{t('Functionals.FormRecovery.notes.intro')}</p>
            <ul className="list-disc pl-5">
              {recovery.notes.map((note) => (
                <li key={JSON.stringify(note)}>{text.note(note)}</li>
              ))}
            </ul>
          </AlertDescription>
          <div className="col-start-2 mt-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => recovery.dismiss('notes')}
            >
              {dismissLabel}
            </Button>
          </div>
        </Alert>
      )}
      {omitted && (
        <Alert role="status">
          <Info aria-hidden="true" />
          <AlertDescription className="text-foreground">
            <p>
              {t('Functionals.FormRecovery.omitted.reminder', {
                count: omitted.paths.length,
                fields: text.list(
                  omitted.paths.map((path) => fieldLabels?.[path] ?? path),
                ),
              })}
            </p>
          </AlertDescription>
          <div className="col-start-2 mt-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => recovery.dismiss('omitted')}
            >
              {t('Functionals.FormRecovery.omitted.continueWithout')}
            </Button>
          </div>
        </Alert>
      )}
      {pending && (
        <Alert role="status">
          <Info aria-hidden="true" />
          <AlertDescription className="text-foreground">
            <p>
              {followUpMessageKeys
                ? t(followUpMessageKeys.pending)
                : t('Functionals.FormRecovery.followUp.pending')}
            </p>
          </AlertDescription>
          <div className="col-start-2 mt-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => recovery.dismiss('followUpPending')}
            >
              {dismissLabel}
            </Button>
          </div>
        </Alert>
      )}
    </div>
  );
}
