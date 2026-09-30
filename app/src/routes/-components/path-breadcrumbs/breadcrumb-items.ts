import type { TFunction } from 'i18next';
import { isNotFoundError } from '@/lib/errors';
import { getSegmentLabel } from '@/lib/navigation/segment-labels';

const APP_NAME = 'Kaiten';

export type BreadcrumbMatch = {
  pathname: string;
  // The route's own path: `$param` where the URL holds a value.
  fullPath?: string;
  status?: string;
  error?: unknown;
  context: { getTitle?: () => string };
};

export type BreadcrumbItemData = {
  href: string;
  label: string;
  // False when no route answers at this path, like the `$zoneSlug` level of
  // `/releases/deployment-zones/$zoneSlug/deploy`: the crumb reads as text
  // instead of linking to "Page not found".
  isLink: boolean;
};

type Crumb = {
  href: string;
  segment: string;
  isParam: boolean;
  isLink: boolean;
  title?: string;
};

const splitPath = (path: string) => path.split('/').filter(Boolean);

// A route inherits its parent's context, so only a `getTitle` a route set
// itself names its path. A layout route and its index share one pathname and
// one `getTitle`, and the index must not erase the layout's title.
function collectTitles(matches: BreadcrumbMatch[]): Map<string, string> {
  const titles = new Map<string, string>();

  matches.forEach((match, index) => {
    const getTitle = match.context.getTitle;

    if (getTitle && getTitle !== matches[index - 1]?.context.getTitle) {
      titles.set(`/${splitPath(match.pathname).join('/')}`, getTitle());
    }
  });

  return titles;
}

export function getBreadcrumbItems(
  matches: BreadcrumbMatch[],
  routesByPath: object,
  t: TFunction,
): BreadcrumbItemData[] {
  const currentMatch = matches[matches.length - 1];
  if (!currentMatch || currentMatch.pathname === '/') {
    return [];
  }

  const titles = collectTitles(matches);
  const pathSegments = splitPath(currentMatch.pathname);
  const routeSegments = splitPath(currentMatch.fullPath ?? '');
  // Without the route's own path to line up with, every segment is taken at
  // face value.
  const hasRoutePath = routeSegments.length === pathSegments.length;

  const crumbs: Crumb[] = pathSegments.map((segment, index) => {
    const href = `/${pathSegments.slice(0, index + 1).join('/')}`;
    const routePath = `/${routeSegments.slice(0, index + 1).join('/')}`;

    return {
      href,
      segment,
      isParam: hasRoutePath && routeSegments[index]?.startsWith('$') === true,
      isLink: !hasRoutePath || routePath in routesByPath,
      title: titles.get(href),
    };
  });

  // A dialog route over a list (`/releases/deployment-zones/$zoneSlug/edit`)
  // titles its leaf with the entity's name and leaves the `$param` level
  // untitled. The name belongs to that level; the leaf keeps its action.
  //
  // The leaf can sit past a level with no route of its own, like `tokens` in
  // `/integrations/service-accounts/$serviceAccountSlug/tokens/new`: that level
  // names a collection, not a page, so the title is looked for beyond it.
  crumbs.forEach((crumb, index) => {
    if (!crumb.isParam || crumb.title) {
      return;
    }

    const owner = crumbs
      .slice(index + 1)
      .find((next) => next.title || next.isParam || next.isLink);

    if (owner?.title && !owner.isParam) {
      crumb.title = owner.title;
      owner.title = undefined;
    }
  });

  return crumbs.map(({ href, segment, isParam, isLink, title }) => ({
    href,
    isLink,
    // An untitled `$param` shows the URL's value as is: capitalized, a slug
    // would pass for a name.
    label: title ?? (isParam ? segment : getSegmentLabel(segment, t)),
  }));
}

/**
 * A URL no route answers leaves the deepest match short of it (`/` alone for
 * `/nope`); a route whose entity the API does not know fails with a 404.
 *
 * Mid-navigation the rendered matches trail the location, and the resolved
 * location trails the matches for one commit: a page is unmatched only when
 * its matches cover neither.
 */
export function isNotFoundPage(
  matches: BreadcrumbMatch[],
  locationPathnames: Array<string | undefined>,
): boolean {
  const currentMatch = matches[matches.length - 1];
  const coveredPath = currentMatch
    ? splitPath(currentMatch.pathname).join('/')
    : undefined;
  const isUnmatched =
    coveredPath !== undefined &&
    !locationPathnames.some(
      (pathname) =>
        pathname !== undefined && splitPath(pathname).join('/') === coveredPath,
    );

  return (
    isUnmatched ||
    matches.some(
      (match) =>
        match.status === 'notFound' ||
        (match.status === 'error' && isNotFoundError(match.error)),
    )
  );
}

/** The tab title reads like the trail, most specific first. */
export function formatDocumentTitle(labels: string[]): string {
  return [...labels].reverse().concat(APP_NAME).join(' · ');
}
