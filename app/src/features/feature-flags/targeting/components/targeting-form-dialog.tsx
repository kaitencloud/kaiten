import { Button } from '@/components/ui/button';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormDialog } from '@/components/dialog';
import RequiredMark from '@/components/form/required-mark';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Targeting, TargetingFormDialogProps } from '../types';
import {
  BasicTargetingForm,
  type BasicTargetingFormRef,
} from './basic-targeting-form';
import {
  RolloutDateTargetingForm,
  type RolloutDateTargetingFormRef,
} from './rollout-date-targeting-form';
import {
  RolloutPercentageTargetingForm,
  type RolloutPercentageTargetingFormRef,
} from './rollout-percentage-targeting-form';

function handleInteractOutside(e: Event) {
  e.preventDefault();
}

export function TargetingFormDialog({
  open,
  onOpenChange,
  variants,
  onSubmit,
  targeting,
  mode = 'create',
  disableCelValidation = false,
}: TargetingFormDialogProps) {
  const { t } = useTranslation();
  const typeId = useId();
  const [selectedType, setSelectedType] = useState<
    'basic' | 'rollout_date' | 'rollout_percentage'
  >(targeting?.type ?? 'basic');

  const basicFormRef = useRef<BasicTargetingFormRef>(null);
  const rolloutDateFormRef = useRef<RolloutDateTargetingFormRef>(null);
  const rolloutPercentageFormRef =
    useRef<RolloutPercentageTargetingFormRef>(null);

  const [formState, setFormState] = useState({
    canSubmit: false,
    isSubmitting: false,
    isPristine: true,
    isValidating: false,
  });

  const handleSubmit = (values: Targeting) => {
    onSubmit(values);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const handleFormSubmit = () => {
    if (selectedType === 'basic') {
      basicFormRef.current?.submit();
    } else if (selectedType === 'rollout_date') {
      rolloutDateFormRef.current?.submit();
    } else if (selectedType === 'rollout_percentage') {
      rolloutPercentageFormRef.current?.submit();
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      onInteractOutside={handleInteractOutside}
    >
      <FormDialog.Header>
        <FormDialog.Title>
          {mode === 'create'
            ? t('Features.Targeting.Dialog.titleCreate')
            : t('Features.Targeting.Dialog.titleEdit')}
        </FormDialog.Title>
        <FormDialog.Description>
          {t('Features.Targeting.Dialog.description')}
        </FormDialog.Description>
      </FormDialog.Header>

      <FormDialog.Content>
        {/* Type Selector - only for create mode */}
        {mode === 'create' && (
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label htmlFor={typeId}>
                {t('Features.Targeting.Dialog.selectType')}
              </Label>
              <RequiredMark />
            </div>
            <Select
              value={selectedType}
              onValueChange={(value) =>
                setSelectedType(
                  value as 'basic' | 'rollout_date' | 'rollout_percentage',
                )
              }
            >
              <SelectTrigger id={typeId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">
                  {t('Features.Targeting.Types.basic')}
                </SelectItem>
                <SelectItem value="rollout_date">
                  {t('Features.Targeting.Types.rolloutDate')}
                </SelectItem>
                <SelectItem value="rollout_percentage">
                  {t('Features.Targeting.Types.rolloutPercentage')}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {selectedType === 'basic' &&
                t('Features.Targeting.Dialog.basicDescription')}
              {selectedType === 'rollout_date' &&
                t('Features.Targeting.Dialog.rolloutDateDescription')}
              {selectedType === 'rollout_percentage' &&
                t('Features.Targeting.Dialog.rolloutPercentageDescription')}
            </p>
          </div>
        )}

        {/* Render appropriate form based on type */}
        {selectedType === 'basic' && (
          <BasicTargetingForm
            ref={basicFormRef}
            onSubmit={handleSubmit}
            onFormStateChange={setFormState}
            variants={variants}
            initialValues={targeting?.type === 'basic' ? targeting : undefined}
            disableCelValidation={disableCelValidation}
          />
        )}

        {selectedType === 'rollout_date' && (
          <RolloutDateTargetingForm
            ref={rolloutDateFormRef}
            onFormStateChange={setFormState}
            onSubmit={(values) =>
              handleSubmit({
                ...values,
                start: {
                  ...values.start,
                  percentage: Number(values.start.percentage),
                },
                end: {
                  ...values.end,
                  percentage: Number(values.end.percentage),
                },
              })
            }
            variants={variants}
            initialValues={
              targeting?.type === 'rollout_date' ? targeting : undefined
            }
            disableCelValidation={disableCelValidation}
          />
        )}

        {selectedType === 'rollout_percentage' && (
          <RolloutPercentageTargetingForm
            ref={rolloutPercentageFormRef}
            onSubmit={handleSubmit}
            onFormStateChange={setFormState}
            variants={variants}
            initialValues={
              targeting?.type === 'rollout_percentage' ? targeting : undefined
            }
            disableCelValidation={disableCelValidation}
          />
        )}
      </FormDialog.Content>

      <FormDialog.Footer>
        <Button
          type="button"
          variant="outline"
          onClick={handleCancel}
          disabled={formState.isSubmitting}
        >
          {t('Common.cancel')}
        </Button>
        <Button
          type="button"
          onClick={handleFormSubmit}
          disabled={
            !formState.canSubmit ||
            formState.isSubmitting ||
            formState.isPristine ||
            // The rule's async lint may still be deciding; a Save enabled
            // during that window would race a verdict that can say no.
            formState.isValidating
          }
        >
          {t('Common.save')}
        </Button>
      </FormDialog.Footer>
    </FormDialog>
  );
}
