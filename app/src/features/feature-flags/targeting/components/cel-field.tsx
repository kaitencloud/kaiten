import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFieldContext } from '@/components/form/form-context';
import FormControl from '@/components/form/form-control';
import FormDescription from '@/components/form/form-description';
import FormItem from '@/components/form/form-item';
import FormLabel from '@/components/form/form-label';
import RequiredMark from '@/components/form/required-mark';
import FormMessage from '@/components/form/form-message';
import {
  CelEditorDialog,
  CelEditorStatus,
  CelRulePreview,
} from '@/functionals/cel-editor';
import type { CelIssue } from '@/functionals/cel-editor';
import { cn } from '@/lib/utils';
import {
  isCelRuleVerdict,
  useTargetingEditorSupport,
} from '../hooks/use-targeting-editor-support';
import { CelTestDialog } from './cel-test-dialog';

const EMPTY_ISSUES: CelIssue[] = [];

type CelFieldProps = {
  className?: string;
  label: string;
  placeholder?: string;
  description?: string;
  disableValidation?: boolean;
  required?: boolean;
};

/*
The rule is read here and written elsewhere.

The field shows a colored, clickable preview — no Monaco, no editor cost —
and clicking it opens the CEL editor dialog at full size, working on a draft
that commits back into the form on Apply. The verdict under the preview is
the form's own: the async validator on the field stores the lint's issues in
the field error state, and this component only reads them. While the dialog
is open it judges its draft itself, with the same lint.
*/
export function CelField({
  className,
  label,
  placeholder,
  description,
  disableValidation = false,
  required,
}: CelFieldProps) {
  const { t } = useTranslation();
  const field = useFieldContext<string>();
  const [isEditing, setIsEditing] = useState(false);
  const { contextRoots, lint } = useTargetingEditorSupport();

  const value = field.state.value ?? '';
  const metaErrors: unknown[] = field.state.meta.errors ?? [];
  const verdict = metaErrors.find(isCelRuleVerdict);
  const issues = verdict?.issues ?? EMPTY_ISSUES;
  const isChecking = field.state.meta.isValidating;
  const otherError = metaErrors.find(
    (error): error is { message: string } =>
      !isCelRuleVerdict(error) &&
      typeof (error as { message?: unknown })?.message === 'string',
  );

  const hasErrors = metaErrors.length > 0;

  return (
    <FormItem
      className={className}
      errors={field.state.meta.errors}
      required={required}
      data-field-name={field.name}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <FormLabel>{label}</FormLabel>
          {required ? <RequiredMark /> : null}
        </div>
        {!disableValidation && (
          <CelEditorStatus
            isChecking={isChecking}
            issues={issues}
            hasRule={value.trim() !== ''}
            // The positions point into the editor, so picking an issue opens
            // it — the preview has no caret to put anywhere.
            onFocusIssue={() => setIsEditing(true)}
          />
        )}
      </div>
      <FormControl announceRequired={false}>
        <CelRulePreview
          value={value}
          onOpen={() => setIsEditing(true)}
          className={cn(
            hasErrors &&
              'border-destructive ring-destructive/20 dark:ring-destructive/40',
          )}
        />
      </FormControl>
      {description && <FormDescription>{description}</FormDescription>}
      {otherError && <FormMessage>{t(otherError.message)}</FormMessage>}

      <CelEditorDialog
        open={isEditing}
        onOpenChange={setIsEditing}
        initialValue={value}
        onApply={field.handleChange}
        contextRoots={contextRoots}
        lint={lint}
        placeholder={placeholder}
        disableValidation={disableValidation}
        toolbarExtra={(draft) => <CelTestDialog rule={draft} />}
      />
    </FormItem>
  );
}
