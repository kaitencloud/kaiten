import { createFormHook } from '@tanstack/react-form';
import type { FormEventHandler } from 'react';
import { fieldContext, formContext } from '@/components/form/form-context';
import CheckboxField from '@/components/form/fields/checkbox-field';
import ComboboxField from '@/components/form/fields/combobox-field';
import DatePickerField from '@/components/form/fields/date-picker-field';
import DateRangePickerField from '@/components/form/fields/date-range-picker-field';
import DateTimeField from '@/components/form/fields/date-time-field';
import JsonField from '@/components/form/fields/lazy-json-field';
import MoneyField from '@/components/form/fields/money-field';
import NumberField from '@/components/form/fields/number-field';
import SelectField from '@/components/form/fields/select-field';
import TextAreaField from '@/components/form/fields/textarea-field';
import TextField from '@/components/form/fields/text-field';
import SubmitButton from '@/components/form/submit-button';

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
    DateTimeField,
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
