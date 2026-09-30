import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Link, useRouterState } from '@tanstack/react-router';
import { ArrowLeft, SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getSectionForPath } from '@/lib/navigation/segment-labels';

// Shown for a URL that matches no route, and for a route whose entity the API
// reports as missing (an unknown slug). The way out is the section the URL
// was reaching for, or home when it names no section.
export function NotFound() {
  const { t } = useTranslation();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const section = getSectionForPath(pathname, t);

  return (
    <div className="flex min-h-[400px] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <SearchX className="size-5 text-muted-foreground" />
            <CardTitle>{t('Errors.notFound', 'Page not found')}</CardTitle>
          </div>
          <CardDescription>
            {t(
              'Errors.notFoundDescription',
              "The page you're looking for doesn't exist.",
            )}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="outline">
            <Link to={section?.href ?? '/'}>
              <ArrowLeft className="size-4" />
              {section
                ? t('Errors.backTo', { section: section.label })
                : t('Errors.goHome', 'Go Home')}
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
