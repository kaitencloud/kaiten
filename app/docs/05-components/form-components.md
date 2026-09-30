# Form components

The form system is in `app/src/components/form/`. `useAppForm` (`app/src/hooks/form.ts`) registers its fields and its submit button, so a form renders `field.TextField` inside `form.AppField` and `form.SubmitButton` inside `form.AppForm`, and never imports a field. How to build a form (schemas, create and edit modes, validation, submit) is in [forms](../03-patterns/forms.md), which also has the table of each field's value type and props. This page lists what exists and which control each field wraps.

## Fields

Each field is a file of `app/src/components/form/fields/`, registered in `fieldComponents` of `app/src/hooks/form.ts`.

| Field | File | Wraps |
| --- | --- | --- |
| `field.TextField` | `text-field.tsx` | `Input` |
| `field.TextAreaField` | `textarea-field.tsx` | `Textarea`. The component is named `TextareaField` in its file and registered as `TextAreaField`. |
| `field.NumberField` | `number-field.tsx` | `NumberInput` |
| `field.SelectField` | `select-field.tsx` | `Select` |
| `field.ComboboxField` | `combobox-field.tsx` | `Combobox` |
| `field.CheckboxField` | `checkbox-field.tsx` | `Checkbox` |
| `field.DatePickerField` | `date-picker-field.tsx` | `DatePicker` |
| `field.DateRangePickerField` | `date-range-picker-field.tsx` | `DateRangePicker` |
| `field.JsonField` | `json-field.tsx` | A CodeMirror editor that lints JSON |

Every field takes `label` and, optionally, `description`, `required` and `className`. The controls they wrap are in [UI components](./ui-components.md#inputs) and [Pickers](#pickers).

The story `Components/Form/Fields` ([`form-fields.stories.tsx`](../../src/components/form/fields/stories/form-fields.stories.tsx)) renders the fields, except `JsonField` and `DateRangePickerField`.

## Building blocks

The fields are composed from a few blocks, which a screen can also use to build a field of its own.

| Block | File | Role |
| --- | --- | --- |
| `FormField` | `fields/form-field.tsx` | The frame of a field: label, `RequiredMark`, description, error message. It takes a render function that receives the `field` from `useField`. |
| `useField` | `fields/use-field.ts` | Reads the TanStack Form field context: `value`, `errors`, `handleChange`, `handleBlur`, `hasError` (the field is touched and has an error) and `errorMessage`, already passed through `t`. |
| `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage` | `form-item.tsx`, `form-label.tsx`, `form-control.tsx`, `form-description.tsx`, `form-message.tsx` | The parts `FormField` renders. They share ids through a context, so the label, the description and the message are linked to the control by `aria-describedby`, `aria-invalid` and `aria-required`. |
| `RequiredMark` | `required-mark.tsx` | The asterisk drawn beside a required label, outside the `<label>` so the label text stays the field's name. |
| `SubmitButton` | `submit-button.tsx` | Registered as `form.SubmitButton`. It takes `label` and `allowPristine`; see [forms](../03-patterns/forms.md). |
| `FormStateBridge` | `form-state-bridge.tsx` | Reports `canSubmit`, `isSubmitting`, `isPristine` and `isValidating` to a parent callback. It sits inside a `form.Subscribe`, as in `app/src/features/feature-flags/targeting/components/basic-targeting-form.tsx`. |
| `form-context.tsx` | `form-context.tsx` | `fieldContext`, `formContext`, `useFieldContext` and `useFormContext`, the contexts `createFormHook` needs, and the item context the blocks share. |

A field that only one feature needs stays in that feature and is composed from these blocks. `CelField` (`app/src/features/feature-flags/targeting/components/cel-field.tsx`) reads `useFieldContext` and renders `FormItem`, `FormLabel`, `FormControl`, `FormDescription` and `FormMessage` around a CEL editor.

## Pickers

Three inputs sit at the top of `app/src/components/`, outside `ui/`: they compose several primitives. Each has a form field of its own (`ComboboxField`, `DatePickerField`, `DateRangePickerField`).

| Component | What it is | Story |
| --- | --- | --- |
| `Combobox` (`combobox.tsx`) | A searchable single choice on `Popover` and `Command`. `allowCustomValue` lets the user commit a typed value, `clearable` adds a clear action. | [combobox](../../src/components/stories/combobox.stories.tsx) |
| `DatePicker` (`date-picker.tsx`) | A date chosen from a `Calendar` in a popover. | [date-picker](../../src/components/stories/date-picker.stories.tsx) |
| `DateRangePicker` (`date-range-picker.tsx`) | A range of dates from a `Calendar`. | [date-range-picker](../../src/components/stories/date-range-picker.stories.tsx) |

## Adding a field

Build it on `FormField` and `useField`, then register it in `fieldComponents` of `app/src/hooks/form.ts`, next to the others (they are loaded with `React.lazy`). Reuse the existing fields before you add one.
