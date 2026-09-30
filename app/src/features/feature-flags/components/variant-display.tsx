import { Badge } from '@/components/ui/badge';
import type { Variant } from '@/api-client';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type VariantDisplayProps = {
  variant: Variant;
  type?: string;
};

export function VariantDisplay({ variant, type }: VariantDisplayProps) {
  const displayValue = () => {
    if (typeof variant.value === 'boolean') {
      return variant.value ? 'true' : 'false';
    }
    if (typeof variant.value === 'object') {
      return 'Object';
    }
    return String(variant.value);
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="cursor-help">
            {variant.name}: {displayValue()}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="font-semibold">{variant.name}</p>
            {variant.description && (
              <p className="text-sm text-muted-foreground">
                {variant.description}
              </p>
            )}
            {type && (
              <p className="text-xs">
                Type: <span className="font-mono">{type}</span>
              </p>
            )}
            <p className="text-xs font-mono break-all">
              value: {JSON.stringify(variant.value)}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

type VariantsListDisplayProps = {
  variants: Variant[] | null;
  type?: string;
};

export function VariantsListDisplay({
  variants,
  type,
}: VariantsListDisplayProps) {
  if (!variants || variants.length === 0) {
    return <span className="text-sm text-muted-foreground">No variants</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {variants.map((variant) => (
        <VariantDisplay key={variant.name} variant={variant} type={type} />
      ))}
    </div>
  );
}
