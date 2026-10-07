import type { LucideIcon } from 'lucide-react';
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type SettingsCardHeaderProps = {
  description: string;
  icon: LucideIcon;
  title: string;
};

/**
 * The header of a card of the settings that is a section of a page and not a link
 * to one: the icon of what it is about, its title, and a line that says what it is
 * for.
 */
export function SettingsCardHeader({
  description,
  icon: Icon,
  title,
}: SettingsCardHeaderProps) {
  return (
    <CardHeader>
      <div className="flex items-start gap-3">
        <Icon className="size-5 shrink-0 text-primary-subtle-foreground" />
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </div>
    </CardHeader>
  );
}
