import { createFormHook } from '@tanstack/react-form';
import { type FormEventHandler, lazy } from 'react';
import { fieldContext, formContext } from '@/components/form/form-context';

const CheckboxField = lazy(
  () => import('@/components/form/fields/checkbox-field'),
);
const TextField = lazy(() => import('@/components/form/fields/text-field'));
const MoneyField = lazy(() => import('@/components/form/fields/money-field'));
const NumberField = lazy(() => import('@/components/form/fields/number-field'));
const SelectField = lazy(() => import('@/components/form/fields/select-field'));
const ComboboxField = lazy(
  () => import('@/components/form/fields/combobox-field'),
);
const DateRangePickerField = lazy(
  () => import('@/components/form/fields/date-range-picker-field'),
);
const DatePickerField = lazy(
  () => import('@/components/form/fields/date-picker-field'),
);
const TextAreaField = lazy(
  () => import('@/components/form/fields/textarea-field'),
);
const JsonField = lazy(() => import('@/components/form/fields/json-field'));
const SubmitButton = lazy(() => import('@/components/form/submit-button'));

export function createFormSubmitHandler(
  handleSubmit: () => void | Promise<void>,
): FormEventHandler<HTMLFormElement> {
  return (event) => {
    event.preventDefault();
    event.stopPropagation();
    void handleSubmit();
  };
}

export const { useAppForm, withForm, withFieldGroup } = createFormHook({
  fieldComponents: {
    CheckboxField,
    TextField,
    MoneyField,
    NumberField,
    SelectField,
    ComboboxField,
    DateRangePickerField,
    DatePickerField,
    TextAreaField,
    JsonField,
  },
  formComponents: {
    SubmitButton,
  },
  fieldContext,
  formContext,
});

// Export useFormContext from form-context directly
export { useFormContext } from '@/components/form/form-context';
