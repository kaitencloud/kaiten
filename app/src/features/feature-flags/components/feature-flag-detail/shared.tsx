import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FeatureFlag } from '@/api-client';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export const formatNumber = (value: number, locale: string) =>
  value.toLocaleString(locale);

export const toInlineJson = (value: unknown) => {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
};

export const toPrettyJson = (value: unknown) => JSON.stringify(value, null, 2);

export const getDefaultVariantTypeLabel = (
  defaultVariantType: FeatureFlag['default_variant']['type'],
  t: (key: string) => string,
) => {
  switch (defaultVariantType) {
    case 'basic':
      return t('Pages.FeatureFlags.Detail.defaultVariantTypes.basic');
    case 'rollout_date':
      return t('Pages.FeatureFlags.Detail.defaultVariantTypes.rolloutDate');
    case 'rollout_percentage':
      return t(
        'Pages.FeatureFlags.Detail.defaultVariantTypes.rolloutPercentage',
      );
    default:
      return defaultVariantType;
  }
};

export function DistributionBars({
  distribution,
}: {
  distribution: Record<string, number>;
}) {
  const entries = Object.entries(distribution).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-3">
      {entries.map(([variant, percentage]) => (
        <div key={variant} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">{variant}</span>
            <span className="text-muted-foreground">{percentage}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary"
              style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border p-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export function JsonContextDialog({
  context,
  evaluationId,
}: {
  context: Record<string, unknown>;
  evaluationId: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 min-w-9 px-2 font-mono text-xs"
          onClick={(event) => event.stopPropagation()}
        >
          {t('Pages.FeatureFlags.Detail.Evaluation.contextDialog.trigger')}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>
            {t('Pages.FeatureFlags.Detail.Evaluation.contextDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Pages.FeatureFlags.Detail.Evaluation.contextDialog.description',
              {
                evaluationId,
              },
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-4 text-xs">
            {JSON.stringify(context, null, 2)}
          </pre>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
