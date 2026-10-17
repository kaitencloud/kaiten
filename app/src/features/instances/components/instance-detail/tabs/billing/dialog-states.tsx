import { useTranslation } from 'react-i18next';
import { DialogFormSkeleton } from '@/components/dialog/dialog-form-skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RetryableProblem } from '@/domains/billing';
import {
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';

type DialogNoticeProps = {
  children: string;
  onClose: () => void;
  testId: string;
};

/**
 * What a dialog of the Billing tab says when there is nothing for it to do: the
 * state it was opened for is not there (a subscription that ended, a version that
 * is not on sale). It only says why, and closes.
 */
export function DialogNotice({ children, onClose, testId }: DialogNoticeProps) {
  const { t } = useTranslation();

  return (
    <>
      <StackedFormDialogFooter>
        <Button onClick={onClose} type="button" variant="outline">
          {t('Common.close')}
        </Button>
      </StackedFormDialogFooter>
      <StackedFormDialogPanel>
        <Alert data-testid={testId}>
          <AlertDescription>{children}</AlertDescription>
        </Alert>
      </StackedFormDialogPanel>
    </>
  );
}

type DialogProblemProps = {
  error: unknown;
  onClose: () => void;
  onRetry: () => void;
};

/** A read the dialog needs that the API refused: its words, with a way to ask again. */
export function DialogProblem({ error, onClose, onRetry }: DialogProblemProps) {
  const { t } = useTranslation();

  return (
    <>
      <StackedFormDialogFooter>
        <Button onClick={onClose} type="button" variant="outline">
          {t('Common.close')}
        </Button>
      </StackedFormDialogFooter>
      <StackedFormDialogPanel>
        <RetryableProblem error={error} onRetry={onRetry} />
      </StackedFormDialogPanel>
    </>
  );
}

/** The dialog while what it needs is on the way. */
export function DialogLoading({ fields = 3 }: { fields?: number }) {
  return <DialogFormSkeleton fields={fields} />;
}
