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
    // A message is a translation key, or the words of the API, which are shown as they
    // were written: i18next would otherwise read a `:` or a `.` in them as the
    // separators of a key and return a mangled copy of the text.
    errorMessage: errorMessage
      ? t(errorMessage, { defaultValue: errorMessage })
      : undefined,
    handleChange: field.handleChange,
    handleBlur: field.handleBlur,
  };
};

export default useField;
