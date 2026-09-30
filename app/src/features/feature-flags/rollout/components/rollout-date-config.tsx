import type { ComponentType, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Variant } from '@/api-client';
import { DatePicker } from '@/components/date-picker';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

export type RolloutDateConfigValue = {
  date: string;
  percentage: number | string;
  variant: string;
};

type RolloutDateSelectFieldProps = {
  value: string;
  onChange: (val: string) => void;
  label: string;
  options: Variant[];
};

type RolloutDatePickerProps = {
  value: string;
  onChange: (val: string) => void;
  label: string;
  error?: string;
};

function DefaultDatePicker({
  value,
  onChange,
  label,
  error,
}: RolloutDatePickerProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label} *</label>
      <DatePicker
        date={value ? new Date(value) : undefined}
        onSelect={(date) => onChange(date?.toISOString() || '')}
        placeholder={label}
      />
      {error && (
        <p className="text-sm text-destructive-subtle-foreground">{error}</p>
      )}
    </div>
  );
}

export type RolloutDateConfigProps = {
  value: {
    start: RolloutDateConfigValue;
    end: RolloutDateConfigValue;
  };
  onChange: (value: {
    start: RolloutDateConfigValue;
    end: RolloutDateConfigValue;
  }) => void;
  variants: Variant[];
  renderTextField?: (props: {
    value: number | string;
    onChange: (val: number | string) => void;
    label: string;
  }) => ReactNode;
  renderSelectField: ComponentType<RolloutDateSelectFieldProps>;
  renderDatePicker?: ComponentType<RolloutDatePickerProps>;
  errors?: {
    start?: { date?: string };
    end?: { date?: string };
  };
};

export function RolloutDateConfig({
  value,
  onChange,
  variants,
  renderSelectField,
  renderDatePicker,
  errors,
}: RolloutDateConfigProps) {
  const { t } = useTranslation();
  const DatePickerComponent = renderDatePicker ?? DefaultDatePicker;
  const SelectFieldComponent = renderSelectField;

  return (
    <div className="space-y-4">
      {/* Start Configuration */}
      <div className="border rounded-lg p-4 space-y-3">
        <h4 className="font-semibold text-sm">
          {t('Features.Targeting.RolloutDateForm.startConfiguration')}
        </h4>

        <DatePickerComponent
          value={value.start.date}
          onChange={(date) =>
            onChange({
              ...value,
              start: { ...value.start, date },
            })
          }
          label={t('Features.Targeting.RolloutDateForm.startDate')}
          error={errors?.start?.date}
        />

        <div className="space-y-3 pt-2">
          <div className="flex justify-between">
            <Label>
              {t('Features.Targeting.RolloutDateForm.startPercentage')} *
            </Label>
            <span className="text-sm text-muted-foreground w-12 text-right">
              {value.start.percentage}%
            </span>
          </div>
          <Slider
            value={[Number(value.start.percentage)]}
            onValueChange={([val]) => {
              // Start cannot be higher than End
              const currentEnd = Number(value.end.percentage);
              const newEnd = val > currentEnd ? val : currentEnd;

              onChange({
                ...value,
                start: { ...value.start, percentage: val },
                end: { ...value.end, percentage: newEnd },
              });
            }}
            max={100}
            step={1}
          />
        </div>

        <SelectFieldComponent
          value={value.start.variant}
          onChange={(variant) =>
            onChange({
              ...value,
              start: { ...value.start, variant },
            })
          }
          label={`${t('Features.Targeting.RolloutDateForm.startVariant')} *`}
          options={variants}
        />
      </div>

      {/* End Configuration */}
      <div className="border rounded-lg p-4 space-y-3">
        <h4 className="font-semibold text-sm">
          {t('Features.Targeting.RolloutDateForm.endConfiguration')}
        </h4>

        <DatePickerComponent
          value={value.end.date}
          onChange={(date) =>
            onChange({
              ...value,
              end: { ...value.end, date },
            })
          }
          label={t('Features.Targeting.RolloutDateForm.endDate')}
          error={errors?.end?.date}
        />

        <div className="space-y-3 pt-2">
          <div className="flex justify-between">
            <Label>
              {t('Features.Targeting.RolloutDateForm.endPercentage')} *
            </Label>
            <span className="text-sm text-muted-foreground w-12 text-right">
              {value.end.percentage}%
            </span>
          </div>
          <Slider
            value={[Number(value.end.percentage)]}
            onValueChange={([val]) => {
              // End cannot be lower than Start
              const currentStart = Number(value.start.percentage);
              const newStart = val < currentStart ? val : currentStart;

              onChange({
                ...value,
                start: { ...value.start, percentage: newStart },
                end: { ...value.end, percentage: val },
              });
            }}
            max={100}
            step={1}
          />
        </div>

        <SelectFieldComponent
          value={value.end.variant}
          onChange={(variant) =>
            onChange({
              ...value,
              end: { ...value.end, variant },
            })
          }
          label={`${t('Features.Targeting.RolloutDateForm.endVariant')} *`}
          options={variants}
        />
      </div>
    </div>
  );
}
