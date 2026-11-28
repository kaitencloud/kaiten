import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { EntitlementWritable, Entitlement } from '@/api-client';
import { handleBillingProblem, setProblemFieldError } from '@/domains/billing';
import type { FormRecovery } from '@/functionals/form-recovery';
import { useAppForm } from '@/hooks/form';
import { getApiErrorMessage } from '@/lib/errors';
import { useEntitlementFormMutations } from '../../hooks';
import {
  conditionUnitFields,
  isNumberFamily,
  sourcesToBody,
} from '../../utils/entitlement-writable';
import {
  type EntitlementFormValues,
  entitlementFormSchema,
  getEntitlementFormDefaults,
  isCombinedFormValues,
} from './entitlement-form.shared';
import { resolveResetFields } from './entitlement-reset-period.shared';
import { toOptionalSlug } from './entitlement-slug.shared';

type RefusedField = 'resetAnchor' | 'resetPeriod' | 'slug' | 'sources';

type Refusal = { field?: RefusedField; messageKey: string };

const FORM = 'Pages.Entitlements.Mutation.Form';

// What the API refuses in the sources of a combined entitlement, by the end of its code:
// a create and an update refuse the same things, in the same words. They are about what
// the person chose, so they are shown on the sources, which they can change.
const SOURCE_REFUSALS: Record<string, string> = {
  CombinedSourceDuplicate: `${FORM}.Errors.sourceDuplicate`,
  CombinedSourceWeightInvalid: `${FORM}.Errors.sourceWeight`,
  CombinedSourcesRequired: `${FORM}.Errors.sourcesMin`,
  CombinedWindowMismatch: `${FORM}.Refusals.sourceWindowMismatch`,
  SourceIsCombined: `${FORM}.Refusals.sourceIsCombined`,
  SourceNotFound: `${FORM}.Refusals.sourceNotFound`,
  SourceUnsupportedAggregation: `${FORM}.Refusals.sourceUnsupportedAggregation`,
  SourceUnsupportedType: `${FORM}.Refusals.sourceUnsupportedType`,
  SourceWindowMismatch: `${FORM}.Refusals.sourceWindowMismatch`,
};

// The refusals of the API about the slug, the reset pair and the sources, by their code. The
// API names the field in prose, in `detail`, and does not locate it, and its words are English
// and its own: each code has a sentence of the locales. A refusal of what the person
// chose is shown on its field. One about a field that is read-only is shown above the
// buttons (`field` absent): the form sends the pair it read back, so the person cannot
// change it to mend it, and a refusal pinned to a disabled control would never go.
const REFUSALS: Record<string, Refusal> = {
  ...Object.fromEntries(
    ['CreateEntitlement', 'UpdateEntitlement'].flatMap((operation) =>
      Object.entries(SOURCE_REFUSALS).map(([code, messageKey]) => [
        `${operation}.${code}`,
        { field: 'sources', messageKey } satisfies Refusal,
      ]),
    ),
  ),
  // An entitlement that a combined one sums cannot take a reset period of its own: the
  // lifetime counter that adopts one is refused. It is shown above the buttons, as the
  // other refusals about the window are, and the cadence can be taken back.
  'UpdateEntitlement.SourceWindowLocked': {
    messageKey: `${FORM}.Refusals.sourceWindowLocked`,
  },
  'CreateEntitlement.SlugConflict': {
    field: 'slug',
    messageKey: 'Pages.Entitlements.Mutation.Form.Errors.slugConflict',
  },
  'CreateEntitlement.InvalidResetAnchor': {
    field: 'resetAnchor',
    messageKey: 'Pages.Entitlements.Mutation.Form.Errors.resetAnchorCadence',
  },
  'UpdateEntitlement.ImmutableResetAnchor': {
    messageKey:
      'Pages.Entitlements.Mutation.Form.Refusals.immutableResetAnchor',
  },
  'UpdateEntitlement.ImmutableResetPeriod': {
    messageKey:
      'Pages.Entitlements.Mutation.Form.Refusals.immutableResetPeriod',
  },
  'UpdateEntitlement.InvalidResetAnchor': {
    field: 'resetAnchor',
    messageKey: 'Pages.Entitlements.Mutation.Form.Errors.resetAnchorCadence',
  },
};

/**
 * The body a form sends for its values. `entitlement` is the one the form edits:
 * the same one builds the body of the values the form opened with, so that the two
 * differ by what the person changed alone.
 */
