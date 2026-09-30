import { useTranslation } from 'react-i18next';
import { useFieldContext } from '@/components/form/form-context';

const useField = <T = unknown>() => {
  const { t } = useTranslation();
  const field = useFieldContext<T>();

  const errorMessage = field.state.meta.errors?.[0]?.message;
  const hasError = field.state.meta.isTouched && !!errorMessage;

  return {
    name: field.name,
    value: field.state.value,
    errors: field.state.meta.errors,
    hasError,
    errorMessage: errorMessage ? t(errorMessage) : undefined,
    handleChange: field.handleChange,
    handleBlur: field.handleBlur,
  };
};

export default useField;
