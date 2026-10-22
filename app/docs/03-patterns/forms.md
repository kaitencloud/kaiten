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

The field components and `SubmitButton` are imported statically, so a form draws them on its first render and never suspends for them. They were `React.lazy` once, and a lazy component that suspends on its first render holds its fallback on screen for about 300 ms whatever the load time, because React delays revealing content after a fallback has been shown. Every form opened behind a spinner for that long, even with its chunks cached, and the fields weigh a few kilobytes: the heavy things they wrap are in chunks the app loads anyway. Do not wrap fields in a `Suspense` boundary, and do not make a field `lazy` to save a few kilobytes.

`JsonField` is the one exception, because CodeMirror weighs more than all the other fields together. `hooks/form.ts` registers `components/form/fields/lazy-json-field.tsx`, which loads the editor when a form first draws it and carries a boundary of its own around the editor, so the form around it stays on screen and a field-shaped placeholder takes the editor's place.

## A form end to end

```tsx
// app/src/features/service-accounts/components/create-dialog.tsx
// (abridged: the dialog markup, the type cast on `defaultValues` and the
// field's `description` are left out)
import { zServiceAccountWritable } from '@/api-client/zod.gen';
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
      <form.AppField name="name">
        {(field) => (
          <field.TextField
            label={t('Pages.Integrations.ServiceAccounts.Dialog.nameLabel')}
            required
            placeholder={t('Pages.Integrations.ServiceAccounts.Dialog.namePlaceholder')}
          />
        )}
      </form.AppField>
      <form.SubmitButton label={t('Pages.Integrations.ServiceAccounts.Dialog.createButton')} />
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
| `TextField` | `text-field.tsx` | `string` | `placeholder`, `disabled`, `onChange(value)`, `inputMode`, `autoComplete` (`off` for a field that holds a code the person types once, such as a voucher code, so that the browser neither remembers nor offers it again), `type` (`password` for a secret that is typed and never read back, such as the restricted key of a payment provider: the characters are hidden and the browser is told not to offer it again). A single-line input. |
| `TextAreaField` | `textarea-field.tsx` | `string` | `placeholder`, `disabled`. The component is named `TextareaField` in its file and registered as `TextAreaField`. |
| `NumberField` | `number-field.tsx` | `number`, `NaN` while the input is empty | `min`, `max`, `step`, `placeholder`, `disabled`, `onChange(value)`, `allowOutOfRange` (a number typed past `min` or `max` is kept for the schema to refuse in its own words, instead of being brought back to the bound; the steppers still stop there) |
| `MoneyField` | `money-field.tsx` | `string`, the amount as typed in major units (`0.075`) | `currency` (required, shown beside the input), `placeholder`, `disabled`, `onChange(value)`. A float loses the decimals of a price per sale unit, so the string goes to the schema and, at submit time, through `majorToMinorDecimal` of `@/lib/money`. |
| `DateTimeField` | `date-time-field.tsx` | `string`, the text a `datetime-local` input holds (`2027-03-03T10:00`, no zone, `''` when empty); the day is picked on a calendar and the time set in a `TimeField` beside it (`HH : mm`, 24-hour, hours and minutes only) | `disabled`. The field does not say which zone it is read in: the label or the description does, and the form converts the text at submit time (`dateTimeInputToInstant` of `lib/date-time-input.ts` reads it as UTC). |
| `SelectField` | `select-field.tsx` | `string` | `options`, `getOptionLabel`, `getOptionValue` (defaults to the option itself), `isOptionDisabled(option)` (an option that is listed and cannot be chosen: its label says why), `placeholder`, `disabled` |
| `ComboboxField` | `combobox-field.tsx` | `string` | `options`, `getOptionLabel`, `getOptionValue`, `searchPlaceholder`, `placeholder`, `allowCustomValue`, `clearable`, `clearLabel`, `disabled` |
| `CheckboxField` | `checkbox-field.tsx` | `boolean` | `disabled`. The label sits beside the box. |
| `SwitchField` | `switch-field.tsx` | `boolean` | `disabled`. For a setting that takes effect and reads "on" or "off", where `CheckboxField` is for agreeing to something: the label sits above the switch and the description below. A switch is not a form control that `disabled` applies to, so a disabled one says so by `aria-disabled`, and the description it points to says why it cannot be turned on. |
| `DatePickerField` | `date-picker-field.tsx` | `Date \| undefined`, or an ISO string with `useISOString` | `placeholder`, `disabled` |
| `DateRangePickerField` | `date-range-picker-field.tsx` | `DateRange \| undefined` (from `react-day-picker`) | the props of `DateRangePicker` in `components/date-range-picker.tsx` |
| `JsonField` | `json-field.tsx` | `string`, the JSON text | `placeholder` and the props of the CodeMirror editor. Lints the JSON; an empty value is not flagged. |

To add a field, build it on `FormField` and `useField` (`fields/form-field.tsx`, `fields/use-field.ts`) and import it in `hooks/form.ts`, then add it to `fieldComponents`. A field that drags in something heavy, as `JsonField` does with CodeMirror, goes behind a wrapper like `lazy-json-field.tsx` that owns its `Suspense`.

### Required fields

- Pass `required` to the field. `RequiredMark` draws an asterisk beside the label, outside the `<label>`, and `FormControl` sets `aria-required` on the control. A control that is a button or a bare container cannot carry it (axe reports `aria-allowed-attr`): wrap it in `<FormControl announceRequired={false}>`, and put the attribute on the element that has a role allowing it, as `CheckboxField` does on its checkbox. Never write the asterisk in the label text: it would change the name that tests and screen readers use for the field.
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
- A form made of several steps validates each step with a `.pick()` of one schema: `step1Schema` to `step4Schema` in `features/feature-flags/schemas/feature-flag.schema.ts`. A step schema holds every field the step shows, including the slug the name fills in and the display order: Next is disabled until it passes, and a field left out would let its error through to the last step, where only a greyed button points at it (`entitlementIdentityStepSchema`, `instanceCreationDetailsFormSchema`). A stepper that jumps forward checks the steps it passes. The Next of a step is `StepNextButton` (`components/form/step-next-button.tsx`): while it is disabled it is described, for assistive technology, by a sentence that says why (`Common.nextBlocked`), since the field in error can be out of view. A message that a schema gives a field is the key of a translation, and a type check of the generated schema (a fraction for an integer) is given one in the form's words, as `displayOrderSchema` does for the order of an entitlement.
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

A disabled button cannot hold the keyboard focus, so a person who sends a form with the keyboard, or by clicking the button in Chrome, would be dropped on `<body>` each time the button greys out while the form submits. `SubmitButton` remembers that it had the focus (`components/form/use-submit-focus.ts`) and, once the form has settled, puts the focus on the first control that shows an error (`aria-invalid="true"`), which is how the refusal of the API about a field is announced, or back on the button when the form is valid again. A person who moved the focus elsewhere keeps it. A form that builds its own button on `form.Subscribe` has to do the same itself.

- `allowPristine` lets an untouched form submit. An edit form has nothing to save until something changes, so the default is right for it. A create form whose defaults already make a complete submission sets it: `features/licenses/components/forms/license-version-form-layout.tsx`.
- `form="<id>"` associates the button with a `<form>` element it is not inside in the DOM, such as a dialog footer rendered through a portal: `features/customers/components/customer-form.tsx`.
- A flow that needs more than this builds its own button on `form.Subscribe`: `FinalSubmitButton` in `features/feature-flags/components/feature-flag-form/create-stepper.tsx` also explains, in a tooltip, why it is disabled.

A button that is not a form's submit, such as "Retry push", "Disconnect" or an export, runs a mutation on `onClick`. Keep `disabled={isPending}` on it for what the person sees, and put the request behind `useSingleFlight` or `useSingleFlightMutate` (`@/hooks/use-single-flight`): `isPending` reaches the screen a frame after the click, so two clicks of the same frame (a `dblclick()` of Playwright, a fast trackpad) would both send the request. The guard is a ref set before the request starts and released when it settles (`useSingleFlightMutate` takes `mutateAsync` and follows its promise, since TanStack Query drops the callbacks given to `mutate` when the mutation is fired again). When a toast offers to try again, give it the same guarded function as the button. A form needs none: `handleSubmit` already ignores a submit while one runs.

## Create and edit

One form component serves both modes. The optional entity prop selects the mode: it sets the default values and picks the mutation. A request addresses the entity by its slug (`path: { customerSlug }`).

```tsx
// app/src/features/customers/components/customer-form.tsx (abridged)
// What the form opened with is kept as it was: see "Updating an object the API
// replaces as a whole" below.
const [openedValues] = useState(() =>
  customer ? customerToFormValues(customer) : initialCustomerFormValues,
);

