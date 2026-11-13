import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { type PricingRule, SPECIFICITIES, type Specificity } from '../engine';
import { usePricingLabels } from '../use-pricing-labels';

/** What a level of the ladder does for this call, or what the panel does to it. */
export type LadderMarker =
  | 'APPLIES'
  | 'SHADOWED'
  | 'BLOCKED'
  | 'EMPTY'
  | 'EDITING'
  | 'NEW'
  | 'RULE';

export type LadderRow = {
  marker: LadderMarker;
  rule: PricingRule | null;
  specificity: Specificity;
};

const LEVEL_KEYS = {
  EXACT_TYPED: 'AI.Panel.ladder.levels.EXACT_TYPED',
  EXACT_ALL: 'AI.Panel.ladder.levels.EXACT_ALL',
  ANY_TYPED: 'AI.Panel.ladder.levels.ANY_TYPED',
  ANY_ALL: 'AI.Panel.ladder.levels.ANY_ALL',
} as const satisfies Record<Specificity, string>;

const MARKER_KEYS = {
  APPLIES: 'AI.Panel.ladder.markers.APPLIES',
  SHADOWED: 'AI.Panel.ladder.markers.SHADOWED',
  BLOCKED: 'AI.Panel.ladder.markers.BLOCKED',
  EDITING: 'AI.Panel.ladder.markers.EDITING',
  NEW: 'AI.Panel.ladder.markers.NEW',
} as const;

const ROW_STYLE: Record<LadderMarker, string> = {
  APPLIES: 'border-primary bg-accent text-accent-foreground',
  EDITING: 'border-primary bg-accent text-accent-foreground',
  NEW: 'border-dashed border-primary',
  SHADOWED: 'text-muted-foreground',
  BLOCKED: 'text-muted-foreground',
  RULE: '',
  EMPTY: 'border-dashed text-muted-foreground',
};

/**
 * The levels a call is resolved through, most specific first: the rule on
 * each, and which one prices the call. The engine resolved it; this draws it.
 */
export function LadderView({ rows }: { rows: readonly LadderRow[] }) {
  const { t } = useTranslation();
  const labels = usePricingLabels();

  function renderRow(row: LadderRow) {
    const marker =
      row.marker === 'EMPTY' || row.marker === 'RULE'
        ? null
        : t(MARKER_KEYS[row.marker]);

    return (
      <li
        aria-current={row.marker === 'APPLIES' ? 'true' : undefined}
        className={cn(
          'grid grid-cols-[1.125rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[0.8125rem]',
          ROW_STYLE[row.marker],
        )}
        key={row.specificity}
      >
        <span aria-hidden="true" className="text-[0.6875rem] font-bold">
          {SPECIFICITIES.indexOf(row.specificity) + 1}
        </span>
        <span className="min-w-0">
          {t(LEVEL_KEYS[row.specificity])}
          <span className="block text-[0.6875rem] tabular-nums opacity-85">
            {row.rule
              ? labels.rateSummary(row.rule)
              : row.marker === 'NEW'
                ? t('AI.Panel.ladder.creating')
                : t('AI.Panel.ladder.noRule')}
          </span>
        </span>
        {marker ? (
          <span className="text-[0.6875rem] font-medium">{marker}</span>
        ) : null}
      </li>
    );
  }

  return (
    <ol aria-label={t('AI.Panel.ladder.label')} className="flex flex-col gap-1">
      {rows.map(renderRow)}
    </ol>
  );
}
