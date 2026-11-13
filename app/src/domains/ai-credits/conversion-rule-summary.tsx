import { useTranslation } from 'react-i18next';
import type { ConversionRule } from '@/api-client';

export function ConversionRuleSummary({ rule }: { rule: ConversionRule }) {
  const { t } = useTranslation();
  function renderRate([key, value]: [string, unknown]) {
    return (
      <div key={key} className="flex justify-between gap-4">
        <dt className="text-muted-foreground">{t(`AI.rates.${key}`)}</dt>
        <dd className="text-right tabular-nums whitespace-nowrap">
          {String(value)} {t('AI.credits')}
        </dd>
      </div>
    );
  }
  return (
    <>
      <dl className="space-y-2 text-xs">
        {Object.entries(rule.rates)
          .filter(([key, value]) => key !== '__typename' && value != null)
          .map(renderRate)}
      </dl>
      <dl className="space-y-2 border-t pt-3 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t('AI.Matrix.minimum')}</dt>
          <dd className="text-right tabular-nums">
            {rule.minimumCreditsPerRequest} {t('AI.credits')}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t('AI.Matrix.maximum')}</dt>
          <dd className="text-right tabular-nums">
            {rule.maximumCreditsPerRequest == null
              ? t('AI.Matrix.noPerRequestCap')
              : `${rule.maximumCreditsPerRequest} ${t('AI.credits')}`}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">
            {t('AI.Matrix.chargeOnError')}
          </dt>
          <dd className="text-right">{t(`AI.enums.${rule.chargeOnError}`)}</dd>
        </div>
      </dl>
      {!rule.grantedByLicense ? (
        <p className="text-warning-subtle-foreground">
          {t('AI.Matrix.notGranted')}
        </p>
      ) : null}
    </>
  );
}
