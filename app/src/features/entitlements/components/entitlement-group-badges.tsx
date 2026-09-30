import { Badge } from '@/components/ui/badge';

export type EntitlementGroupBadgeValue = {
  name: string;
  slug: string;
};

type EntitlementGroupBadgesProps = {
  emptyLabel?: string;
  groups: EntitlementGroupBadgeValue[];
  maxVisible?: number;
};

export function EntitlementGroupBadges({
  emptyLabel = '-',
  groups,
  maxVisible = 3,
}: EntitlementGroupBadgesProps) {
  if (groups.length === 0) {
    return <span className="text-muted-foreground">{emptyLabel}</span>;
  }

  const visibleGroups = groups.slice(0, maxVisible);
  const remainingCount = groups.length - visibleGroups.length;

  return (
    <div className="flex flex-wrap gap-1">
      {visibleGroups.map((group) => (
        <Badge key={group.slug} variant="outline" className="text-xs">
          {group.name}
        </Badge>
      ))}
      {remainingCount > 0 ? (
        <Badge variant="outline" className="text-xs">
          +{remainingCount}
        </Badge>
      ) : null}
    </div>
  );
}
