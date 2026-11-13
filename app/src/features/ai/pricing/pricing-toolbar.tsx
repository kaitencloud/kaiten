import { Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PricingChip } from './pricing-chip';
import type { ModelStatusFilter } from './rate-card-model';

type PricingToolbarProps = {
  allCollapsed: boolean;
  modelCount: number;
  onQueryChange: (q: string) => void;
  onStatusChange: (status: ModelStatusFilter) => void;
  onToggleAllVendors: () => void;
  q: string;
  status: ModelStatusFilter;
  versionCount: number;
};

/** The filters of the rows: a search, the archived models, the vendor groups. */
export function PricingToolbar(props: PricingToolbarProps) {
  const { t } = useTranslation();
  // Typed text is the field's own: the URL follows it, and never rewrites it
  // under the cursor.
  const [q, setQ] = useState(props.q);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <InputGroup className="w-60 bg-card">
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          aria-label={t('AI.Pricing.toolbar.searchLabel')}
          onChange={(event) => {
            setQ(event.target.value);
            props.onQueryChange(event.target.value);
          }}
          placeholder={t('AI.Pricing.toolbar.search')}
          type="search"
          value={q}
        />
      </InputGroup>
      <ToggleGroup
        aria-label={t('AI.Pricing.toolbar.statusLabel')}
        onValueChange={(value) => {
          const next = value[0];
          if (next === 'active' || next === 'all') props.onStatusChange(next);
        }}
        size="sm"
        value={[props.status]}
        variant="outline"
      >
        <ToggleGroupItem value="all">
          {t('AI.Pricing.toolbar.allStatuses')}
        </ToggleGroupItem>
        <ToggleGroupItem value="active">
          {t('AI.Pricing.toolbar.hideArchived')}
        </ToggleGroupItem>
      </ToggleGroup>
      <Button
        onClick={props.onToggleAllVendors}
        size="sm"
        type="button"
        variant="ghost"
      >
        {t(
          props.allCollapsed
            ? 'AI.Pricing.toolbar.expand'
            : 'AI.Pricing.toolbar.collapse',
        )}
      </Button>
      <span className="text-xs text-muted-foreground" role="status">
        {t('AI.Pricing.toolbar.modelCount', { count: props.modelCount })} ·{' '}
        {t('AI.Pricing.toolbar.versionCount', { count: props.versionCount })}
      </span>
      <span className="ml-auto flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <PricingChip tone="accent">{t('AI.Pricing.cell.ownRule')}</PricingChip>
        {t('AI.Pricing.toolbar.legendOwn')} ·
        <PricingChip tone="neutral">{t('AI.Pricing.toolbar.via')}</PricingChip>
        {t('AI.Pricing.toolbar.legendVia')}
      </span>
    </div>
  );
}
