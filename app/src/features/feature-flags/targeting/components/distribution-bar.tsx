import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type DistributionBarProps = {
  distribution: Record<string, number>;
};

// Monochrome palette for distribution segments. Fill and label travel together:
// the ramp's pale end cannot carry the white that its dark end needs, so each step
// names its own foreground. Keeping both utilities in one string is also what lets
// `scripts/check-token-contrast.mjs` see the pair and hold the ramp to AA.
const colors = [
  'bg-distribution-1 text-distribution-1-foreground',
  'bg-distribution-2 text-distribution-2-foreground',
  'bg-distribution-3 text-distribution-3-foreground',
  'bg-distribution-4 text-distribution-4-foreground',
  'bg-distribution-5 text-distribution-5-foreground',
];

export function DistributionBar({ distribution }: DistributionBarProps) {
  const entries = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((acc, [, p]) => acc + p, 0);

  return (
    <div className="w-full h-6 flex rounded-md overflow-hidden border border-border/50 shadow-xs">
      <TooltipProvider>
        {entries.map(([variant, percentage], index) => {
          // Skip 0% segments
          if (percentage === 0) return null;

          const colorClass = colors[index % colors.length];
          const width = `${(percentage / total) * 100}%`;

          return (
            <Tooltip key={variant}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'h-full flex items-center justify-center text-[10px] font-medium transition-all hover:brightness-95 cursor-default truncate px-1 border-r border-background/20 last:border-r-0',
                    colorClass,
                  )}
                  style={{ width }}
                >
                  {percentage >= 10 && (
                    <span className="truncate">
                      {variant}: {percentage}%
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="font-medium">{variant}</div>
                {/* A tooltip inverts the page (`bg-foreground`), so the usual
                    muted body colour is the wrong end of the scale here: it lands
                    at 2.69:1 light / 2.29:1 dark. Fading the tooltip's OWN
                    foreground is the subdued tone that actually belongs on it. */}
                <div className="text-xs text-background/75">
                  {percentage}% traffic
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </TooltipProvider>
    </div>
  );
}
