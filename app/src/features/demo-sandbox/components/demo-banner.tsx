import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { ArrowRight, FlaskConical, LoaderCircle } from 'lucide-react';
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
    <div className="px-4 sm:px-6">
      <div
        role="status"
        className="border-warning/30 bg-warning-subtle text-warning-subtle-foreground flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-b-md border-x border-b px-2 py-1 text-sm"
      >
        <div className="flex items-center gap-2.5">
          <span className="bg-warning/15 flex size-6 shrink-0 items-center justify-center rounded-full">
            <FlaskConical className="size-3.5" />
          </span>
          <span className="font-medium">
            {t('Features.DemoSandbox.Banner.warning')}
          </span>
        </div>

        {isSeeding && (
          <span className="flex items-center gap-2">
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
            className="text-warning-subtle-foreground group h-auto gap-1 p-0 font-medium underline-offset-4"
            nativeButton={false}
            role="link"
            render={
              <Link to="/settings">
                {t('Features.DemoSandbox.Banner.manageLink')}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}
