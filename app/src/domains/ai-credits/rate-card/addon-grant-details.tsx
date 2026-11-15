import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/format-date';
import type { AddonGrant } from './addon-grants-query';
import type { AddonGrantsState } from './use-addon-grants';

type AddonGrantDetailsProps = {
  /** The pool's name, for the sentence that says what an add-on grant means. */
  poolName: string;
  state: AddonGrantsState;
};

function creditsOf(grant: AddonGrant): number | null {
  const value: unknown = (grant.value as { value?: unknown }).value;

  return typeof value === 'number' ? value : null;
}

function AddonGrantItem({ grant }: { grant: AddonGrant }) {
  const { t } = useTranslation();
  const credits = creditsOf(grant);
  const lifecycleHelp = t(
    `AI.Pool.addons.lifecycleHelp.${grant.lifecycleState}`,
    '',
  );

  return (
    <li className="rounded-lg border p-2.5">
      {/* A div: the badges are block elements, which a paragraph may not hold. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{grant.addonName}</span>
        <span className="text-muted-foreground">
          {t('AI.Pool.addons.version', { version: grant.addonVersion })}
        </span>
        <Badge className="font-medium shadow-none" variant="outline">
          {t(`AI.Pool.addons.lifecycle.${grant.lifecycleState}`)}
        </Badge>
        {grant.isDefault ? (
          <Badge className="font-medium shadow-none" variant="secondary">
            {t('AI.Pool.addons.default')}
          </Badge>
        ) : null}
      </div>
      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
        {grant.addonSlug}
      </p>
      <p className="mt-1 tabular-nums">
        {grant.unlimited || credits === null
          ? t('AI.Pool.addons.unlimited')
          : t('AI.Pool.addons.perUnit', { amount: formatNumber(credits) })}
        {' · '}
        {t(`AI.Pool.addons.behavior.${grant.overrideBehavior}`)}
        {grant.maxQuantity == null
          ? null
          : ` · ${t('AI.Pool.addons.maxQuantity', { count: grant.maxQuantity })}`}
      </p>
      {lifecycleHelp ? (
        <p className="mt-1 text-xs text-muted-foreground">{lifecycleHelp}</p>
      ) : null}
    </li>
  );
}

function renderGrant(grant: AddonGrant) {
  return <AddonGrantItem grant={grant} key={grant.addonId} />;
}

/**
 * What add-ons can grant of a pool on a licence family: the sentence that says
 * what that means (and what it does not), then each add-on version with its
 * state, what it grants and whether it is the family's default; or why they
 * cannot be listed here. Shown by the rate card and by the pool's Pricing tab.
 */
export function AddonGrantDetails({ poolName, state }: AddonGrantDetailsProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted-foreground">
        {t('AI.Pool.addons.explain', { pool: poolName })}
      </p>
      {state.status === 'PENDING' ? (
        <p role="status" className="text-muted-foreground">
          {t('AI.Pool.addons.loading')}
        </p>
      ) : state.status === 'UNREADABLE' ? (
        <p>{t(`AI.Pool.addons.unreadable.${state.reason}`)}</p>
      ) : state.grants.length === 0 ? (
        <p>{t('AI.Pool.addons.none')}</p>
      ) : (
        <ul className="space-y-1.5">{state.grants.map(renderGrant)}</ul>
      )}
    </div>
  );
}
