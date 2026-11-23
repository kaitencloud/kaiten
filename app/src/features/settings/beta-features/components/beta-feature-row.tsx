import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import type { BetaFeature } from '../types';
import { useBetaFeatureCopy } from './use-beta-feature-copy';

type BetaFeatureRowProps = {
  beta: BetaFeature;
  /** Whether the caller may flip the toggle; the reason is shown otherwise. */
  canToggle: boolean;
  pending: boolean;
  /** Another toggle is being written: one change at a time. */
  locked: boolean;
  onToggle: (enabled: boolean) => void;
};

const STAGE_KEYS = {
  public_beta: 'publicBeta',
  open_beta: 'openBeta',
} as const;

/** One beta: its title, its stage, and the toggle that holds its state. */
export function BetaFeatureRow({
  beta,
  canToggle,
  pending,
  locked,
  onToggle,
}: BetaFeatureRowProps) {
  const { t } = useTranslation();
  const copyOf = useBetaFeatureCopy();
  const { title, description } = copyOf(beta);
  const stageKey = STAGE_KEYS[beta.stage];

  return (
    <li
      className="flex items-start justify-between gap-4 py-4"
      data-enabled={beta.enabled}
      data-slug={beta.flagSlug}
      data-testid="beta-feature"
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{title}</p>
          <Badge variant="outline">
            {t(`Pages.Settings.BetaFeatures.stages.${stageKey}.label`)}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
        <p className="text-xs text-muted-foreground">
          {t(`Pages.Settings.BetaFeatures.stages.${stageKey}.hint`)}
        </p>
        {!canToggle && (
          <p
            className="text-xs text-muted-foreground"
            data-testid="beta-feature-read-only"
          >
            {t('Pages.Settings.BetaFeatures.readOnly')}
          </p>
        )}
        {pending && (
          <p className="text-xs text-muted-foreground" role="status">
            {t('Pages.Settings.BetaFeatures.saving')}
          </p>
        )}
      </div>
      <Switch
        aria-label={title}
        checked={beta.enabled}
        className="mt-0.5"
        disabled={!canToggle || pending || locked}
        onCheckedChange={onToggle}
      />
    </li>
  );
}
