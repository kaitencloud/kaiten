import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { FlaskConical, LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDemoStatus } from '../hooks/use-demo-status';
import { useSeedDemoData } from '../hooks/use-seed-demo';

// Global, self-hiding warning strip for demo/sandbox organizations. Offers to
// seed demo data the first time, then points to Settings for reseeding once
// the sandbox already has data.
export function DemoBanner() {
  const { t } = useTranslation();
  const { data } = useDemoStatus();
  const seedDemoData = useSeedDemoData();

  if (!data?.is_demo) {
    return null;
  }

  const isSeeding = data.seeding || seedDemoData.isPending;

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3 border-warning/30 bg-warning-subtle text-warning-subtle-foreground border-b px-4 py-2 text-sm sm:px-6">
      <div className="flex items-center gap-2">
        <FlaskConical className="size-4 shrink-0" />
        <span>{t('Features.DemoSandbox.Banner.warning')}</span>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {isSeeding && (
          <span className="text-warning-subtle-foreground flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" />
            {t('Features.DemoSandbox.Banner.seedingProgress')}
          </span>
        )}
        {!isSeeding && !data.seeded && (
          <Button
            size="sm"
            onClick={() => seedDemoData.mutate()}
            disabled={seedDemoData.isPending}
          >
            {t('Features.DemoSandbox.Banner.seedButton')}
          </Button>
        )}
        {!isSeeding && data.seeded && (
          <Button
            variant="link"
            size="sm"
            className="text-warning-subtle-foreground h-auto p-0 underline"
            nativeButton={false}
            role="link"
            render={
              <Link to="/settings">
                {t('Features.DemoSandbox.Banner.manageLink')}
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}
