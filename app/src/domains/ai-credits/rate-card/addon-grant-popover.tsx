import { useTranslation } from 'react-i18next';
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { AddonGrantDetails } from './addon-grant-details';
import { type AddonGrantsState, addonNamesOf } from './use-addon-grants';

const CHIP =
  'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-left text-[0.6875rem] font-medium underline decoration-dotted underline-offset-2 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none';

/** "Through add-on", with the names of the add-ons once they are read. */
export function addonGrantLabel(
  state: AddonGrantsState | undefined,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  const names = addonNamesOf(state);

  return names.length
    ? t('AI.Pool.addons.throughNamed', { names: names.join(', ') })
    : t('AI.Pool.addons.through');
}

type AddonGrantPopoverProps = {
  /** The licence itself grants the pool too: the chip is the short "+ add-on". */
  also?: boolean;
  poolName: string;
  state: AddonGrantsState | undefined;
  /** The licence version the chip sits on, for its accessible description. */
  versionName: string;
};

/**
 * Says that an add-on can grant a pool on a licence version's family, and
 * opens what is known of it: the add-on versions, or why they cannot be
 * listed. It never says the version grants the pool: an add-on is held by an
 * instance, not by a licence.
 */
export function AddonGrantPopover({
  also = false,
  poolName,
  state,
  versionName,
}: AddonGrantPopoverProps) {
  const { t } = useTranslation();

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            // The visible words are the name; what the chip opens is said after it.
            aria-description={t('AI.Pool.addons.details', {
              version: versionName,
            })}
            className={cn(
              CHIP,
              also
                ? 'border-border bg-transparent text-foreground'
                : 'border-transparent bg-accent text-accent-foreground',
            )}
            type="button"
          />
        }
      >
        {also ? t('AI.Pool.addons.alsoThrough') : addonGrantLabel(state, t)}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-96 max-w-[calc(100vw-2rem)] font-normal"
      >
        <PopoverHeader className="mb-2">
          <PopoverTitle>{t('AI.Pool.addons.title')}</PopoverTitle>
        </PopoverHeader>
        <AddonGrantDetails
          poolName={poolName}
          state={state ?? { status: 'PENDING' }}
        />
      </PopoverContent>
    </Popover>
  );
}
