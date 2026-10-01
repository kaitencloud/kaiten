import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Plus, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFilterToolbarContext } from '../toolbar/filter-toolbar-provider';
import { RuleRow } from './filter-toolbar-rule-row';

export function AdvancedFiltersPopover() {
  const { t } = useTranslation();
  const {
    controller,
    labels: copy,
    advancedOpen,
    setAdvancedOpen,
  } = useFilterToolbarContext<unknown>();

  if (controller.advanced.rules.length === 0) {
    return null;
  }

  function renderRuleRow(rule: (typeof controller.advanced.rules)[number]) {
    return (
      <RuleRow
        key={rule.id}
        rule={rule}
        fields={controller.advanced.filterableFields}
        labels={copy}
        whereLabel={copy.where}
        onUpdate={(patch) => controller.advanced.updateRule(rule.id, patch)}
        onDelete={() => controller.advanced.removeRule(rule.id)}
      />
    );
  }

  return (
    <Popover open={advancedOpen} onOpenChange={setAdvancedOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9 rounded-full px-3"
          >
            {t('Common.rulesCount', {
              count: controller.advanced.ruleCount,
            })}
          </Button>
        }
      />
      <PopoverContent
        align="start"
        className="w-[min(92vw,760px)] space-y-3 p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">{copy.advancedFilterTitle}</p>
          <Select
            items={[
              { value: 'and', label: copy.and },
              { value: 'or', label: copy.or },
            ]}
            value={controller.advanced.combinator}
            onValueChange={(value) =>
              controller.advanced.setCombinator(value as 'and' | 'or')
            }
          >
            <SelectTrigger className="w-[90px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="and">{copy.and}</SelectItem>
              <SelectItem value="or">{copy.or}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          {controller.advanced.rules.map(renderRuleRow)}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => controller.advanced.addRule()}
          >
            <Plus className="size-4" />
            {copy.addRule}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              controller.advanced.clearRules();
              setAdvancedOpen(false);
            }}
          >
            <RotateCcw className="size-4" />
            {copy.clearRules}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
