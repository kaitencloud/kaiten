import { Input } from '@/components/ui/input';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type SuffixInputProps = React.ComponentProps<'input'> & {
  suffix: string;
};

// Input with an inline trailing unit label, like the bordered group NumberInput
// builds around base-ui. Local to the entitlements feature until another
// feature needs the same affordance.
function SuffixInput({
  suffix,
  className,
  disabled,
  'aria-invalid': ariaInvalid,
  ...props
}: SuffixInputProps) {
  return (
    <div
      aria-invalid={ariaInvalid}
      className={cn(
        'border-input dark:bg-input/30 bg-background focus-within:border-ring focus-within:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 flex h-9 w-full min-w-0 items-center rounded-md border shadow-xs transition-[color,box-shadow] focus-within:ring-[3px]',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <input
        className="placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground h-full min-w-0 flex-1 bg-transparent px-3 py-1 text-base outline-none md:text-sm"
        disabled={disabled}
        aria-invalid={ariaInvalid}
        {...props}
      />
      <span className="text-muted-foreground pr-3 text-sm whitespace-nowrap select-none">
        {suffix}
      </span>
    </div>
  );
}

type UnitLabelFieldProps = {
  form: any;
  name: 'unitSingular' | 'unitPlural' | 'saleUnitSingular' | 'saleUnitPlural';
  ariaLabel: string;
  placeholder: string;
};

function UnitLabelField({
  form,
  name,
  ariaLabel,
  placeholder,
}: UnitLabelFieldProps) {
  return (
    <form.AppField name={name}>
      {() => (
        <FormField<string | undefined>>
          {(field) => (
            <FormControl>
              <Input
                aria-label={ariaLabel}
                placeholder={placeholder}
                value={field.value ?? ''}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={field.hasError}
              />
            </FormControl>
          )}
        </FormField>
      )}
    </form.AppField>
  );
}

type SaleUnitSectionProps = {
  form: any;
};

function SaleUnitFactorField({ form }: SaleUnitSectionProps) {
  const { t } = useTranslation();

  return (
    <form.AppField name="saleUnitFactor">
      {() => (
        <FormField<number | undefined> className="flex-1">
          {(field) => (
            <form.Subscribe selector={(state: any) => state.values.unitPlural}>
              {(unitPlural: string | undefined) => (
                <FormControl>
                  <SuffixInput
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    aria-label={t(
                      'Pages.Entitlements.Mutation.Form.Labels.saleUnitFactorValue',
                    )}
                    placeholder={t(
                      'Pages.Entitlements.Mutation.Form.Placeholders.saleUnitFactor',
                    )}
                    value={field.value ?? ''}
                    onChange={(e) => {
                      const next = e.target.valueAsNumber;
                      field.handleChange(
                        Number.isFinite(next) ? next : undefined,
                      );
                    }}
                    onBlur={field.handleBlur}
                    aria-invalid={field.hasError}
                    suffix={
                      unitPlural?.trim() ||
                      t('Pages.Entitlements.Mutation.Form.Units.fallbackPlural')
                    }
                  />
                </FormControl>
              )}
            </form.Subscribe>
          )}
        </FormField>
      )}
    </form.AppField>
  );
}

function SaleUnitCalculationRow({ form }: SaleUnitSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        {t('Pages.Entitlements.Mutation.Form.Labels.saleUnitFactor')}
      </p>
      <div className="flex items-start gap-2">
        <form.Subscribe
          selector={(state: any) => state.values.saleUnitSingular}
        >
          {(saleUnitSingular: string | undefined) => (
            <SuffixInput
              className="flex-1"
              value="1"
              disabled
              readOnly
              aria-label={t(
                'Pages.Entitlements.Mutation.Form.Labels.saleUnitFactorOne',
              )}
              suffix={
                saleUnitSingular?.trim() ||
                t('Pages.Entitlements.Mutation.Form.Units.fallbackSingular')
              }
            />
          )}
        </form.Subscribe>
        <span className="flex h-9 items-center text-sm">=</span>
        <SaleUnitFactorField form={form} />
      </div>
    </div>
  );
}

function SaleUnitFields({ form }: SaleUnitSectionProps) {
  const { t } = useTranslation();

  return (
    <>
      <div className="space-y-2">
        <p className="text-sm font-medium">
          {t('Pages.Entitlements.Mutation.Form.Labels.units')}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <UnitLabelField
            form={form}
            name="saleUnitSingular"
            ariaLabel={t(
              'Pages.Entitlements.Mutation.Form.Labels.saleUnitSingular',
            )}
            placeholder={t(
              'Pages.Entitlements.Mutation.Form.Placeholders.saleUnitSingular',
            )}
          />
          <UnitLabelField
            form={form}
            name="saleUnitPlural"
            ariaLabel={t(
              'Pages.Entitlements.Mutation.Form.Labels.saleUnitPlural',
            )}
            placeholder={t(
              'Pages.Entitlements.Mutation.Form.Placeholders.saleUnitPlural',
            )}
          />
        </div>
      </div>

      <SaleUnitCalculationRow form={form} />
    </>
  );
}

type EntitlementUnitFieldsProps = {
  form: any;
};

type SaleUnitValues = {
  saleUnitSingular?: string;
  saleUnitPlural?: string;
  saleUnitFactor?: number;
};

// The values are the source of truth for what the request carries: any member of the
// sale trio makes the section part of the form, whether it came from the stored
// entitlement (an edit) or from restored input (a recovered creation), neither of
// which is known when this component first renders.
const hasSaleUnitValues = (values: SaleUnitValues): boolean =>
  Boolean(
    values.saleUnitSingular ||
    values.saleUnitPlural ||
    values.saleUnitFactor != null,
  );

export function EntitlementUnitFields({ form }: EntitlementUnitFieldsProps) {
  const { t } = useTranslation();
  const switchId = useId();
  // Only the wish to fill the section in while nothing is in it yet.
  const [openedByPerson, setOpenedByPerson] = useState(false);

  const handleSoldInDifferentUnitsChange = (checked: boolean) => {
    setOpenedByPerson(checked);
    if (!checked) {
      form.setFieldValue('saleUnitSingular', '');
      form.setFieldValue('saleUnitPlural', '');
      form.setFieldValue('saleUnitFactor', undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium">
          {t('Pages.Entitlements.Mutation.Form.Labels.units')}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <UnitLabelField
            form={form}
            name="unitSingular"
            ariaLabel={t(
              'Pages.Entitlements.Mutation.Form.Labels.unitSingular',
            )}
            placeholder={t(
              'Pages.Entitlements.Mutation.Form.Placeholders.unitSingular',
            )}
          />
          <UnitLabelField
            form={form}
            name="unitPlural"
            ariaLabel={t('Pages.Entitlements.Mutation.Form.Labels.unitPlural')}
            placeholder={t(
              'Pages.Entitlements.Mutation.Form.Placeholders.unitPlural',
            )}
          />
        </div>
      </div>

      <form.Subscribe
        selector={(state: any) => hasSaleUnitValues(state.values)}
      >
        {(hasSaleUnits: boolean) => {
          const soldInDifferentUnits = openedByPerson || hasSaleUnits;

          return (
            <>
              <div className="flex items-center gap-3">
                <Switch
                  id={switchId}
                  checked={soldInDifferentUnits}
                  onCheckedChange={handleSoldInDifferentUnitsChange}
                />
                <label
                  htmlFor={switchId}
                  className="text-sm font-medium whitespace-nowrap"
                >
                  {t('Pages.Entitlements.Mutation.Form.Labels.saleUnitsToggle')}
                </label>
                <div aria-hidden="true" className="bg-border h-px flex-1" />
              </div>

              {soldInDifferentUnits && <SaleUnitFields form={form} />}
            </>
          );
        }}
      </form.Subscribe>
    </div>
  );
}
