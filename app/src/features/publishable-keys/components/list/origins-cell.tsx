import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** How many origins a row shows before the rest are folded away behind a button. */
export const VISIBLE_ORIGINS = 3;

type OriginsCellProps = {
  origins: readonly string[];
};

/**
 * The origins a key may be sent from, one to a line. A key can hold fifty, so past
 * `VISIBLE_ORIGINS` the rest are folded away behind a button that says how many. A key
 * with none is not broken: no browser may send it, and a server that reads the catalogue
 * for a page it renders still can.
 */
export function OriginsCell({ origins }: OriginsCellProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (origins.length === 0) {
    return (
      <span className="text-sm text-muted-foreground">
        {t('Pages.Integrations.PublishableKeys.List.noOrigins')}
      </span>
    );
  }
  const shown = expanded ? origins : origins.slice(0, VISIBLE_ORIGINS);
  const hidden = origins.length - VISIBLE_ORIGINS;

  return (
    <div className="min-w-0 space-y-0.5">
      <ul className="space-y-0.5">
        {shown.map((origin) => (
          <li className="font-mono text-xs break-all" key={origin}>
            {origin}
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <Button
          aria-expanded={expanded}
          className="h-auto px-0 text-xs"
          data-row-actions
          onClick={() => setExpanded((current) => !current)}
          size="sm"
          type="button"
          variant="link"
        >
          {expanded
            ? t('Pages.Integrations.PublishableKeys.List.showFewer')
            : t('Pages.Integrations.PublishableKeys.List.showMore', {
                count: hidden,
              })}
        </Button>
      ) : null}
    </div>
  );
}
