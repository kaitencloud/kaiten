import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAiAccess } from '@/domains/ai-credits';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/errors';
import { wildcardQueryOptions } from '../queries/ai-query-options';

export function WildcardImpact() {
  const { t } = useTranslation();
  const access = useAiAccess();
  const mayRead =
    access.allows('getLicenses') && access.allows('listConversionRules');
  const query = useQuery({ ...wildcardQueryOptions, enabled: mayRead });
  if (!access.available) return null;
  return (
    <aside className="space-y-2 rounded-md bg-warning-subtle p-3 text-sm text-warning-subtle-foreground">
      <p>{t('AI.wildcardWarning')}</p>
      <p>{t('AI.Models.modelImpact')}</p>
      {mayRead ? (
        query.isPending ? (
          <p>{t('Common.loading')}</p>
        ) : query.isError ? (
          <p role="alert">
            {getApiErrorMessage(query.error)}{' '}
            <Button
              variant="outline"
              type="button"
              onClick={() => query.refetch()}
            >
              {t('Common.retry')}
            </Button>
          </p>
        ) : (
          <details>
            <summary>{t('AI.Minimal.affectedVersions')}</summary>
            <ul>
              {query.data.map((row, index) => (
                <li key={`${row.licenseSlug}-${row.entitlementSlug}-${index}`}>
                  {row.licenseSlug} / {row.entitlementSlug}
                </li>
              ))}
            </ul>
          </details>
        )
      ) : (
        <p>{t('AI.Minimal.impactUnavailable')}</p>
      )}
    </aside>
  );
}
