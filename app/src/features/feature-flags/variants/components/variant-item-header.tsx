import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';
import type { Variant } from '../types';

type VariantItemHeaderProps = {
  variant: Variant;
  isValid: boolean;
  type: 'boolean' | 'string' | 'number' | 'object';
};

export function VariantItemHeader({
  variant,
  isValid,
  type,
}: VariantItemHeaderProps) {
  const getValueBadge = () => {
    if (
      variant.value === undefined ||
      variant.value === null ||
      variant.value === '' || // Check for empty string
      type === 'object'
    ) {
      return null;
    }
    if (type === 'boolean') {
      return <Badge variant="outline">{String(variant.value)}</Badge>;
    }
    return (
      <Badge variant="outline" className="font-mono text-xs">
        {String(variant.value)}
      </Badge>
    );
  };

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="font-semibold truncate">{variant.name}</span>
        {getValueBadge()}
      </div>

      {/* Validation status (shown only when invalid) */}
      {!isValid && (
        <div className="flex items-center gap-1 text-destructive-subtle-foreground">
          <AlertCircle className="h-4 w-4" />
          <span className="text-xs font-medium">Invalid</span>
        </div>
      )}
    </div>
  );
}
