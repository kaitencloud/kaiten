import type { PropsWithChildren, ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type ChartShellProps = PropsWithChildren<{
  className?: string;
  contentClassName?: string;
  description?: string;
  headerActions?: ReactNode;
  title: string;
  titleIcon?: ReactNode;
}>;

function ChartShellHeader({
  title,
  description,
  headerActions,
  titleIcon,
}: {
  title: string;
  description?: string;
  headerActions?: ReactNode;
  titleIcon?: ReactNode;
}) {
  const titleBlock = (
    <div className="flex items-start gap-3">
      {titleIcon ? (
        <span
          className="text-primary-subtle-foreground mt-0.5 shrink-0 [&_svg]:size-5"
          aria-hidden
        >
          {titleIcon}
        </span>
      ) : null}
      <div className="min-w-0">
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </div>
    </div>
  );

  if (headerActions) {
    return (
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {titleBlock}
          {headerActions}
        </div>
      </CardHeader>
    );
  }

  return (
    <CardHeader className="pb-2">
      {titleBlock}
    </CardHeader>
  );
}

export const ChartShell = ({
  children,
  className,
  contentClassName,
  description,
  headerActions,
  title,
  titleIcon,
}: ChartShellProps) => {
  return (
    <Card className={cn('flex h-full flex-col', className)}>
      <ChartShellHeader
        title={title}
        description={description}
        headerActions={headerActions}
        titleIcon={titleIcon}
      />
      <CardContent className={cn('flex-1', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
};
