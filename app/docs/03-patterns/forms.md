# Forms

Forms use [TanStack Form](https://tanstack.com/form) for state and [Zod](https://zod.dev) for validation, wired through `useAppForm` from `@/hooks/form`. A form submits through a TanStack Query mutation. The form schema starts from the Zod schema generated from the OpenAPI contract and is never rewritten by hand (see [Validation schemas](#validation-schemas)).

## Building blocks

| What | Where |
| --- | --- |
| `useAppForm`: TanStack Form's `createFormHook` with the app's fields and submit button plugged in | `app/src/hooks/form.ts` |
| `withForm`, `withFieldGroup`: type-safe sections of a larger form | same file |
| `createFormSubmitHandler`: the `onSubmit` of the `<form>` element | same file |
| `form.AppForm`, `form.AppField`, `field.<Name>`: the provider, one field, and the field components | `useAppForm`, with the components in `app/src/components/form/fields/` |
| `form.SubmitButton` | `app/src/components/form/submit-button.tsx` |

The field components and `SubmitButton` are loaded with `React.lazy`, so they suspend on their first render. Keep a `Suspense` boundary above them. A dialog form adds its own, as the example below and `features/customers/components/customer-form-fields.tsx` do. In the example the field boundary shows a `DialogFormSkeleton` and the button boundary shows nothing.

## A form end to end

```tsx
// app/src/features/service-accounts/components/create-dialog.tsx
// (abridged: the dialog markup, the type cast on `defaultValues` and the
// field's `description` are left out)
import { Suspense } from 'react';
import { zServiceAccountWritable } from '@/api-client/zod.gen';
import { DialogFormSkeleton } from '@/components/dialog/dialog-form-skeleton';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';

const createServiceAccountSchema = zServiceAccountWritable
  .pick({ name: true })
  .extend({
    name: zServiceAccountWritable.shape.name.min(1, {
      message: 'Pages.Integrations.ServiceAccounts.Dialog.nameRequired',
    }),
  });

// inside the component
const { t } = useTranslation();

const form = useAppForm({
  defaultValues: { name: '' },
  validators: { onChange: createServiceAccountSchema },
  onSubmit: async ({ value }) => {
    onSubmit(value.name);
    onOpenChange(false);
  },
});

return (
  <form onSubmit={createFormSubmitHandler(form.handleSubmit)}>
    <form.AppForm>
      <Suspense fallback={<DialogFormSkeleton fields={1} />}>
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              label={t('Pages.Integrations.ServiceAccounts.Dialog.nameLabel')}
              required
              placeholder={t('Pages.Integrations.ServiceAccounts.Dialog.namePlaceholder')}
            />
          )}
        </form.AppField>
      </Suspense>
      <Suspense fallback={null}>
        <form.SubmitButton label={t('Pages.Integrations.ServiceAccounts.Dialog.createButton')} />
      </Suspense>
    </form.AppForm>
  </form>
);
```

The pieces:

1. The schema decides what is valid. It sits in `features/<name>/schemas/<name>.schema.ts`, or beside the form when the form is small.
2. `useAppForm` takes `defaultValues`, `validators` and `onSubmit`, as TanStack Form's `useForm` does.
3. `form.AppForm` provides the form to `SubmitButton`, which must be rendered inside it. `form.AppField` binds one field by name and hands a `field` that carries the field components (`field.TextField` and the others).
4. Every field and the button take translated strings: see [i18n](../02-conventions/i18n.md#in-forms).

### Submitting the DOM form

Wire every rendered form as `<form onSubmit={createFormSubmitHandler(form.handleSubmit)}>`. The handler calls `event.preventDefault()`, so the browser does not submit the page, and `event.stopPropagation()`, so the event stays with this form, which matters for a form rendered in a dialog or inside another form's React tree. Then it calls `form.handleSubmit()`.

A custom handler keeps the same contract:

```tsx
const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  event.stopPropagation();
  void form.handleSubmit();
};
```

`<form onSubmit={form.handleSubmit}>` does neither.

## Fields

Every field takes `label` and, optionally, `description`, `required` and `className`. The last column lists what else each one takes; the source file has the exact types. `Components/Form/Fields` in Storybook (`app/src/components/form/fields/stories/form-fields.stories.tsx`) renders every field except `JsonField` and `DateRangePickerField`.

| `field.` | File in `components/form/fields/` | Value | Other props |
| --- | --- | --- | --- |
| `TextField` | `text-field.tsx` | `string` | `placeholder`, `disabled`, `onChange(value)`. A single-line input. |
| `TextAreaField` | `textarea-field.tsx` | `string` | `placeholder`, `disabled`. The component is named `TextareaField` in its file and registered as `TextAreaField`. |
| `NumberField` | `number-field.tsx` | `number`, `NaN` while the input is empty | `min`, `max`, `step`, `placeholder`, `disabled`, `onChange(value)` |
| `MoneyField` | `money-field.tsx` | `string`, the amount as typed in major units (`0.075`) | `currency` (required, shown beside the input), `placeholder`, `disabled`, `onChange(value)`. A float loses the decimals of a price per sale unit, so the string goes to the schema and, at submit time, through `majorToMinorDecimal` of `@/lib/money`. |
| `SelectField` | `select-field.tsx` | `string` | `options`, `getOptionLabel`, `getOptionValue` (defaults to the option itself), `placeholder`, `disabled` |
| `ComboboxField` | `combobox-field.tsx` | `string` | `options`, `getOptionLabel`, `getOptionValue`, `searchPlaceholder`, `placeholder`, `allowCustomValue`, `clearable`, `clearLabel`, `disabled` |
| `CheckboxField` | `checkbox-field.tsx` | `boolean` | `disabled`. The label sits beside the box. |
| `DatePickerField` | `date-picker-field.tsx` | `Date \| undefined`, or an ISO string with `useISOString` | `placeholder`, `disabled` |
| `DateRangePickerField` | `date-range-picker-field.tsx` | `DateRange \| undefined` (from `react-day-picker`) | the props of `DateRangePicker` in `components/date-range-picker.tsx` |
| `JsonField` | `json-field.tsx` | `string`, the JSON text | `placeholder` and the props of the CodeMirror editor. Lints the JSON; an empty value is not flagged. |

To add a field, build it on `FormField` and `useField` (`fields/form-field.tsx`, `fields/use-field.ts`) and add it to `fieldComponents` in `hooks/form.ts`.

### Required fields

- Pass `required` to the field. `RequiredMark` draws an asterisk beside the label, outside the `<label>`, and `FormControl` sets `aria-required` on the control. Never write the asterisk in the label text: it would change the name that tests and screen readers use for the field.
- Mark what the schema requires, nothing more. A field with a default value is not required from the user's point of view.

## Validation schemas

The form schema starts from the generated schema of its entity in `@/api-client/zod.gen`, so the constraints the API declares (lengths, enums, formats) apply to the form without being copied. [api-generation.md](../01-architecture/api-generation.md#validation-schemas) explains the generated schemas and the cases that have none, and [Generated code](../AI_CONTEXT.md#generated-code) states the rule.

```typescript
// app/src/features/licenses/schemas/license.schema.ts (abridged)
import { z } from 'zod';
import { zLicenseWritable } from '@/api-client/zod.gen';

// Accept an empty string so the optional slug can be left blank in the form.
const optionalField = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  schema.or(z.literal(''));

export const licenseFormSchema = zLicenseWritable
  .pick({ name: true, description: true, type: true, versionName: true })
  .extend({
    // Override with i18n-friendly validation messages
    name: z.string().min(1, 'Pages.Licenses.Mutation.Form.Errors.name'),
    // Optional: left empty, the API generates the slug.
    slug: optionalField(zLicenseWritable.shape.slug.unwrap()),
    // A field that exists only in the form
    createAsDraft: z.boolean(),
  });

export type LicenseFormValues = z.infer<typeof licenseFormSchema>;
```

- `.pick()` keeps the fields the form shows; `.extend()` overrides only what differs: a message, a UI-only field, a stricter rule.
- `zDeploymentZoneWritable.extend({...})` (`features/deployment-zones/schemas/deployment-zone.schema.ts`) extends the whole schema; `zVariant` is used as is in `features/feature-flags/variants/schemas/variant.schema.ts`.
- A form made of several steps validates each step with a `.pick()` of one schema: `step1Schema` to `step4Schema` in `features/feature-flags/schemas/feature-flag.schema.ts`.
- When the form state is not the request body, compose the schema from generated fields. The release form also carries its creation mode and component patches, so `features/releases/schemas/release.schema.ts` builds a `z.object` around `zReleaseWritable.shape.version` and its sibling fields. A plain `z.object` with no generated field is for form state the contract does not describe, such as `features/webhooks/schemas/create-webhook.schema.ts` (the webhook endpoints are called from `features/webhooks/webhooks.api.ts`, outside the OpenAPI contract).

### Messages are i18n keys

A validation message is a translation key, as in `'Pages.Licenses.Mutation.Form.Errors.name'`. Each field component reads its errors through `useField`, which runs the first message through `t` and shows it once the field has been touched. A message that is not a key is displayed as written, in English. Add the key to both locales: see [i18n](../02-conventions/i18n.md#adding-a-key).

### When validation runs

Forms validate on change: `validators: { onChange: schema }`. Other timings appear where a form needs them:

- `onBlur`: `features/feature-flags/variants/components/variant-form.tsx` validates a variant when a field loses focus.
- A debounced async validator on one field, next to the form-level schema. This is the CEL rule of a targeting form, checked by the server:

```tsx
// app/src/features/feature-flags/targeting/components/targeting-base-fields.tsx (abridged)
<group.AppField
  name="rule"
  validators={{
    onChangeAsyncDebounceMs: 400,
    onChangeAsync: ruleVerdictValidator(lint),
    onSubmitAsync: ruleVerdictValidator(lint),
  }}
>
```

## Submit button

`form.SubmitButton` takes `label` (a string, not children) and the props of `Button`, except `children` and `type`. It is disabled while the form is validating, invalid or submitting, and while it is pristine. When the form has been touched and is still invalid, it shows the `Common.requiredFieldsHint` message beside the button to say why it is grey.

- `allowPristine` lets an untouched form submit. An edit form has nothing to save until something changes, so the default is right for it. A create form whose defaults already make a complete submission sets it: `features/licenses/components/forms/license-version-form-layout.tsx`.
- `form="<id>"` associates the button with a `<form>` element it is not inside in the DOM, such as a dialog footer rendered through a portal: `features/customers/components/customer-form.tsx`.
- A flow that needs more than this builds its own button on `form.Subscribe`: `FinalSubmitButton` in `features/feature-flags/components/feature-flag-form/create-stepper.tsx` also explains, in a tooltip, why it is disabled.

## Create and edit

One form component serves both modes. The optional entity prop selects the mode: it sets the default values and picks the mutation. A request addresses the entity by its slug (`path: { customerSlug }`).

```tsx
// app/src/features/customers/components/customer-form.tsx (abridged)
const form = useAppForm({
  defaultValues: customer
    ? customerToFormValues(customer)
    : initialCustomerFormValues,
  validators: { onChange: customerFormSchema },
  onSubmit: async ({ value }) => {
    try {
      const savedCustomer = customer
        ? ((await updateMutation.mutateAsync({
            path: { customerSlug: customer.slug! },
            body: customerFormValuesToUpdateBody(value),
          })) ?? customer)
        : await createMutation.mutateAsync({
            body: customerFormValuesToCreateBody(value),
          });
      handleSuccess(savedCustomer);
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    }
  },
});
```

The form values and the request body are different shapes: the values keep an empty string for an optional field, the body omits it. Map one to the other with a named function, as `customerFormValuesToCreateBody` does in `features/customers/components/customer-form.shared.ts`, next to the schema and the default values.

### After a submission

- **Errors.** `mutateAsync` throws, so `onSubmit` wraps it in `try/catch` and shows `toast.error(getApiErrorMessage(error))`. See [error handling](../02-conventions/error-handling.md).
- **Success.** `toast.success(t('<key>'))`, from the mutation's `onSuccess` or from `onSubmit`.
- **Cache.** After a successful mutation, invalidate the affected queries with the generated query key functions. See [query key invalidation](../02-conventions/query-key-invalidation.md).
- **Navigation.** A page form navigates with `useRouter` (`features/licenses/components/forms/license-form.tsx`) or `useNavigate` (`features/customers/components/customer-form.tsx`). A form shown in a dialog takes one of two shapes. Either it takes `onSuccess` and `onCancel` callbacks and a wrapper closes the dialog: `CustomerForm` inside `CustomerFormDialog` (`features/customers/components/customer-form-dialog.tsx`); `CustomerForm` navigates to the list when a callback is absent. Or it receives `onOpenChange` and calls it with `false` after a successful submit, as the example above does. See [dialog via route](./dialog-via-route.md).

## Large forms

A form whose logic outgrows its component moves that logic into a hook, `features/<name>/hooks/use-<name>-form.ts`: the feature flag, deployment zone and release forms do (`use-feature-flag-form.ts`, `use-deployment-zone-form.ts` and `use-release-form.ts`, in the `hooks/` folder of each feature). The hook builds the form with `useAppForm`, owns the mutations and the local state around it, and returns what the component needs:

```typescript
// app/src/features/feature-flags/hooks/use-feature-flag-form.ts (abridged)
export const useFeatureFlagForm = ({ featureFlag }: FeatureFlagFormProps) => {
  // mutations, and the state of the "change the type" confirmation dialog
  const form = useAppForm({
    ...featureFlagFormOpts,
    defaultValues: getFeatureFlagFormInitialValues(featureFlag),
    listeners: { onChange: ({ formApi }) => { /* ask before a type change drops data */ } },
    onSubmit: async ({ value }) => { /* update or create, then navigate */ },
  });

  return { form, handleCancel, dialog: { /* open, onConfirm, onCancel, ... */ } };
};
```

The form stays one instance with one schema. Only the rendering is split, into sections, steps or tabs. Options shared by the hook and the sections live in a `formOptions` object (`features/feature-flags/utils/shared-form.ts`), and each section is a `withForm` component that receives the form typed:

```tsx
// app/src/features/feature-flags/components/feature-flag-form/general-form.tsx (abridged)
export const GeneralForm = withForm({
  ...featureFlagFormOpts,
  props: {} as GeneralFormProps,
  render: function GeneralFormRender({ form, featureFlag }) {
    // form.AppField and field.TextField, as above
  },
});
```

`withFieldGroup` does the same for a group of fields reused by several forms: `features/feature-flags/targeting/components/targeting-base-fields.tsx`.
