import { buttonVariants } from '@/components/ui/button';
import { Link, type LinkProps } from '@tanstack/react-router';
import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type InstanceRelatedLinkProps = LinkProps & {
  children: ReactNode;
  className?: string;
};

export function InstanceRelatedLink({
  children,
  className,
  ...linkProps
}: InstanceRelatedLinkProps) {
  return (
    <Link
      {...linkProps}
      className={cn(
        buttonVariants({ size: 'sm', variant: 'link' }),
        'h-auto gap-1 px-0 font-medium',
        className,
      )}
    >
      <span>{children}</span>
      <ExternalLink className="size-3.5" />
    </Link>
  );
}
