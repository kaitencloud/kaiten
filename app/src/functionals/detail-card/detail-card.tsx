import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { ComponentProps, PropsWithChildren, ReactNode } from 'react';
import { Page } from '@/functionals/page';
import { cn } from '@/lib/utils';

type DetailCardRootProps = PropsWithChildren<{
  className?: string;
}>;

// A card is as tall as its content. A grid of cards aligns them at the top
// (`items-start`) and stacks short cards in one column next to a tall one,
// rather than stretching every card to the tallest and leaving a hole between
// its header and its rows.
const Root = ({ className, children }: DetailCardRootProps) => (
  <Card className={className}>{children}</Card>
);

type DetailCardHeaderProps = PropsWithChildren<{
  className?: string;
}>;

const Header = ({ className, children }: DetailCardHeaderProps) => (
  <CardHeader className={cn('pb-3', className)}>{children}</CardHeader>
);

// Header-level control (an action button, a menu). `CardHeader` switches to a
// two-column grid as soon as a `card-action` slot is present, so the title
// block keeps its width instead of being pushed around.
type DetailCardActionProps = PropsWithChildren<{
  className?: string;
}>;

const Action = ({ className, children }: DetailCardActionProps) => (
  <CardAction className={className}>{children}</CardAction>
);

type DetailCardTitleProps = PropsWithChildren<{
  className?: string;
}>;

const Title = ({ className, children }: DetailCardTitleProps) => (
  <CardTitle className={cn('text-lg', className)}>{children}</CardTitle>
);

type DetailCardDescriptionProps = PropsWithChildren<{
  className?: string;
}>;

const Description = ({ className, children }: DetailCardDescriptionProps) => (
  <CardDescription className={className}>{children}</CardDescription>
);

type DetailCardContentProps = PropsWithChildren<{
  className?: string;
}>;

const Content = ({ className, children }: DetailCardContentProps) => (
  <CardContent className={cn('flex flex-col gap-3', className)}>
    {children}
  </CardContent>
);

type DetailCardRowsProps = PropsWithChildren<{
  className?: string;
}>;

const Rows = ({ className, children }: DetailCardRowsProps) => (
  <div className={cn('grid gap-3', className)}>{children}</div>
);

// `center` suits a short value (a name, a badge, a date): it keeps its width
// and never wraps. Text that can run long (a description) takes `start`: the
// value shrinks and wraps with the label at its top, and a word too long for
// the line (a URL) breaks too, so it can neither overflow nor widen the card.
type DetailCardRowProps = {
  align?: 'center' | 'start';
  className?: string;
  label: ReactNode;
  labelClassName?: string;
  value: ReactNode;
  valueClassName?: string;
};

const Row = ({
  align = 'center',
  className,
  label,
  labelClassName,
  value,
  valueClassName,
}: DetailCardRowProps) => (
  <div
    className={cn(
      'flex justify-between gap-4',
      align === 'start' ? 'items-start' : 'items-center',
      className,
    )}
  >
    <span className={cn('text-sm text-muted-foreground', labelClassName)}>
      {label}
    </span>
    <div
      className={cn(
        'min-w-0 text-right text-sm font-medium',
        align === 'center' ? 'shrink-0' : 'wrap-anywhere',
        valueClassName,
      )}
    >
      {value}
    </div>
  </div>
);

type DetailCardDividerProps = Pick<
  ComponentProps<typeof Page.Divider>,
  'className'
>;

const Divider = ({ className }: DetailCardDividerProps) => (
  <Page.Divider className={cn('my-0', className)} />
);

export const DetailCard = Object.assign(Root, {
  Action,
  Header,
  Title,
  Description,
  Content,
  Rows,
  Row,
  Divider,
});
