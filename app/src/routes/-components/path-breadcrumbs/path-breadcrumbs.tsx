import { ChevronLeft } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Link,
  useMatches,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import { Fragment, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  type BreadcrumbItemData,
  type BreadcrumbMatch,
  formatDocumentTitle,
  getBreadcrumbItems,
  isNotFoundPage,
} from './breadcrumb-items';

function BreadcrumbCrumb({
  item,
  isCurrent,
}: {
  item: BreadcrumbItemData;
  isCurrent: boolean;
}) {
  if (isCurrent) {
    return <BreadcrumbPage>{item.label}</BreadcrumbPage>;
  }

  if (!item.isLink) {
    return <span>{item.label}</span>;
  }

  return <BreadcrumbLink render={<Link to={item.href}>{item.label}</Link>} />;
}

export const PathBreadcrumbs = () => {
  const { t } = useTranslation();
  const matches = useMatches() as BreadcrumbMatch[];
  const { routesByPath } = useRouter();
  const locationPathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const resolvedPathname = useRouterState({
    select: (state) => state.resolvedLocation?.pathname,
  });

  const breadcrumbsItems = useMemo(
    () => getBreadcrumbItems(matches, routesByPath, t),
    [matches, routesByPath, t],
  );

  // The trail already names the page: the browser tab says the same.
  const documentTitle = isNotFoundPage(matches, [
    locationPathname,
    resolvedPathname,
  ])
    ? formatDocumentTitle([t('Errors.notFound')])
    : formatDocumentTitle(breadcrumbsItems.map(({ label }) => label));

  useEffect(() => {
    document.title = documentTitle;
  }, [documentTitle]);

  // Below md the trail is hidden; the parent alone still fits, as a way back.
  const isMobile = useIsMobile();
  const parentItem =
    isMobile && breadcrumbsItems.length > 1
      ? breadcrumbsItems[breadcrumbsItems.length - 2]
      : null;

  return breadcrumbsItems.length > 0 ? (
    <>
      {parentItem?.isLink ? (
        <Link
          to={parentItem.href}
          className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground md:hidden"
        >
          <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{parentItem.label}</span>
        </Link>
      ) : null}
      <Breadcrumb className="hidden md:flex">
        <BreadcrumbList>
          {breadcrumbsItems.map((item, index) => {
            const isLastItem = index === breadcrumbsItems.length - 1;

            return (
              <Fragment key={item.href}>
                <BreadcrumbItem>
                  <BreadcrumbCrumb item={item} isCurrent={isLastItem} />
                </BreadcrumbItem>
                {!isLastItem && <BreadcrumbSeparator />}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </>
  ) : null;
};
