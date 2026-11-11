import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Model } from '@/api-client';
import { useAiAccess } from '@/domains/ai-credits';
import {
  aiRateCardQueryOptions,
  wildcardImpactOf,
  type WildcardImpactRow,
} from '@/domains/ai-credits';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/errors';

function ImpactRow({ row }: { row: WildcardImpactRow }) {
  const { t } = useTranslation();
  return (
    <li>
      {t('AI.Models.wildcardRow', {
        version: row.licenseName,
        slug: row.licenseSlug,
        pool: row.entitlementSlug,
        requestType: row.requestType
          ? t(`AI.enums.${row.requestType}`)
          : t('AI.any'),
      })}
    </li>
  );
}

function renderRow(row: WildcardImpactRow, index: number) {
  return (
    <ImpactRow
      key={`${row.licenseSlug}-${row.entitlementSlug}-${index}`}
      row={row}
    />
  );
}

/**
 * The versions and pools whose wildcard rule prices a new model of this
 * modality the moment it is created. One read of the rate card, which is not
 * refetched when the model is saved: the form leaves the page right after.
 */
export function WildcardImpact({ modality }: { modality: Model['modality'] }) {
  const { t } = useTranslation();
  const access = useAiAccess();
  const mayRead =
    access.allows('getLicenses') && access.allows('listConversionRules');
  const query = useQuery({ ...aiRateCardQueryOptions, enabled: mayRead });
  if (!access.available) return null;
  const rows = query.data ? wildcardImpactOf(query.data, modality) : [];
  return (
    <aside className="space-y-2 rounded-md bg-warning-subtle p-3 text-sm text-warning-subtle-foreground">
      <p>{t('AI.wildcardWarning')}</p>
      <p>{t('AI.Models.modelImpact')}</p>
      {!mayRead ? (
        <p>{t('AI.Minimal.impactUnavailable')}</p>
      ) : query.isPending ? (
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
      ) : rows.length ? (
        <details>
          <summary>{t('AI.Minimal.affectedVersions')}</summary>
          <ul>{rows.map(renderRow)}</ul>
        </details>
      ) : (
        <p>{t('AI.Models.wildcardNone')}</p>
      )}
    </aside>
  );
}
