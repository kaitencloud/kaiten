# Form components

The form system is in `app/src/components/form/`. `useAppForm` (`app/src/hooks/form.ts`) registers its fields and its submit button, so a form renders `field.TextField` inside `form.AppField` and `form.SubmitButton` inside `form.AppForm`, and never imports a field. How to build a form (schemas, create and edit modes, validation, submit) is in [forms](../03-patterns/forms.md), which also has the table of each field's value type and props. This page lists what exists and which control each field wraps.

## Fields

Each field is a file of `app/src/components/form/fields/`, registered in `fieldComponents` of `app/src/hooks/form.ts`.

| Field | File | Wraps |
| --- | --- | --- |
| `field.TextField` | `text-field.tsx` | `Input` |
| `field.TextAreaField` | `textarea-field.tsx` | `Textarea`. The component is named `TextareaField` in its file and registered as `TextAreaField`. |
| `field.NumberField` | `number-field.tsx` | `NumberInput` |
| `field.MoneyField` | `money-field.tsx` | `Input`, with the currency beside it; the value is the string typed in major units |
| `field.SelectField` | `select-field.tsx` | `Select` |
| `field.ComboboxField` | `combobox-field.tsx` | `Combobox` |
| `field.CheckboxField` | `checkbox-field.tsx` | `Checkbox` |
| `field.DateTimeField` | `date-time-field.tsx` | `Input type="datetime-local"`; the value is the text the control holds (`2027-03-03T10:00`, no zone, empty when nothing is chosen), so a form says which zone it is read in and converts it itself |
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
| `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage` | `form-item.tsx`, `form-label.tsx`, `form-control.tsx`, `form-description.tsx`, `form-message.tsx` | The parts `FormField` renders. They share ids through a context, so the label, the description and the message are linked to the control by `aria-describedby`, `aria-invalid` and `aria-required`. `FormControl` takes `announceRequired={false}` for a control that renders a button or a bare container, which ARIA does not let carry `aria-required` (the date pickers, the CEL rule preview, the JSON editor, the checkbox row). |
| `RequiredMark` | `required-mark.tsx` | The asterisk drawn beside a required label, outside the `<label>` so the label text stays the field's name. |
| `SubmitButton` | `submit-button.tsx` | Registered as `form.SubmitButton`. It takes `label` and `allowPristine`; see [forms](../03-patterns/forms.md). |
| `FormStateBridge` | `form-state-bridge.tsx` | Reports `canSubmit`, `isSubmitting`, `isPristine` and `isValidating` to a parent callback. It sits inside a `form.Subscribe`, as in `app/src/features/feature-flags/targeting/components/basic-targeting-form.tsx`. |
| `form-context.tsx` | `form-context.tsx` | `fieldContext`, `formContext`, `useFieldContext` and `useFormContext`, the contexts `createFormHook` needs, and the item context the blocks share. |

A field that only one feature needs stays in that feature and is composed from these blocks. `CelField` (`app/src/features/feature-flags/targeting/components/cel-field.tsx`) reads `useFieldContext` and renders `FormItem`, `FormLabel`, `FormControl`, `FormDescription` and `FormMessage` around a CEL editor.

## Pickers

Five inputs sit at the top of `app/src/components/`, outside `ui/`: they compose several primitives. `Combobox`, `DatePicker`, `DateRangePicker` and `DateTimePicker` have a form field of their own (`ComboboxField`, `DatePickerField`, `DateRangePickerField`, `DateTimeField`).

There is no native date input in the console: `type="date"` and `type="datetime-local"` give each browser its own popup, language and keyboard, and nothing a test can drive the same way twice. A UTC day is picked with `DateInputPicker` and a UTC date and time with `DateTimePicker`. The local-time `DatePicker` is for a moment the person thinks of in their own zone.

| Component | What it is | Story |
| --- | --- | --- |
| `Combobox` (`combobox.tsx`) | A searchable single choice on `Popover` and `ComboboxPanel`. `allowCustomValue` lets the user commit a typed value, `clearable` adds a clear action. | [combobox](../../src/components/stories/combobox.stories.tsx) |
| `DatePicker` (`date-picker.tsx`) | A date chosen from a `Calendar` in a popover. | [date-picker](../../src/components/stories/date-picker.stories.tsx) |
| `DateRangePicker` (`date-range-picker.tsx`) | A range of dates from a `Calendar`. | [date-range-picker](../../src/components/stories/date-range-picker.stories.tsx) |
| `DateInputPicker` (`date-input-picker.tsx`) | A UTC day from a `Calendar` set to UTC, in a popover. It holds the text a `type="date"` input held (`2027-03-01`, `''` when none), shows the day in the language of the app, and clears with a button. The button takes the `id` and the `aria-*` props a field hands down, so a label names it. A text that is not a day shows as none and stays as it is until a day is picked. Where a form wants the instant, `dateInputToInstant` of `lib/date-input.ts` reads the text as midnight UTC. | [date-input-picker](../../src/components/stories/date-input-picker.stories.tsx) |
| `DateTimePicker` (`date-time-picker.tsx`) | A UTC date and time: the same calendar and a `HH:mm` field in the popover. It holds the text a `datetime-local` input held (`2027-03-03T10:00`, no zone, no seconds, `''` when none). Picking a day keeps the time already set, or starts at `00:00`. The time is taken once it is a time of day. The calendar offers the years 2000 to 2100, and more when the value lies outside them. `onBlur` runs when the popover closes or the button loses the focus without opening it, which is when a form marks the field as touched. | [date-time-picker](../../src/components/stories/date-time-picker.stories.tsx) |

## Adding a field

Build it on `FormField` and `useField`, then register it in `fieldComponents` of `app/src/hooks/form.ts`, next to the others, which are imported statically (`JsonField` alone is loaded on demand: see [forms](../03-patterns/forms.md#building-blocks)). Reuse the existing fields before you add one.
