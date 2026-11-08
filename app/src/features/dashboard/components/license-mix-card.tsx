import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DashboardLicenseFamilyMix } from '@/api-client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

const VERSION_FILL: Record<string, string> = {
  default: 'bg-distribution-1 text-distribution-1-foreground',
  published: 'bg-distribution-3 text-distribution-3-foreground',
  archived: 'bg-distribution-4 text-distribution-4-foreground',
  draft: 'bg-distribution-5 text-distribution-5-foreground',
};

const fillOf = (version: DashboardLicenseFamilyMix['versions'][number]) =>
  version.lifecycleState === 'ARCHIVED'
    ? 'archived'
    : version.lifecycleState === 'DRAFT'
      ? 'draft'
      : version.isDefault
        ? 'default'
        : 'published';

/** Instances per License family and version, one stacked bar per family. */
export function LicenseMixCard({ mix }: { mix: DashboardLicenseFamilyMix[] }) {
  const { t } = useTranslation();
  const largest = Math.max(1, ...mix.map((family) => family.instances));

  return (
    <Card data-testid="dashboard-license-mix">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>{t('Pages.Dashboard.licenseMix.title')}</CardTitle>
          <CardDescription>
            {t('Pages.Dashboard.licenseMix.description')}
          </CardDescription>
        </div>
        <Link
          to="/catalog/licenses"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary-subtle-foreground"
        >
          {t('Pages.Dashboard.licenseMix.viewAll')}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {mix.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('Pages.Dashboard.licenseMix.empty')}
          </p>
        ) : (
          <ul className="space-y-4">
            {mix.map((family) => (
              <li
                key={family.familySlug}
                className="grid grid-cols-[7rem_minmax(0,1fr)_3rem] items-center gap-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{family.familySlug}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('Pages.Dashboard.licenseMix.instances', {
                      count: family.instances,
                    })}
                  </p>
                </div>
                <div className="flex h-6 gap-0.5 overflow-hidden rounded-md">
                  {family.versions
                    .filter((version) => version.instances > 0)
                    .map((version) => (
                      <span
                        key={version.slug}
                        className={cn(
                          'grid min-w-7 place-items-center truncate px-1 text-[11px] font-semibold',
                          VERSION_FILL[fillOf(version)],
                        )}
                        style={{ flex: version.instances }}
                        title={`${version.name} · v${version.version}`}
                      >
                        v{version.version} · {version.instances}
                      </span>
                    ))}
                  <span
                    className="bg-muted"
                    style={{ flex: Math.max(0, largest - family.instances) }}
                    aria-hidden
                  />
                </div>
                <span className="text-right text-sm tabular-nums text-muted-foreground">
                  {family.instances}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Legend
            className="bg-distribution-1"
            label={t('Pages.Dashboard.licenseMix.default')}
          />
          <Legend
            className="bg-distribution-4"
            label={t('Pages.Dashboard.licenseMix.archived')}
          />
          <Legend
            className="bg-distribution-5"
            label={t('Pages.Dashboard.licenseMix.draft')}
          />
        </p>
      </CardContent>
    </Card>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('size-2.5 rounded-sm', className)} aria-hidden />
      {label}
    </span>
  );
}
