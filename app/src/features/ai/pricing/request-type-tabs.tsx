import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AiRequestType } from './engine';
import { formatCount } from './pricing-format';
import { usePricingLabels } from './use-pricing-labels';

type RequestTypeTabsProps = {
  onChange: (type: AiRequestType) => void;
  tabs: readonly { type: AiRequestType; count: number }[];
  type: AiRequestType;
};

/**
 * One tab per request type a model of the catalogue takes, with the number of
 * models under it. The server prices any type for any model: the tabs only
 * leave out what no model would be called for.
 */
export function RequestTypeTabs({
  onChange,
  tabs,
  type,
}: RequestTypeTabsProps) {
  const { t } = useTranslation();
  const labels = usePricingLabels();

  function renderTab(tab: { type: AiRequestType; count: number }) {
    return (
      <TabsTrigger className="gap-1.5" key={tab.type} value={tab.type}>
        {labels.typeLabel(tab.type)}
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatCount(tab.count)}
        </span>
      </TabsTrigger>
    );
  }

  return (
    <Tabs
      onValueChange={(value) => onChange(value as AiRequestType)}
      value={type}
    >
      <TabsList
        aria-label={t('AI.Pricing.types.tabs')}
        className="w-full max-w-full overflow-x-auto"
        variant="line"
      >
        {tabs.map(renderTab)}
      </TabsList>
    </Tabs>
  );
}
