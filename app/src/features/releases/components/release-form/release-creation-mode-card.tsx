import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type ReleaseCreationModeCardProps = {
  description: string;
  Icon: LucideIcon;
  isSelected: boolean;
  onClick: () => void;
  title: string;
};

export function ReleaseCreationModeCard({
  description,
  Icon,
  isSelected,
  onClick,
  title,
}: ReleaseCreationModeCardProps) {
  return (
    <button
      type="button"
      className="w-full text-left"
      onClick={onClick}
      aria-pressed={isSelected}
    >
      <Card
        className={cn(
          'h-full border-border/60 transition-colors hover:border-primary/50',
          isSelected && 'border-primary bg-primary/5',
        )}
      >
        <CardHeader className="gap-4 pb-0">
          <div
            className={cn(
              'flex size-11 items-center justify-center rounded-md border border-border/70 bg-muted/40',
              isSelected &&
                'border-primary/50 bg-primary-subtle text-primary-subtle-foreground',
            )}
          >
            <Icon className="size-5" />
          </div>
          <CardTitle className="text-base leading-snug">{title}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </button>
  );
}
