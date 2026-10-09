import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type SettingsCardHeaderProps = {
  /** What the section lets a person do from its header, such as a button. */
  action?: ReactNode;
  description: string;
  icon: LucideIcon;
  title: string;
};

/**
 * The header of a card of the settings that is a section of a page and not a link
 * to one: the icon of what it is about, its title, and a line that says what it is
 * for, and at its end the action of the section when it has one.
 */
export function SettingsCardHeader({
  action,
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
      {action ? <CardAction>{action}</CardAction> : null}
    </CardHeader>
  );
}
