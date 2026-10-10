import { useQuery } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { billingCapabilitiesQueryOptions } from '@/domains/billing';
import { cn } from '@/lib/utils';
import { useExportUsageChunk } from '../hooks/use-export-usage-chunk';
import {
  DEFAULT_CHUNK_MONTHS,
  getUsageChunks,
  type UsageChunk,
} from '../utils/usage-chunks';

// Beyond this many months the list scrolls inside its own box instead of
// stretching the page.
const MONTHS_BEFORE_SCROLLING = 6;

const formats = new Map<string, Intl.DateTimeFormat>();

// One formatter for the whole list, since building one is the costly part.
function monthFormat(locale: string) {
  let format = formats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, {
      month: 'long',
      timeZone: 'UTC',
      year: 'numeric',
    });
    formats.set(locale, format);
  }

  return format;
}

/**
 * The usage reports of every instance, a month to a file: the API reads 31 days
 * at most in one export, so the months the organization keeps are listed, newest
 * first, each with its own download. How many are listed is how many months the
 * deployment says it keeps; when it does not say, two years. The retention is read
 * from the capabilities as they are, billing on or off: usage is not billing's.
 */
export function UsageExport() {
  const { i18n, t } = useTranslation();
  const { data } = useQuery(billingCapabilitiesQueryOptions);
  const months = data?.usageHistoryRetentionMonths;
  const exporting = useExportUsageChunk();
  const chunks = getUsageChunks(months ?? DEFAULT_CHUNK_MONTHS);
  const format = monthFormat(i18n.language);

  function renderChunk(chunk: UsageChunk) {
    const isPending =
      exporting.isPending && exporting.variables?.key === chunk.key;
    const month = format.format(new Date(chunk.from));

    return (
      <li
        className="flex items-center justify-between gap-3 px-3 py-2"
        key={chunk.key}
      >
        <span className="text-sm">{month}</span>
        <Button
          aria-label={t('Pages.Settings.DataExport.Usage.exportMonth', {
            month,
          })}
          disabled={exporting.isPending}
          onClick={() => exporting.mutate(chunk)}
          size="sm"
          type="button"
          variant="outline"
        >
          {isPending ? <Loader2 className="animate-spin" /> : <Download />}
          {t('Pages.Settings.DataExport.Usage.export')}
        </Button>
      </li>
    );
  }

  return (
    <div className="space-y-3" data-testid="usage-export">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">
          {t('Pages.Settings.DataExport.Usage.title')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {months === undefined || months === null
            ? t('Pages.Settings.DataExport.Usage.descriptionUnknown', {
                count: DEFAULT_CHUNK_MONTHS,
              })
            : t('Pages.Settings.DataExport.Usage.description', {
                count: months,
              })}
        </p>
      </div>
      <ScrollArea
        className={cn(
          'rounded-md border',
          chunks.length > MONTHS_BEFORE_SCROLLING && 'h-72',
        )}
      >
        <ul
          aria-label={t('Pages.Settings.DataExport.Usage.list')}
          className="divide-y"
        >
          {chunks.map(renderChunk)}
        </ul>
      </ScrollArea>
    </div>
  );
}
