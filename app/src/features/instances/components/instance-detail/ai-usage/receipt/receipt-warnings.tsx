import { useTranslation } from 'react-i18next';
import { WarningBadge } from '../inference-cells';
import { ReceiptSection } from './receipt-parts';

/**
 * The warnings the API stored with the row, each as a badge and, where the
 * console knows the code, a sentence saying what it means. A code it does not
 * know is shown as it is.
 */
export function ReceiptWarnings({ warnings }: { warnings: string[] }) {
  const { t } = useTranslation();
  if (!warnings.length) {
    return null;
  }

  function renderWarning(code: string) {
    const help = t(`AI.Receipt.warnings.help.${code}`, '');

    return (
      <li key={code} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <WarningBadge>{t(`AI.Receipt.warnings.${code}`, code)}</WarningBadge>
        {help ? (
          <span className="min-w-0 flex-1 basis-56 text-sm text-muted-foreground">
            {help}
          </span>
        ) : null}
      </li>
    );
  }

  return (
    <ReceiptSection title={t('AI.Receipt.warnings.title')}>
      <ul className="space-y-2">{warnings.map(renderWarning)}</ul>
    </ReceiptSection>
  );
}
