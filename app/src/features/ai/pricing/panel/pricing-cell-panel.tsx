import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiUsage, Entitlement, Model } from '@/api-client';
import { Button } from '@/components/ui/button';
import { useAiAccess } from '@/domains/ai-credits';
import {
  type AiRequestType,
  buildRateCardCell,
  isOwnRule,
  type PricingRule,
  resolveLadder,
  type Specificity,
} from '../engine';
import {
  type CellRef,
  type RateCardVersion,
  wildcardOf,
} from '../rate-card-model';
import { usePricingLabels } from '../use-pricing-labels';
import { PanelCallout } from './panel-callout';
import { LevelChoice, PanelIntro, PanelMeta } from './panel-intro';
import {
  type LadderFocus,
  modelLadder,
  wildcardLadder,
  wildcardScope,
} from './panel-model';
import { PanelShell } from './panel-shell';
import {
  ArchivedModelState,
  InheritedState,
  NoRuleState,
} from './panel-states';
import { RuleFormPanel } from './rule-form-panel';

export type PricingCellPanelProps = {
  creditValue: string | null;
  /** The model of the cell; null for the wildcard row. */
  model: Model | null;
  /** The whole catalogue: what a wildcard covers is counted over it. */
  models: readonly Model[];
  /** Closes the panel; `discard` drops unsent changes without asking. */
  onClose: (options?: { discard?: boolean }) => void;
  onDirtyChange: (dirty: boolean) => void;
  onOpenCell: (cell: CellRef) => void;
  pool: Entitlement;
  reference: AiUsage;
  type: AiRequestType;
  version: RateCardVersion;
};

const MODEL_LEVELS: readonly Specificity[] = ['EXACT_TYPED', 'EXACT_ALL'];
const WILDCARD_LEVELS: readonly Specificity[] = ['ANY_TYPED', 'ANY_ALL'];
const isTyped = (level: Specificity) =>
  level === 'EXACT_TYPED' || level === 'ANY_TYPED';

/**
 * The panel of one cell of the rate card. It shows how the call is resolved,
 * then what the cell allows: edit the rule that names the model, override a
 * wildcard for it, add a rule where there is none, edit a wildcard knowing what
 * it reprices. A model that is archived is explained, never priced.
 */
