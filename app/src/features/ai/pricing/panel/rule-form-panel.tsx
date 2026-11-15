import { useStore } from '@tanstack/react-form';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { AiUsage, Model } from '@/api-client';
import { Button } from '@/components/ui/button';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import { getApiErrorMessage } from '@/lib/errors';
import type { AiRequestType, PricingRule, PricingTerms } from '../engine';
import type { CardRule } from '../rate-card-model';
import { ArchiveRuleDialog } from './archive-rule-dialog';
import { PanelCallout } from './panel-callout';
import { PanelShell } from './panel-shell';
import { RuleAuthors } from './rule-authors';
import { RuleLimitsSection, RuleRatesSection } from './rule-fields';
import {
  EMPTY_RULE_VALUES,
  hasRate,
  type RuleIdentity,
  ruleFormOpts,
  ruleTermsOf,
  ruleValuesOf,
} from './rule-form.schema';
import { RulePreview } from './rule-preview';
import { useRuleWrites } from './use-rule-writes';

export type RuleFormPanelProps = {
  /** What archiving the rule leaves the calls with, said before it is done. */
  archiveConsequence: string;
  /** Whether the session may archive; the button is absent otherwise. */
  canArchive: boolean;
  /** Whether the session may save; the fields are read-only otherwise. */
  canSave: boolean;
  /** The models a wildcard prices; empty for the rule of one model. */
  covered: readonly Model[];
  creditValue: string | null;
  /** What names the rule. Fixed once the rule exists. */
  identity: RuleIdentity;
  /** What comes before the fields: the ladder, a warning, the choice of a level. */
  intro: ReactNode;
  /** The model the rule names; null for a wildcard. */
  model: Model | null;
  /** Leaves the form without saving. */
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  /** The rule was created, updated or archived. */
  onDone: () => void;
  reference: AiUsage;
  /** The rule being edited; absent for a new one. */
  rule?: CardRule;
  shell: { meta: ReactNode; onClose: () => void; title: string };
  /** A wildcard whose rates a new rule may start from, when asked to. */
  startFrom?: PricingRule | null;
  type: AiRequestType;
};

/**
 * The panel of a rule being created or edited: its rates, its bounds, what an
 * error charges, and a preview priced as it is typed. A new rule opens empty,
 * so it cannot be saved before a rate is typed.
 */
export function RuleFormPanel(props: RuleFormPanelProps) {
  const { t } = useTranslation();
  const { identity, rule } = props;
  const formId = useId();
  const writes = useRuleWrites(identity.licenseSlug);
  const [failure, setFailure] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const opened = rule ? ruleValuesOf(rule) : EMPTY_RULE_VALUES;
  const { onDirtyChange, onDone } = props;

  const form = useAppForm({
    ...ruleFormOpts,
    defaultValues: opened,
    onSubmit: async ({ value }) => {
      setFailure(null);
      const terms = ruleTermsOf(value);
      try {
        if (rule) {
          await writes.update.mutateAsync({
            edited: terms,
            opened: ruleTermsOf(opened),
            ruleId: rule.id,
          });
        } else {
          await writes.create.mutateAsync({ identity, terms });
        }
        toast.success(
          t(rule ? 'AI.Panel.form.saved' : 'AI.Panel.form.created'),
        );
        onDirtyChange(false);
        onDone();
      } catch (error) {
        setFailure(getApiErrorMessage(error));
      }
    },
  });
  const values = useStore(form.store, (state) => state.values);
  const dirty = useStore(form.store, (state) => state.isDirty);
  useEffect(() => {
    onDirtyChange(dirty);

    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  const draft: PricingTerms | null = hasRate(values)
    ? ruleTermsOf(values)
    : null;
  const { startFrom } = props;

  function copyTerms(source: PricingRule) {
    const copy = ruleValuesOf(source);
    form.setFieldValue('rates', copy.rates);
    form.setFieldValue(
      'minimumCreditsPerRequest',
      copy.minimumCreditsPerRequest,
    );
    form.setFieldValue(
      'maximumCreditsPerRequest',
      copy.maximumCreditsPerRequest,
    );
    form.setFieldValue('chargeOnError', copy.chargeOnError);
  }

  async function archive() {
    if (!rule) return;
    setFailure(null);
    try {
      await writes.archive.mutateAsync(rule.id);
      toast.success(t('AI.Panel.archive.done'));
      onDirtyChange(false);
      onDone();
    } catch (error) {
      setFailure(getApiErrorMessage(error));
    } finally {
      setArchiving(false);
    }
  }

  return (
    <form.AppForm>
      <PanelShell
        {...props.shell}
        footer={
          <>
            {rule && props.canArchive ? (
              <Button
                className="text-destructive-subtle-foreground"
                onClick={() => setArchiving(true)}
                type="button"
                variant="outline"
              >
                {t('AI.Panel.archive.action')}
              </Button>
            ) : null}
            <span className="flex-1" />
            <Button onClick={props.onCancel} type="button" variant="outline">
              {t('Common.cancel')}
            </Button>
            {props.canSave ? (
              <form.SubmitButton
                form={formId}
                label={t(rule ? 'AI.Panel.form.save' : 'AI.Panel.form.add')}
                needsInputHint={t('AI.Panel.form.needsRate')}
              />
            ) : null}
          </>
        }
      >
        <form
          className="flex flex-col gap-4"
          id={formId}
          onSubmit={createFormSubmitHandler(form.handleSubmit)}
        >
          {props.intro}
          {startFrom && !rule && props.canSave ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Button
                onClick={() => copyTerms(startFrom)}
                size="sm"
                type="button"
                variant="outline"
              >
                {t('AI.Panel.form.startFromWildcard')}
              </Button>
              {t('AI.Panel.form.startFromHint')}
            </div>
          ) : null}
          <RuleRatesSection
            disabled={!props.canSave}
            form={form}
            requestType={identity.requestType}
            type={props.type}
          />
          <RuleLimitsSection disabled={!props.canSave} form={form} />
          <RulePreview
            before={rule ?? null}
            covered={props.covered}
            creditValue={props.creditValue}
            draft={draft}
            model={props.model}
            reference={props.reference}
            type={props.type}
          />
          <p className="text-xs text-muted-foreground">
            {t('AI.Panel.form.appliesNext')}
          </p>
          {rule ? <RuleAuthors rule={rule} /> : null}
          {failure ? (
            <PanelCallout icon="warning" tone="destructive">
              <span role="alert">{failure}</span>
            </PanelCallout>
          ) : null}
        </form>
      </PanelShell>
      <ArchiveRuleDialog
        consequence={props.archiveConsequence}
        onCancel={() => setArchiving(false)}
        onConfirm={() => void archive()}
        open={archiving}
        pending={writes.archive.isPending}
      />
    </form.AppForm>
  );
}
