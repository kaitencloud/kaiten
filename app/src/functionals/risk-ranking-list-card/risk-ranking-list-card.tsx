import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type RiskRankingListCardProps<TItem> = {
  description?: ReactNode;
  emptyLabel: ReactNode;
  formatRatio: (ratio: number | null) => ReactNode;
  getKey: (item: TItem) => string;
  getLabel: (item: TItem) => ReactNode;
  getRatio: (item: TItem) => number | null;
  isLoading: boolean;
  items: TItem[];
  loadingLabel: ReactNode;
  renderMeta?: (item: TItem) => ReactNode;
  title: ReactNode;
  widthMode?: 'percentage' | 'relative';
};

export function RiskRankingListCard<TItem>({
  description,
  emptyLabel,
  formatRatio,
  getKey,
  getLabel,
  getRatio,
  isLoading,
  items,
  loadingLabel,
  renderMeta,
  title,
  widthMode = 'percentage',
}: RiskRankingListCardProps<TItem>) {
  const maxRatio = Math.max(...items.map((item) => getRatio(item) ?? 0), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{loadingLabel}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          items.map((item) => {
            const ratio = getRatio(item) ?? 0;
            const width =
              widthMode === 'relative'
                ? Math.min(100, (ratio / maxRatio) * 100)
                : Math.min(100, ratio * 100);

            return (
              <div key={getKey(item)} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{getLabel(item)}</span>
                  <span
                    className={cn(
                      'font-medium',
                      ratio >= 1
                        ? 'text-destructive-subtle-foreground'
                        : 'text-warning-subtle-foreground',
                    )}
                  >
                    {formatRatio(ratio)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-2 rounded-full',
                      ratio >= 1 ? 'bg-destructive' : 'bg-warning',
                    )}
                    style={{ width: `${width}%` }}
                  />
                </div>
                {renderMeta ? (
                  <div className="text-xs text-muted-foreground">
                    {renderMeta(item)}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