export function PricingCellPanel(props: PricingCellPanelProps) {
  const { t } = useTranslation();
  const labels = usePricingLabels();
  const access = useAiAccess();
  const { model, pool, type, version } = props;
  // The level of a rule being created, once the person asked for one.
  const [creating, setCreating] = useState<Specificity | null>(null);
  // Unsent changes of the form: a rule on another level is not offered over them.
  const [dirty, setDirty] = useState(false);
  const { onDirtyChange } = props;
  const reportDirty = useCallback(
    (value: boolean) => {
      setDirty(value);
      onDirtyChange(value);
    },
    [onDirtyChange],
  );
  const canCreate = access.allows('createConversionRule');
  const canUpdate = access.allows('updateConversionRule');
  const wildcard = wildcardOf(version.rules, type);
  const cell = model
    ? buildRateCardCell({
        rules: version.rules,
        model,
        requestType: type,
        referenceUsage: props.reference,
        poolGranted: version.grant.granted,
        creditValue: props.creditValue,
      })
    : null;
  const ownRule =
    cell?.rule && cell.specificity && isOwnRule(cell.specificity)
      ? cell.rule
      : null;
  const deprecated = model?.status === 'DEPRECATED';
  const held = model
    ? resolveLadder(version.rules, model, type).levels
    : wildcardLadder(version, type, { kind: 'none' });
  const freeLevels = (model ? MODEL_LEVELS : WILDCARD_LEVELS).filter(
    (level) => !held.some((row) => row.specificity === level && row.rule),
  );
  // A wildcard cell with no wildcard opens on the form of a new one.
  const newLevel =
    creating ??
    (!model && !wildcard && canCreate ? (freeLevels[0] ?? null) : null);
  const editing: PricingRule | null =
    newLevel === null ? (model ? ownRule : wildcard) : null;

  // Beside a rule being edited, the level a second rule may take: the other
  // wildcard level, or the exact request type over a rule that prices every
  // type of the model.
  const otherLevel: Specificity | null =
    !editing || !canCreate || deprecated
      ? null
      : !model
        ? (freeLevels[0] ?? null)
        : editing.requestType == null && freeLevels.includes('EXACT_TYPED')
          ? 'EXACT_TYPED'
          : null;

  const focus: LadderFocus = newLevel
    ? { kind: 'new', level: newLevel }
    : editing && !model
      ? { kind: 'editing', ruleId: editing.id }
      : { kind: 'none' };
  const rows = model
    ? modelLadder(version, model, type, focus)
    : wildcardLadder(version, type, focus);
  const shell = {
    meta: <PanelMeta model={model} pool={pool} type={type} version={version} />,
    onClose: () => props.onClose(),
    title: `${model?.name ?? t('AI.Pricing.grid.anyModel')} · ${version.name} ${version.versionLabel}`,
  };
  const intro = <PanelIntro pool={pool} rows={rows} version={version} />;
  const openWildcard = () =>
    props.onOpenCell({ licenseSlug: version.slug, modelSlug: null });

  if (newLevel !== null || editing !== null) {
    const level = newLevel ?? 'EXACT_TYPED';
    const covered = model
      ? []
      : wildcardScope(
          version,
          props.models,
          type,
          editing ? { rule: editing } : { level },
        );
    const fallback =
      editing && model
        ? resolveLadder(
            version.rules.filter((rule) => rule.id !== editing.id),
            model,
            type,
          ).winner
        : null;

    return (
      <RuleFormPanel
        archiveConsequence={
          model
            ? fallback
              ? fallback.modelSlug
                ? t('AI.Panel.archive.fallsBackOwn', { model: model.name })
                : t('AI.Panel.archive.fallsBack', {
                    model: model.name,
                    wildcard: labels.wildcardName(fallback),
                  })
              : t('AI.Panel.archive.refused', {
                  model: model.name,
                  version: version.name,
                })
            : t('AI.Panel.archive.wildcard', {
                count: covered.length,
                version: version.name,
              })
        }
        canArchive={access.allows('archiveConversionRule')}
        canSave={editing ? canUpdate : canCreate}
        covered={covered}
        creditValue={props.creditValue}
        identity={{
          entitlementSlug: pool.slug ?? '',
          licenseSlug: version.slug,
          modelSlug: model?.slug ?? null,
          requestType: editing
            ? (editing.requestType ?? null)
            : isTyped(level)
              ? type
              : null,
        }}
        intro={
          <>
            {intro}
            {deprecated ? (
              <PanelCallout icon="lock" tone="warning">
                {t('AI.Panel.deprecated.keepsRule')}
              </PanelCallout>
            ) : null}
            {model ? null : (
              <PanelCallout icon="warning" tone="warning">
                <strong>{t('AI.Panel.wildcard.title')}</strong>{' '}
                {editing
                  ? t('AI.Panel.wildcard.editing', {
                      count: covered.length,
                      version: version.name,
                    })
                  : t('AI.Panel.wildcard.creating', { version: version.name })}
              </PanelCallout>
            )}
            {otherLevel ? (
              <div>
                <Button
                  disabled={dirty}
                  onClick={() => setCreating(otherLevel)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {model
                    ? t('AI.Panel.exact.addTyped', {
                        type: labels.typeInSentence(type),
                      })
                    : t('AI.Panel.wildcard.addOther')}
                </Button>
              </div>
            ) : null}
            {editing ? null : (
              <LevelChoice
                level={level}
                levels={freeLevels}
                onChange={setCreating}
              />
            )}
          </>
        }
        key={editing ? `${editing.id}:${editing.updatedAt ?? ''}` : 'new'}
        model={model}
        onCancel={() =>
          creating ? setCreating(null) : props.onClose({ discard: true })
        }
        onDirtyChange={reportDirty}
        onDone={() => setCreating(null)}
        reference={props.reference}
        rule={editing ?? undefined}
        shell={shell}
        startFrom={model && cell?.rule && !ownRule ? cell.rule : null}
        type={type}
      />
    );
  }

  return (
    <PanelShell {...shell}>
      {intro}
      {!model || !cell ? (
        <PanelCallout>{t('AI.Panel.wildcard.none')}</PanelCallout>
      ) : cell.state === 'NOT_AUTHORIZED' ? (
        <ArchivedModelState model={model} />
      ) : cell.rule ? (
        <InheritedState
          canOverride={canCreate && !deprecated}
          cell={cell}
          coveredCount={
            wildcardScope(version, props.models, type, { rule: cell.rule })
              .length
          }
          creditValue={props.creditValue}
          deprecated={deprecated}
          model={model}
          onOpenWildcard={openWildcard}
          onOverride={() => setCreating('EXACT_TYPED')}
          wildcard={cell.rule}
        />
      ) : (
        <NoRuleState
          canCreate={canCreate}
          deprecated={deprecated}
          model={model}
          onAddRule={() => setCreating('EXACT_TYPED')}
          onAddWildcard={openWildcard}
          version={version}
        />
      )}
    </PanelShell>
  );
}
