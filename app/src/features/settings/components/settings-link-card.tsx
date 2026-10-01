import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link, type LinkProps } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';

export type SettingsLinkCardProps = {
  buttonLabel: string;
  description: string;
  icon: LucideIcon;
  search?: LinkProps['search'];
  title: string;
  to: LinkProps['to'];
};

/** One settings entry: icon, title, blurb, and the button that goes there. */
export function SettingsLinkCard({
  buttonLabel,
  description,
  icon: Icon,
  search,
  title,
  to,
}: SettingsLinkCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Icon className="size-5 text-primary-subtle-foreground" />
            <div className="space-y-1">
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            nativeButton={false}
            role="link"
            render={
              <Link to={to} search={search}>
                {buttonLabel}
              </Link>
            }
          />
        </div>
      </CardHeader>
    </Card>
  );
}
