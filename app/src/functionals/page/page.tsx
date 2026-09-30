import type {
  ComponentProps,
  ComponentType,
  PropsWithChildren,
  ReactNode,
} from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type Size = 'sm' | 'md' | 'lg' | 'xl';

// Horizontal page gutter. In the `scroll` layout it moves from the root to
// each section (Fixed, Scroll content) so the scroll container can reach the
// page's right edge — the overlay scrollbar then sits at the page boundary
// instead of against the content. See docs/03-patterns/page-scrolling.md.
const PAGE_GUTTER = 'px-4 sm:px-6';

const iconSizeClass: Record<Size, string> = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
  xl: 'size-8',
};

const titleSizeClass: Record<Size, string> = {
  sm: 'text-base font-semibold',
  md: 'text-lg font-semibold',
  lg: 'text-2xl font-bold tracking-tight',
  xl: 'text-3xl font-bold tracking-tight',
};

const subtitleSizeClass: Record<Size, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-sm',
  xl: 'text-sm',
};

type PageLayout = 'default' | 'scroll';

const Root = ({
  className,
  layout = 'default',
  children,
}: PropsWithChildren<{ className?: string; layout?: PageLayout }>) => (
  <div
    className={cn(
      'flex flex-col',
      layout === 'scroll' ? 'h-full min-h-0 overflow-hidden' : PAGE_GUTTER,
      className,
    )}
  >
    {children}
  </div>
);

/** Fixed section of a `layout="scroll"` page — carries the page gutter. */
const Fixed = ({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) => (
  <div className={cn('shrink-0', PAGE_GUTTER, className)}>{children}</div>
);

/**
 * Scrollable body of a `layout="scroll"` page: a full-bleed ScrollArea whose
 * overlay scrollbar sits at the page's right edge; the page gutter is applied
 * to the inner content so it stays aligned with the fixed sections.
 */
const Scroll = ({
  className,
  contentClassName,
  children,
}: PropsWithChildren<{ className?: string; contentClassName?: string }>) => (
  <ScrollArea className={cn('min-h-0 flex-1', className)}>
    <div className={cn('pb-4', PAGE_GUTTER, contentClassName)}>{children}</div>
  </ScrollArea>
);

// Title and actions share a row from `sm`; below, the actions go under the
// title so a long name never pushes a button out of the viewport.
const Header = ({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) => (
  <section
    className={cn(
      'flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between',
      className,
    )}
  >
    {children}
  </section>
);

const Leading = ({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) => (
  <div className={cn('flex items-start gap-3 min-w-0', className)}>
    {children}
  </div>
);

const Icon = ({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) => (
  <div className={cn('pt-0.5 shrink-0', className)}>{children}</div>
);

const Heading = ({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) => (
  <div className={cn('space-y-1 min-w-0', className)}>{children}</div>
);

const TitleRow = ({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) => (
  <div className={cn('flex items-center gap-3 flex-wrap', className)}>
    {children}
  </div>
);

const Title = ({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) => (
  <h1 className={cn('text-3xl font-bold tracking-tight', className)}>
    {children}
  </h1>
);

const Subtitle = ({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) => (
  <p className={cn('text-muted-foreground text-sm', className)}>{children}</p>
);

const Actions = ({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) => (
  <div className={cn('shrink-0 max-w-full', className)}>{children}</div>
);

const Divider = (props: ComponentProps<'hr'>) => (
  <hr className={cn('border-border', props.className)} />
);

type IconHeadingProps = {
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  subtitle?: ReactNode;
  size?: Size;
  className?: string;
  iconClassName?: string;
};

const IconHeading = ({
  icon: IconComponent,
  title,
  subtitle,
  size = 'xl',
  className,
  iconClassName,
}: IconHeadingProps) => {
  // At page size the heading IS the page title: the customer pages were the
  // only ones without an h1.
  const TitleTag = size === 'xl' ? 'h1' : 'p';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <IconComponent
        className={cn(
          'shrink-0 text-primary-subtle-foreground',
          iconSizeClass[size],
          iconClassName,
        )}
      />
      <div className="min-w-0">
        <TitleTag className={cn(titleSizeClass[size])}>{title}</TitleTag>
        {subtitle && (
          <p className={cn('text-muted-foreground', subtitleSizeClass[size])}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
};

export const Page = Object.assign(Root, {
  Header,
  Leading,
  Icon,
  Heading,
  TitleRow,
  Title,
  Subtitle,
  Actions,
  Divider,
  IconHeading,
  Fixed,
  Scroll,
});
