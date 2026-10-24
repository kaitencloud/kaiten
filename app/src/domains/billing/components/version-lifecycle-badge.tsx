import { Badge } from '@/components/ui/badge';
import type { VersionLifecycleState } from '../logic';

const BADGE_VARIANT = {
  // Withdrawn from sale: what holds it keeps it, nothing new resolves to it.
  ARCHIVED: 'secondary',
  // Being prepared: addressable by its own slug, never served by the family.
  DRAFT: 'outline',
  // Live: the only state a family resolves to, and the only one its default may be in.
  PUBLISHED: 'success',
} as const satisfies Record<
  VersionLifecycleState,
  'outline' | 'secondary' | 'success'
>;

type VersionLifecycleBadgeProps = {
  className?: string;
  /** The state said in the words of the feature that shows it. */
  label: string;
  state: VersionLifecycleState;
};

/** The lifecycle state of a version of a license or of an add-on: a tone and a word. */
export function VersionLifecycleBadge({
  className,
  label,
  state,
}: VersionLifecycleBadgeProps) {
  return (
    <Badge className={className} variant={BADGE_VARIANT[state]}>
      {label}
    </Badge>
  );
}
