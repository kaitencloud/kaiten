import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiUsage } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import type { AiRequestType } from './engine';
import {
  REFERENCE_FIELDS,
  type ReferenceField,
  referenceDraftSchema,
  toReferenceDraft,
  toReferenceUsage,
} from './reference-call-form';
import { usePricingLabels } from './use-pricing-labels';

const FIELD_LABEL_KEYS = {
  inputTokens: 'AI.Pricing.reference.fields.inputTokens',
  cacheReadInputTokens: 'AI.Pricing.reference.fields.cacheReadInputTokens',
  cacheWriteInputTokens: 'AI.Pricing.reference.fields.cacheWriteInputTokens',
  outputTokens: 'AI.Pricing.reference.fields.outputTokens',
  images: 'AI.Pricing.reference.fields.images',
  seconds: 'AI.Pricing.reference.fields.seconds',
} as const satisfies Record<ReferenceField, string>;

type ReferenceCallFormProps = {
  onApply: (usage: AiUsage | undefined) => void;
  reference: AiUsage;
  type: AiRequestType;
};

function ReferenceCallForm({
  onApply,
  reference,
  type,
}: ReferenceCallFormProps) {
  const { t } = useTranslation();
  const form = useAppForm({
    defaultValues: toReferenceDraft(reference),
    validators: { onChange: referenceDraftSchema(type) },
    onSubmit: ({ value }) => onApply(toReferenceUsage(type, value)),
  });

  function renderField(name: ReferenceField) {
    return (
      <form.AppField key={name} name={name}>
        {(field) => (
          <field.TextField
            autoComplete="off"
            inputMode="numeric"
            label={t(FIELD_LABEL_KEYS[name])}
          />
        )}
      </form.AppField>
    );
  }

  return (
    <form
      className="grid grid-cols-1 gap-3"
      onSubmit={createFormSubmitHandler(form.handleSubmit)}
    >
      <form.AppForm>
        <div className="grid grid-cols-2 gap-3">
          {REFERENCE_FIELDS[type].map(renderField)}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            onClick={() => onApply(undefined)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t('AI.Pricing.reference.reset')}
          </Button>
          <form.SubmitButton
            label={t('AI.Pricing.reference.apply')}
            size="sm"
          />
        </div>
      </form.AppForm>
    </form>
  );
}

type ReferenceCallBarProps = {
  /** Sets the reference call of this request type; `undefined` restores the default. */
  onChange: (usage: AiUsage | undefined) => void;
  reference: AiUsage;
  type: AiRequestType;
};

/**
 * The call every cell prices, on one line, and the popover that changes it.
 * It is kept in this browser: the API has no place for it.
 */
export function ReferenceCallBar({
  onChange,
  reference,
  type,
}: ReferenceCallBarProps) {
  const { t } = useTranslation();
  const labels = usePricingLabels();
  const [open, setOpen] = useState(false);
  const typeLabel = labels.typeLabel(type);

  function apply(usage: AiUsage | undefined) {
    onChange(usage);
    setOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-3.5 py-2 text-sm">
      <strong className="font-semibold">
        {t('AI.Pricing.reference.label')}
      </strong>
      <span className="tabular-nums">
        {typeLabel}: {labels.usageLabel(reference)}
      </span>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          render={<Button size="sm" type="button" variant="ghost" />}
        >
          {t('AI.Pricing.reference.edit')}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)]">
          <PopoverHeader className="mb-3">
            <PopoverTitle>
              {t('AI.Pricing.reference.title', { type: typeLabel })}
            </PopoverTitle>
            <PopoverDescription>
              {t('AI.Pricing.reference.description')}
            </PopoverDescription>
          </PopoverHeader>
          <ReferenceCallForm
            key={JSON.stringify(reference)}
            onApply={apply}
            reference={reference}
            type={type}
          />
        </PopoverContent>
      </Popover>
      <span className="ml-auto text-xs text-muted-foreground">
        {t('AI.Pricing.reference.hint')}
      </span>
    </div>
  );
}
