import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConversionRates, Model } from '@/api-client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PRESETS,
  presetRates,
  previewCredits,
  previewVendorCost,
  TYPICAL_USAGE,
} from './pricing-preview';

export function RatePreset({
  onApply,
  initialPreset,
}: {
  initialPreset: string;
  onApply: (rates: ConversionRates) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [preset, setPreset] = useState<string>(initialPreset);
  const [confirm, setConfirm] = useState(false);
  const items = PRESETS.map((value) => ({
    value,
    label: t(`AI.enums.${value}`),
  }));
  function renderPreset(item: (typeof items)[number]) {
    return (
      <SelectItem key={item.value} value={item.value}>
        {item.label}
      </SelectItem>
    );
  }
  function applyPreset() {
    onApply(presetRates(preset));
    setConfirm(false);
    trigger.current?.focus();
  }
  return (
    <details className="space-y-3">
      <summary className="cursor-pointer text-sm font-medium">
        {t('AI.Minimal.usePreset')}
      </summary>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor={id}>{t('AI.Matrix.preset')}</Label>
          <Select
            items={items}
            value={preset}
            onValueChange={(value) => {
              if (value) setPreset(value);
              setConfirm(false);
            }}
          >
            <SelectTrigger id={id} className="w-full min-h-11 sm:min-h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{items.map(renderPreset)}</SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          ref={trigger}
          onClick={() => setConfirm(true)}
        >
          {t('Common.apply')}
        </Button>
      </div>
      {confirm ? (
        <div
          role="group"
          aria-label={t('AI.Matrix.replaceRates')}
          className="space-y-3 border-t pt-3"
        >
          <p role="alert" className="text-sm">
            {t('AI.Matrix.replaceWarning', { preset: t(`AI.enums.${preset}`) })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={applyPreset}>
              {t('AI.Matrix.replaceRates')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setConfirm(false);
                trigger.current?.focus();
              }}
            >
              {t('Common.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
    </details>
  );
}

export function TypicalPreview({
  rates,
  model,
  minimum,
  maximum,
}: {
  rates: ConversionRates;
  model?: Model;
  minimum: string;
  maximum?: string | null;
}) {
  const { t } = useTranslation();
  return (
    <aside
      aria-label={t('AI.Matrix.preview')}
      className="space-y-2 border-t pt-4"
    >
      <h3 className="font-medium">{t('AI.Matrix.preview')}</h3>
      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer">
          {t('AI.Minimal.exampleDetails')}
        </summary>
        <p className="mt-2">{t('AI.Matrix.typicalUsage')}</p>
        <p>{t('AI.Matrix.previewOnly')}</p>
      </details>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted-foreground">
            {t('AI.Matrix.previewCredits')}
          </dt>
          <dd className="text-lg tabular-nums">
            {previewCredits(rates, TYPICAL_USAGE, minimum, maximum)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">
            {t('AI.Models.costs')}
          </dt>
          <dd className="tabular-nums">
            {model?.vendorCosts &&
            Object.keys(model.vendorCosts).some((key) => key !== 'currency')
              ? `${previewVendorCost(model.vendorCosts, TYPICAL_USAGE)} USD`
              : t('AI.Matrix.costUnknown')}
          </dd>
        </div>
      </dl>
    </aside>
  );
}
