import type { Variant as ApiVariant } from '@/api-client';

// Extended variant type
export type Variant = ApiVariant;

export type VariantFormValues = {
  name: string;
  description: string;
  value: unknown;
};

export type VariantListProps = {
  variants: Variant[];
  type: 'boolean' | 'string' | 'number' | 'object';
  onChange: (variants: Variant[]) => void;
  disabled?: boolean;
};

export type VariantItemProps = {
  variant: Variant;
  index: number;
  isValid: boolean;
  onUpdate: (index: number, variant: Variant) => void;
  onDelete: (index: number) => void;
  type: 'boolean' | 'string' | 'number' | 'object';
};
