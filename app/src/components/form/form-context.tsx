import { createFormHookContexts } from '@tanstack/react-form';
import React, { use } from 'react';

export const { fieldContext, useFieldContext, formContext, useFormContext } =
  createFormHookContexts();

export type FormError = {
  message: string;
  path: string[];
};

type FormItemContextValue = {
  id: string;
  errors?: FormError[];
  /** The field must be filled before the form can be sent. */
  required?: boolean;
};

export const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue,
);

export function useFormFieldContext() {
  const { id, errors, required } = use(FormItemContext);

  return {
    id,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    errors,
    required,
  };
}
