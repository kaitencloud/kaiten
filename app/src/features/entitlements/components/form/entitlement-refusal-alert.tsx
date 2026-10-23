import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type EntitlementRefusalAlertProps = {
  /** The translation key of the sentence: one of the form's refusals. */
  messageKey: string;
};

/**
 * A refusal of the API that has no field to be shown on, above the buttons of the
 * form: the reset pair of an entitlement that already has one is read-only, so
 * there is nothing to edit to mend it. It does not block the form, which can be
 * sent again.
 */
export function EntitlementRefusalAlert({
  messageKey,
}: EntitlementRefusalAlertProps) {
  const { t } = useTranslation();

  return (
    <Alert data-testid="entitlement-refusal" variant="destructive">
      <TriangleAlert />
      <AlertTitle>{t('Features.Billing.Problems.title')}</AlertTitle>
      <AlertDescription>
        <p>{t(messageKey)}</p>
      </AlertDescription>
    </Alert>
  );
}
