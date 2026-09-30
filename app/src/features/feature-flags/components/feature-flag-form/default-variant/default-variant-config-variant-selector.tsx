import type { Variant } from '@/api-client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type VariantSelectorProps = {
  disabled?: boolean;
  label: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  value: string;
  variants: Variant[];
};

function renderVariantOption(variant: Variant) {
  return (
    <SelectItem key={variant.name} value={variant.name}>
      {variant.name}
    </SelectItem>
  );
}

export function VariantSelector({
  disabled = false,
  label,
  onValueChange,
  placeholder,
  value,
  variants,
}: VariantSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>{variants.map(renderVariantOption)}</SelectContent>
      </Select>
    </div>
  );
}

type RenderDefaultVariantSelectFieldProps = {
  label: string;
  onChange: (value: string) => void;
  options: Variant[];
  value: string;
};

export function renderDefaultVariantSelectField({
  label,
  onChange,
  options,
  value,
}: RenderDefaultVariantSelectFieldProps) {
  return (
    <VariantSelector
      label={label}
      onValueChange={onChange}
      placeholder={label}
      value={value}
      variants={options}
    />
  );
}
