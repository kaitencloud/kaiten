import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import {
  defineFormRecovery,
  FormRecoveryAlert,
  FormRecoveryAnnouncer,
  FormRecoveryNotes,
  FormRecoverySubmitWarning,
  useFormRecovery,
  useFormRecoveryForm,
  type FormRecovery,
} from '..';

/**
 * A two-step creation form that uses the recovery, for the stories and the
 * tests of the module: no feature adopts it yet. It is what a feature does,
 * in the order it does it.
 */
export const demoSchema = z.object({
  name: z.string().min(3),
  count: z.number(),
  note: z.string(),
  secret: z.string(),
});

export type DemoValues = z.infer<typeof demoSchema>;

export const demoRecovery = defineFormRecovery<DemoValues>({
  formId: 'demo.create',
  version: 1,
  omit: ['secret'],
  steps: ['identity', 'details'],
  stepFields: { identity: ['name'], details: ['count', 'note', 'secret'] },
  schema: demoSchema,
  fieldLabels: { name: { text: 'Name' }, count: { text: 'Count' } },
});

const STEP_LABELS = ['Identity', 'Details'] as const;
const FIELD_LABELS = { secret: 'Secret' };

export const demoDefaults = (): DemoValues => ({
  name: '',
  count: Number.NaN,
  note: '',
  secret: '',
});

export type RecoveryDemoFormProps = {
  /** False behaves as an edit form: nothing is read or written. */
  enabled?: boolean;
  context?: string;
  /** The request a submit makes; resolves by default. */
  request?: (values: DemoValues) => Promise<unknown>;
  onCancel?: () => void;
  /**
   * The feature fills a value itself after the mount, as the license version
   * does with the rows of its base: that is not an input of the person.
   */
  initializeAfterMount?: boolean;
};

function DemoWizard({
  recovery,
  request,
  onCancel,
  initializeAfterMount,
}: Required<Pick<RecoveryDemoFormProps, 'request'>> &
  Pick<RecoveryDemoFormProps, 'onCancel' | 'initializeAfterMount'> & {
    recovery: FormRecovery<DemoValues>;
  }) {
  const [step, setStep] = useState(recovery.restored?.stepIndex ?? 0);
  const [furthest, setFurthest] = useState(recovery.restored?.furthestIndex ?? 0);
  const [sent, setSent] = useState(false);

  const form = useAppForm({
    defaultValues: recovery.pristine,
    onSubmit: async ({ value }) => {
      try {
        await recovery.send(() => request(value));
        setSent(true);
      } catch {
        // A refusal is shown by the form; the recovery keeps the input.
      }
    },
  });
  const [initialized, setInitialized] = useState(!initializeAfterMount);
  useEffect(() => {
    if (initialized) return;
    form.setFieldValue('note', 'filled by the feature');
    setInitialized(true);
  }, [initialized, form]);

  const { focusRef } = useFormRecoveryForm(recovery, form, {
    stepIndex: step,
    furthestIndex: furthest,
    ready: initialized,
  });

  const goTo = (next: number) => {
    setStep(next);
    setFurthest(Math.max(furthest, next));
  };

  if (sent) {
    return <p>Sent</p>;
  }

  return (
    <form
      ref={focusRef}
      className="flex max-w-xl flex-col gap-4"
      onSubmit={createFormSubmitHandler(form.handleSubmit)}
    >
      <FormRecoveryAlert
        recovery={recovery}
        stepLabels={STEP_LABELS}
        fieldLabels={FIELD_LABELS}
      >
        <a href="#list">View the list</a>
      </FormRecoveryAlert>
      <FormRecoveryNotes recovery={recovery} fieldLabels={FIELD_LABELS} />
      <form.AppForm>
        {step === 0 && (
          <form.AppField name="name">
            {(field) => <field.TextField label="Name" />}
          </form.AppField>
        )}
        {step === 1 && (
          <>
            <form.AppField name="count">
              {(field) => <field.NumberField label="Count" />}
            </form.AppField>
            <form.AppField name="note">
              {(field) => <field.TextField label="Note" />}
            </form.AppField>
            <form.AppField name="secret">
              {(field) => <field.TextField label="Secret" type="password" />}
            </form.AppField>
          </>
        )}
      </form.AppForm>
      <FormRecoverySubmitWarning recovery={recovery}>
        <a href="#list">View the list</a>
      </FormRecoverySubmitWarning>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            recovery.discard({ undo: () => onCancel?.() });
            onCancel?.();
          }}
        >
          Cancel
        </Button>
        {step > 0 && (
          <Button type="button" variant="outline" onClick={() => goTo(step - 1)}>
            Back
          </Button>
        )}
        {step < 1 ? (
          <Button type="button" onClick={() => goTo(step + 1)}>
            Next
          </Button>
        ) : (
          <Button type="submit">Send</Button>
        )}
      </div>
    </form>
  );
}

export function RecoveryDemoForm({
  enabled = true,
  context,
  request = () => Promise.resolve({}),
  onCancel,
  initializeAfterMount,
}: RecoveryDemoFormProps) {
  const recovery = useFormRecovery(demoRecovery, {
    enabled,
    context,
    pristine: demoDefaults(),
  });

  return (
    <>
      <FormRecoveryAnnouncer recovery={recovery} stepLabels={STEP_LABELS} />
      <DemoWizard
        key={recovery.sessionKey}
        recovery={recovery}
        request={request}
        onCancel={onCancel}
        initializeAfterMount={initializeAfterMount}
      />
    </>
  );
}
