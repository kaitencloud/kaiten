import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/date-picker';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FILTER_MULTI_SELECT_SEPARATOR,
  FilterMultiSelect,
} from '@/functionals/filters';
import type { MetadataFormField } from './types';

type FieldInputProps = {
  field: MetadataFormField;
  value: unknown;
  onChange: (next: unknown) => void;
};

// `examples[0]` (per JSON Schema 2020-12) doubles as a placeholder hint — a
// free, schema-driven UX upgrade for the text/number inputs. Only the first
// example is surfaced; the rest stay for documentation.
function examplePlaceholder(field: MetadataFormField): string | undefined {
  const firstExample = Array.isArray(field.jsonSchema.examples)
    ? field.jsonSchema.examples[0]
    : undefined;
  return firstExample !== undefined && firstExample !== null
    ? String(firstExample)
    : undefined;
}

function StringInput({ field, value, onChange }: FieldInputProps) {
  return (
    <Input
      id={field.id}
      value={typeof value === 'string' ? value : ''}
      placeholder={examplePlaceholder(field)}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  );
}

function NumberInput({ field, value, onChange }: FieldInputProps) {
  return (
    <Input
      id={field.id}
      type="number"
      value={typeof value === 'number' ? value : ''}
      placeholder={examplePlaceholder(field)}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? undefined : Number(v));
      }}
    />
  );
}

// Tri-state select: a checkbox conflates "user toggled off" with "user hasn't
// touched the field", which sends `false` to the server in both cases — wrong
// for optional booleans where the schema allows the key to be absent. Three
// explicit options keep the intent legible. Required fields surface a
// `Required` error if left on "Not set" so the user is forced to pick.
const TRI_NOT_SET = '__not_set__';
const TRI_TRUE = 'true';
const TRI_FALSE = 'false';

function BooleanInput({ field, value, onChange }: FieldInputProps) {
  const current =
    value === true ? TRI_TRUE : value === false ? TRI_FALSE : TRI_NOT_SET;
  return (
    <Select
      items={[
        { value: TRI_NOT_SET, label: 'Not set' },
        { value: TRI_TRUE, label: 'Yes' },
        { value: TRI_FALSE, label: 'No' },
      ]}
      value={current}
      onValueChange={(next) => {
        if (next === TRI_TRUE) onChange(true);
        else if (next === TRI_FALSE) onChange(false);
        else onChange(undefined);
      }}
    >
      <SelectTrigger id={field.id} className="w-full">
        <SelectValue placeholder={field.label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TRI_NOT_SET}>Not set</SelectItem>
        <SelectItem value={TRI_TRUE}>Yes</SelectItem>
        <SelectItem value={TRI_FALSE}>No</SelectItem>
      </SelectContent>
    </Select>
  );
}

function DateInput({ value, onChange }: FieldInputProps) {
  return (
    <DatePicker
      date={value ? new Date(String(value)) : undefined}
      onSelect={(date) =>
        onChange(date ? date.toISOString().slice(0, 10) : undefined)
      }
    />
  );
}

function EnumInput({ field, value, onChange }: FieldInputProps) {
  const options = field.options ?? [];
  return (
    <Select
      items={options}
      value={typeof value === 'string' ? value : null}
      onValueChange={(v) => onChange(v || undefined)}
    >
      <SelectTrigger id={field.id} className="w-full">
        <SelectValue placeholder={field.label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EnumListInput({ field, value, onChange }: FieldInputProps) {
  const arrayValue = Array.isArray(value) ? value : [];
  const serialized = arrayValue
    .filter((v) => typeof v === 'string')
    .join(FILTER_MULTI_SELECT_SEPARATOR);
  return (
    <FilterMultiSelect
      options={field.options ?? []}
      value={serialized}
      onValueChange={(next) =>
        onChange(
          next
            ? next.split(FILTER_MULTI_SELECT_SEPARATOR).filter(Boolean)
            : undefined,
        )
      }
      placeholder={field.label}
    />
  );
}

// Read-only raw-JSON view. We deliberately don't accept edits — the schema
// shape is outside the six we model, so any editing UI we could plug in here
// would risk silently corrupting the value on save. The user keeps the
// original payload visible; a dedicated "Edit as JSON" escape hatch is a
// candidate.
function UnsupportedInput({ value }: { value: unknown }) {
  const display =
    value === undefined || value === null
      ? '(empty)'
      : JSON.stringify(value, null, 2);
  return (
    <div className="space-y-1">
      <pre className="bg-muted overflow-x-auto rounded p-2 text-xs">
        {display}
      </pre>
      <p className="text-muted-foreground text-xs italic">
        This field uses a schema shape the form doesn&apos;t support. The value
        is shown read-only — edit via the API.
      </p>
    </div>
  );
}

function FieldInput({ field, value, onChange }: FieldInputProps) {
  switch (field.uiType) {
    case 'string':
      return <StringInput field={field} value={value} onChange={onChange} />;
    case 'number':
      return <NumberInput field={field} value={value} onChange={onChange} />;
    case 'boolean':
      return <BooleanInput field={field} value={value} onChange={onChange} />;
    case 'date':
      return <DateInput field={field} value={value} onChange={onChange} />;
    case 'enum':
      return <EnumInput field={field} value={value} onChange={onChange} />;
    case 'enum_list':
      return <EnumListInput field={field} value={value} onChange={onChange} />;
    case 'unsupported':
      return <UnsupportedInput value={value} />;
  }
}

type DynamicFormFieldProps = {
  field: MetadataFormField;
  value: unknown;
  errors?: string[];
  onChange: (next: unknown) => void;
};

/** One labelled row of the {@link DynamicForm}: label + input + helper/errors. */
export function DynamicFormField({
  field,
  value,
  errors,
  onChange,
}: DynamicFormFieldProps) {
  const fieldErrors = errors ?? [];
  // Surface the JSON Schema's `description` as helper text so the intent the
  // admin captured in the schema reaches the form user. Kept simple (one-liner
  // under the label) — the form library can upgrade to tooltip / markdown later.
  const description =
    typeof field.jsonSchema.description === 'string'
      ? field.jsonSchema.description
      : undefined;

  return (
    <div className="space-y-1">
      <Label htmlFor={field.id}>
        {field.label}
        {field.required ? (
          <span className="text-destructive-subtle-foreground ml-1">*</span>
        ) : null}
      </Label>
      <FieldInput field={field} value={value} onChange={onChange} />
      {description ? (
        <p className="text-muted-foreground text-xs">{description}</p>
      ) : null}
      {fieldErrors.length > 0 ? (
        <ul className="text-destructive-subtle-foreground text-xs">
          {fieldErrors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
