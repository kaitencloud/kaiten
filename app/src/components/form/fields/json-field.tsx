import { json, jsonParseLinter } from '@codemirror/lang-json';
import { linter } from '@codemirror/lint';
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';
import CodeMirror, {
  type EditorView,
  type ReactCodeMirrorProps,
  type ReactCodeMirrorRef,
} from '@uiw/react-codemirror';
import { useEffect, useRef } from 'react';
import useField from '@/components/form/fields/use-field';
import FormControl from '@/components/form/form-control';
import FormDescription from '@/components/form/form-description';
import FormItem from '@/components/form/form-item';
import FormLabel from '@/components/form/form-label';
import RequiredMark from '@/components/form/required-mark';
import FormMessage from '@/components/form/form-message';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';

const jsonLinter = () => (view: EditorView) => {
  if (view.state.doc.length === 0) return [];
  return jsonParseLinter()(view);
};

type JsonFieldProps = {
  className?: string;
  label: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
} & ReactCodeMirrorProps;

const JsonField = ({
  className,
  label,
  placeholder,
  description,
  required,
  ...props
}: JsonFieldProps) => {
  const { theme } = useTheme();
  const ref = useRef<ReactCodeMirrorRef>(null);
  const field = useField<string>();

  const isEmpty =
    field.value === null || field.value === undefined || field.value === '';

  useEffect(() => {
    if (ref.current) {
      ref.current.view?.dom.classList.add('rounded-md');
    }
  }, []);

  return (
    <FormItem
      className={className}
      errors={field.hasError ? field.errors : undefined}
      required={required}
    >
      <div className="flex items-center gap-1">
        <FormLabel>{label}</FormLabel>
        {required ? <RequiredMark /> : null}
      </div>
      <FormControl>
        <div
          className={cn(
            'border-input aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 rounded-md border overflow-hidden',
            field.hasError &&
              'border-destructive ring-destructive/20 ring-[3px]',
          )}
          aria-invalid={field.hasError || undefined}
        >
          <CodeMirror
            ref={ref}
            placeholder={placeholder}
            value={field.value}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
            extensions={[json(), linter(jsonLinter())]}
            theme={theme === 'dark' ? vscodeDark : vscodeLight}
            basicSetup={{
              foldGutter: !isEmpty,
              lineNumbers: !isEmpty,
              highlightActiveLine: !isEmpty,
            }}
            {...props}
          />
        </div>
      </FormControl>
      {description && <FormDescription>{description}</FormDescription>}
      <FormMessage>
        {field.hasError ? field.errorMessage : undefined}
      </FormMessage>
    </FormItem>
  );
};

export default JsonField;
