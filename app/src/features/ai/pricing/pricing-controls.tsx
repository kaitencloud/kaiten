import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CURRENT_FAMILIES, type RateCardFamily } from './rate-card-model';

type Option = { label: string; value: string };

type PickerProps = {
  label: string;
  onChange: (value: string) => void;
  options: Option[];
  value: string;
};

function renderOption(option: Option) {
  return (
    <SelectItem key={option.value} value={option.value}>
      {option.label}
    </SelectItem>
  );
}

function Picker({ label, onChange, options, value }: PickerProps) {
  const id = useId();

  return (
    <div className="grid min-w-56 grid-cols-1 gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        items={options}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
        value={value}
      >
        <SelectTrigger className="w-full" id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{options.map(renderOption)}</SelectContent>
      </Select>
    </div>
  );
}

type PricingControlsProps = {
  creditValueInvalid: boolean;
  creditValueText: string;
  families: readonly RateCardFamily[];
  family: string;
  onCreditValueChange: (value: string) => void;
  onFamilyChange: (family: string) => void;
  onPoolChange: (pool: string) => void;
  pool: Entitlement;
  pools: readonly Entitlement[];
};

/**
 * What the rate card is drawn for: the credit pool, the licence family (or the
 * current version of each), and the value of a credit, which this browser keeps.
 */
export function PricingControls(props: PricingControlsProps) {
  const { t } = useTranslation();
  const valueId = useId();
  const helpId = useId();
  const pools = props.pools.map((pool) => ({
    label: `${pool.name} · ${pool.slug}`,
    value: pool.slug ?? '',
  }));
  const families = [
    {
      label: t('AI.Pricing.controls.currentVersions'),
      value: CURRENT_FAMILIES,
    },
    ...props.families.map((family) => ({
      label: t('AI.Pricing.controls.familyVersions', { name: family.name }),
      value: family.slug,
    })),
  ];

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <Picker
        label={t('AI.Pricing.controls.pool')}
        onChange={props.onPoolChange}
        options={pools}
        value={props.pool.slug ?? ''}
      />
      <Picker
        label={t('AI.Pricing.controls.family')}
        onChange={props.onFamilyChange}
        options={families}
        value={props.family}
      />
      <div className="grid grid-cols-1 gap-1.5">
        <Label htmlFor={valueId}>
          {t('AI.Pricing.controls.creditValue')}{' '}
          <span className="font-normal text-muted-foreground">
            · {t('AI.Pricing.controls.optional')}
          </span>
        </Label>
        <InputGroup className="w-44 bg-card">
          <InputGroupAddon>$</InputGroupAddon>
          <InputGroupInput
            aria-describedby={helpId}
            aria-invalid={props.creditValueInvalid}
            autoComplete="off"
            className="text-right tabular-nums"
            id={valueId}
            inputMode="decimal"
            onChange={(event) => props.onCreditValueChange(event.target.value)}
            placeholder={t('AI.Pricing.controls.creditValuePlaceholder')}
            value={props.creditValueText}
          />
        </InputGroup>
      </div>
      <p
        className="max-w-sm self-center text-xs text-muted-foreground"
        id={helpId}
      >
        {props.creditValueInvalid
          ? t('AI.Pricing.controls.creditValueInvalid')
          : t('AI.Pricing.controls.creditValueHelp')}
      </p>
    </div>
  );
}
