import { useTranslation } from 'react-i18next';
import type { Entitlement, Model } from '@/api-client';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AddonGrantDetails, addonGrantLabel } from '@/domains/ai-credits';
import type { AiRequestType, Specificity } from '../engine';
import { PricingChip } from '../pricing-chip';
import { VersionLifecycle } from '../rate-card-headers';
import type { RateCardVersion } from '../rate-card-model';
import { usePricingLabels } from '../use-pricing-labels';
import { type LadderRow, LadderView } from './ladder-view';
import { PanelCallout } from './panel-callout';
import { PanelSection } from './panel-shell';

const MODEL_STATUS_KEYS = {
  ARCHIVED: 'AI.Pricing.model.ARCHIVED',
  DEPRECATED: 'AI.Pricing.model.DEPRECATED',
} as const;

const LEVEL_KEYS = {
  EXACT_TYPED: 'AI.Panel.ladder.levels.EXACT_TYPED',
  EXACT_ALL: 'AI.Panel.ladder.levels.EXACT_ALL',
  ANY_TYPED: 'AI.Panel.ladder.levels.ANY_TYPED',
  ANY_ALL: 'AI.Panel.ladder.levels.ANY_ALL',
} as const satisfies Record<Specificity, string>;

type PanelMetaProps = {
  model: Model | null;
  pool: Entitlement;
  type: AiRequestType;
  version: RateCardVersion;
};

/** Under the title of the panel: the pool, the request type and the states. */
export function PanelMeta({ model, pool, type, version }: PanelMetaProps) {
  const { t } = useTranslation();
  const labels = usePricingLabels();

  return (
    <>
      {pool.name} · {labels.typeLabel(type)} ·
      <VersionLifecycle version={version} />
      {version.grant.granted ? null : version.addonGranted ? (
        <PricingChip tone="accent">
          {addonGrantLabel(version.addons, t)}
        </PricingChip>
      ) : (
        <PricingChip tone="warning">
          {t('AI.Pricing.version.notGranted')}
        </PricingChip>
      )}
      {model && model.status !== 'ACTIVE' ? (
        <PricingChip
          tone={model.status === 'DEPRECATED' ? 'warning' : 'neutral'}
        >
          {t(MODEL_STATUS_KEYS[model.status])}
        </PricingChip>
      ) : null}
    </>
  );
}

type PanelIntroProps = {
  pool: Entitlement;
  rows: readonly LadderRow[];
  version: RateCardVersion;
};

/** How the call is resolved, and what to know about the version before pricing on it. */
export function PanelIntro({ pool, rows, version }: PanelIntroProps) {
  const { t } = useTranslation();

  return (
    <>
      <PanelSection title={t('AI.Panel.ladder.title')}>
        <LadderView rows={rows} />
      </PanelSection>
      {version.lifecycle === 'ARCHIVED' ? (
        <PanelCallout icon="lock">{t('AI.Panel.versionArchived')}</PanelCallout>
      ) : null}
      {version.grant.granted ? null : version.addonGranted ? (
        <PanelSection title={t('AI.Pool.addons.title')}>
          <p className="text-sm">
            {t('AI.Panel.throughAddon', {
              pool: pool.name,
              version: version.name,
            })}
          </p>
          <AddonGrantDetails
            poolName={pool.name}
            state={version.addons ?? { status: 'PENDING' }}
          />
        </PanelSection>
      ) : (
        <PanelCallout icon="warning" tone="warning">
          {t('AI.Panel.notGranted', {
            pool: pool.name,
            version: version.name,
          })}
        </PanelCallout>
      )}
    </>
  );
}

type LevelChoiceProps = {
  level: Specificity;
  /** The levels a new rule may take: those no rule holds yet. */
  levels: readonly Specificity[];
  onChange: (level: Specificity) => void;
};

/** Which level a new rule is created on, when more than one is free. */
export function LevelChoice({ level, levels, onChange }: LevelChoiceProps) {
  const { t } = useTranslation();
  if (levels.length < 2) {
    return null;
  }

  function renderLevel(item: Specificity) {
    return (
      <ToggleGroupItem
        className="h-auto py-1.5 text-xs"
        key={item}
        value={item}
      >
        {t(LEVEL_KEYS[item])}
      </ToggleGroupItem>
    );
  }

  return (
    <PanelSection title={t('AI.Panel.form.level')}>
      <ToggleGroup
        aria-label={t('AI.Panel.form.level')}
        className="flex-wrap"
        onValueChange={([next]) => {
          if (next) onChange(next as Specificity);
        }}
        value={[level]}
        variant="outline"
      >
        {levels.map(renderLevel)}
      </ToggleGroup>
    </PanelSection>
  );
}