const entitlementFormValuesToBody = (
  value: EntitlementFormValues,
  entitlement?: Entitlement,
): EntitlementWritable => {
  const combined = isCombinedFormValues(value);
  const body: EntitlementWritable = {
    ...value,
    groupSlugs: value.groupSlugs?.filter(Boolean) ?? [],
    // A blank slug is left out so the API generates one. An update never
    // sends it: the slug is fixed, and the API answers 422 to a new one.
    slug: entitlement ? undefined : toOptionalSlug(value.slug),
    // Overwrites the sentinel the form carries, and re-echoes a period
    // the API already stored rather than letting this full-replace PUT
    // read as an attempted change.
    ...resolveResetFields(value, entitlement),
    // The lines of the form are not the sources of a request: only a combined
    // entitlement names any, and the API refuses them on another.
    sources: combined ? sourcesToBody(value.sources) : undefined,
  };
  if (!isNumberFamily(body.type)) {
    body.aggregationMethod = undefined;
    body.warningThresholdPercent = undefined;
  }
  // Only a number says where its usage comes from, and only a NUMBER can have it
  // combined: the API answers 400 to a flag or a configuration that names it, and to
  // a credit pool that names the other, which a type changed on the form leaves behind.
  body.usageSource = !isNumberFamily(body.type)
    ? undefined
    : combined
      ? 'COMBINED_USAGE'
      : 'CALCULATED_USAGE';
  if (combined) {
    // A combined entitlement is a SUM that takes the window of its sources, which the
    // API derives from them and refuses a value that is not theirs: it sends none,
    // on creation and on every edit, since the edit may move the sources to another
    // window. Nothing crosses on a sum, so there is no threshold to warn at either.
    body.aggregationMethod = 'SUM';
    body.resetPeriod = undefined;
    body.resetAnchor = undefined;
    body.warningThresholdPercent = undefined;
  }
  conditionUnitFields(body);

  return body;
};

/**
 * The form of an entitlement, and the sentence of the locales for a refusal that
 * has no field to be shown on (`refusal`, a translation key, or none).
 *
 * `recovery` is the one of the creation page: the form then starts from its
 * values (the restored ones are put in by `useFormRecoveryForm`), and a creation
 * is sent through it, so that an accepted one is never offered again. The edit
 * form and the dialog do not pass it.
 */
export const useEntitlementMutationForm = (
  entitlement?: Entitlement,
  onSuccess?: (entitlement: Entitlement) => void,
  recovery?: FormRecovery<EntitlementFormValues>,
  /** Told which field a refusal was shown on: a wizard goes back to its step. */
  onFieldRefused?: (field: RefusedField) => void,
) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { createMutation, updateMutation } = useEntitlementFormMutations();
  // The entitlement and the form as they were when the form opened: an update
  // sends the fields that differ from them, and takes the others from the
  // entitlement as the API holds it.
  const [openedEntitlement] = useState(entitlement);
  const [openedValues] = useState(
    () => recovery?.pristine ?? getEntitlementFormDefaults(entitlement),
  );
  const [refusal, setRefusal] = useState<string | null>(null);

  // The body is built before the request, outside `send`: an error thrown while
  // building it is not an answer that never came.
  const createEntitlement = (body: EntitlementWritable) =>
    recovery
      ? recovery.send(() => createMutation.mutateAsync({ body }), {
          created: (created) => ({
            id: created.slug ?? created.id,
            label: created.name,
          }),
        })
      : createMutation.mutateAsync({ body });

  const form = useAppForm({
    defaultValues: openedValues,
    validators: {
      onChange: entitlementFormSchema,
    },
    listeners: {
      onChange: ({ formApi }) => {
        // A credit pool and a combined entitlement are always summed.
        if (
          (formApi.state.values.type === 'NUMBER_AI_CREDIT' ||
            isCombinedFormValues(formApi.state.values)) &&
          formApi.state.values.aggregationMethod !== 'SUM'
        )
          formApi.setFieldValue('aggregationMethod', 'SUM');
      },
    },
    onSubmit: async ({ formApi, value }) => {
      setRefusal(null);
      try {
        const body = entitlementFormValuesToBody(value, openedEntitlement);
        if (body.type === 'NUMBER_AI_CREDIT') body.aggregationMethod = 'SUM';

        // An update may answer with no body; the entitlement being edited
        // then stands in, since only its slug is needed downstream.
        const savedEntitlement = entitlement
          ? ((await updateMutation.mutateAsync({
              edited: body,
              entitlementSlug: entitlement.slug!,
              opened: entitlementFormValuesToBody(
                openedValues,
                openedEntitlement,
              ),
            })) ?? entitlement)
          : await createEntitlement(body);

        toast.success(
          t(
            entitlement
              ? 'Pages.Entitlements.Mutation.Form.updateSuccess'
              : 'Pages.Entitlements.Mutation.Form.createSuccess',
          ),
        );

        if (onSuccess) {
          onSuccess(savedEntitlement);
          return;
        }

        navigate({ to: '/catalog/entitlements' });
      } catch (error) {
        const known = REFUSALS[handleBillingProblem(error).code ?? ''];
        if (known && !known.field) {
          setRefusal(known.messageKey);

          return;
        }
        if (known?.field) {
          // A field that is not on screen has nowhere to show the refusal.
          if (formApi.getFieldMeta(known.field)) {
            setProblemFieldError(formApi, known.field, t(known.messageKey));
            onFieldRefused?.(known.field);
          } else {
            toast.error(t(known.messageKey));
          }

          return;
        }
        toast.error(getApiErrorMessage(error));
      }
    },
  });

  return { form, refusal };
};