const form = useAppForm({
  defaultValues: openedValues,
  validators: { onChange: customerFormSchema },
  onSubmit: async ({ value }) => {
    try {
      const savedCustomer = customer
        ? ((await updateMutation.mutateAsync({
            customerSlug: customer.slug!,
            edited: customerFormValuesToUpdateBody(value),
            opened: customerFormValuesToUpdateBody(openedValues),
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
- **A refusal about one field.** When the API refuses a value and says which field, show its words on that field and not in a toast: a field component shows the first error of the field, and an error from the server is an object with a `message` (`errorMap.onServer`). `setProblemFieldError(form, field, message)` from `@/domains/billing` sets it and takes it back as soon as the field holds another value, since a refusal is about what was typed and a form that stayed invalid after the person fixed it would not let them send it again; `clearProblemFieldError(form, field)` takes it back before any change, for a refusal about what several fields say together; `placeRefusalOnFields` places a problem on the fields its code or its locations name and says whether it found one, and the form shows the rest above the buttons. See [`domains/billing`](../../src/domains/billing/README.md).
- **Success.** `toast.success(t('<key>'))`, from the mutation's `onSuccess` or from `onSubmit`.
- **Cache.** After a successful mutation, invalidate the affected queries with the generated query key functions. See [query key invalidation](../02-conventions/query-key-invalidation.md).
- **Navigation.** A page form navigates with `useRouter` (`features/licenses/components/forms/license-form.tsx`) or `useNavigate` (`features/customers/components/customer-form.tsx`). A form shown in a dialog takes one of two shapes. Either it takes `onSuccess` and `onCancel` callbacks and a wrapper closes the dialog: `CustomerForm` inside `CustomerFormDialog` (`features/customers/components/customer-form-dialog.tsx`); `CustomerForm` navigates to the list when a callback is absent. Or it receives `onOpenChange` and calls it with `false` after a successful submit, as the example above does. See [dialog via route](./dialog-via-route.md).

## Updating an object the API replaces as a whole

Most `PUT` operations of the API replace the object: they require its required members (`PUT /customers/{slug}` requires the name, `PUT /licenses/{slug}` and `PUT /addons/{slug}` the name, the description and `isDefault`) and clear or reset the optional ones left out. A form that sends the object it read when it opened therefore also sends back, unasked, every member somebody else changed since: a rename made in another tab, a default moved to another version of a family. The API has no version check, so nothing refuses the write and nobody is told.

The rule: **a full `PUT` re-reads the object first and sends only what the form changed.** It narrows the race to the time between that read and the write; it does not remove it. Until the API checks a version, a console update is last-writer-wins.

The rule lives in one helper, `app/src/lib/api/fresh-write.ts`:

| Export | What it does |
| --- | --- |
| `mergeChangedFields({ edited, fresh, opened })` | Pure. Starts from `fresh`, the object as the API holds it now, restated as a body, and puts on top of it each member of `edited` that differs from `opened`. A member the form did not change keeps the value it has now. Members are compared structurally, and an absent member equals a `null`. The merge works member by member at the top level: a member that is an object or an array (a metadata map, a list of slugs, the value of a grant) is replaced whole when the form changed any part of it, so a key another tab added to the same map is lost. |
| `writeOnFresh({ read, restate, opened, edited, write })` | Reads the object (`read`), restates it as a body (`restate`), merges, and writes the result (`write`). It resolves to what `write` resolves to. |
| `FRESH_READ_OPTIONS` | `{ cache: 'no-store' }`, spread into the generated `GET` so that the read comes from the API and from no cache, the browser's included. |

The body of each entity is built twice, by the same function, from the same object: once from what the form opened with (`opened`) and once from what it holds now (`edited`). They differ by what the person changed and by nothing else, which is what makes the comparison sound. A third function, `restate`, builds the same body from the object just read. Because all three are the same shape, a member the form does not carry (a default flag, a slug that never changes) is the same in `opened` and `edited` and so is taken from the fresh read.

Each entity has one `save<Entity>OnFresh` that wires the helper to its generated `GET` and `PUT`, next to the entity's other queries (`queries/` of the feature or the domain), and a `<entity>ToUpdateBody` that restates an object as a body. A hook then uses it as the `mutationFn`:

```tsx
// app/src/features/licenses/components/commercial/use-license-commercial-form.ts (abridged)
const [opened] = useState(() => ({
  license,
  values: licenseToCommercialFormValues(license),
}));
const update = useMutation({
  mutationFn: saveLicenseOnFresh,
  onSuccess: async () => { /* invalidate, as for any write */ },
});

const form = useAppForm({
  defaultValues: opened.values,
  onSubmit: async ({ value }) => {
    await update.mutateAsync({
      edited: commercialFormValuesToUpdateBody(value, opened.license),
      licenseSlug: license.slug ?? license.id,
      opened: commercialFormValuesToUpdateBody(opened.values, opened.license),
    });
  },
});
```

```ts
// app/src/features/licenses/queries/license-save.ts (abridged)
export function saveLicenseOnFresh({ edited, licenseSlug, opened }: SaveLicenseVariables) {
  return writeOnFresh({
    edited,
    opened,
    read: async () => (await getLicense({ ...FRESH_READ_OPTIONS, path: { licenseSlug }, throwOnError: true })).data,
    restate: licenseToUpdateBody,
    write: async (body) => (await updateLicense({ body, path: { licenseSlug }, throwOnError: true })).data,
  });
}
```

Rules for a form that uses it:

- **Keep what the form opened with.** Take a snapshot of the object and of the values with `useState(() => ...)` and give the snapshot to `defaultValues`. Do not rebuild them from props at each render: a refetch while the form is open would move the baseline under the person's edits, and what they did not touch would count as changed.
- **A form that stays open after a save** (a settings card, a profile form, a hook such as `useSetBillingEmail`) moves its baseline to what the API kept, as it resets its values, and gives that baseline to `defaultValues` so that a refetch resets the values and the baseline together. One that closes needs nothing.
- **A form reused for another object must be keyed by that object.** The snapshot is taken once, when the component mounts: a long-lived dialog that is shown again for another object without a `key` would keep both the baseline and the displayed values of the previous one.
- **A cache that is written is given what the write answered or sent.** Most updates invalidate with the generated query keys, as after any write. Where a cache is written instead (the feature flags, the groups of entitlements), a `PUT` that answers `204` resolves, in `write`, to the body that was sent: that is the merged body, not the form's.
- **A deleted object.** The read refuses with a `404` and the write is not sent: the `PUT` of a deleted object must never be able to create it again. The refusal reaches the form as a refusal of the update would, in the API's words, through `getApiErrorMessage` or the form's `ProblemAlert`.
- **Tests.** Cover the helper with a unit test of the merge, and each form with two tests that serve the object through the mock API: one where the object changed on the server between the opening and the save, which proves that the other change survives and the form's is applied; one where the object was deleted meanwhile, which proves that the save says so and writes nothing.

The writes that use the helper are the `save*OnFresh` functions: `saveCustomerOnFresh`, `saveLicenseOnFresh`, `saveAddonOnFresh`, `saveAddonGrantOnFresh`, `saveFeatureFlagOnFresh`, `saveVoucherOnFresh`, `saveInstanceOnFresh`, `saveDeploymentZoneOnFresh`, `saveEntitlementOnFresh`, `saveEntitlementGroupOnFresh`, `saveComponentOnFresh`, `saveBillingSettingsOnFresh` and `saveProfileOnFresh`.

A `PUT` that stays as it was, and why:

- **No object read from a cache.** The compatibility of an add-on with a license family (`PUT .../compatibility/{familySlug}`) is an idempotent fact, the notification preferences (`PUT /notification-preferences`) send the changes alone, and a scheduled plan change (`PUT .../billing/scheduled-change`) creates a resource from a chosen price.
- **A secret the API never gives back.** The connector settings (Stripe, Attio) are written whole from the form, and so is their activation (`activateConnector`); there is nothing to read again.
- **No console caller yet.** `updateCustomerIntegration`, `updateInstanceIntegration`, `updateServiceAccount` and `putUserAuthorization` are not called by the console. The rule applies to them when one does.
- **No read by key.** A role (`PUT /roles/{slug}`) has no `GET` of its own, only the list: a read would be the whole list, and a role missing from it would have to be inferred.
- **The baseline moves too often, or is not in the caller's hands.** The draft of a voucher in its wizard is saved at each step and again on publication, so its baseline changes with every answer; the wizard owns the whole draft as form state and sends every member from it, and what remains is another tab editing the same draft; the wizard's own `saved` object is the only baseline it has. The inline threshold of a license grant (`PUT .../licenses/{slug}/entitlements/{slug}`) receives two numbers from its cell and not the row it was opened on. Both want their own design.

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
