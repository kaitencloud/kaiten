import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { SquarePlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CelContextNode } from '../types/cel-context.types';

interface RuleTemplate {
  labelKey: string;
  rule: string;
}

/**
 * The templates are derived from the served schema, not written here — the
 * hand-written example list this feature used to carry is how the console
 * ended up teaching a namespace that never existed. An entitlement template
 * only appears when the organization actually has an entitlement, and it
 * names a real slug.
 */
function templatesFor(roots: CelContextNode[]): RuleTemplate[] {
  const facts = roots.find((root) => root.name === '__kaiten');
  const entitlements = facts?.fields?.find(
    (field) => field.name === 'entitlements',
  );
  const slug = entitlements?.knownKeys?.[0];

  const templates: RuleTemplate[] = [];

  if (facts?.fields?.some((field) => field.name === 'deploymentZone')) {
    templates.push({
      labelKey: 'templateProductionZone',
      rule: "__kaiten.deploymentZone.type == 'production'",
    });
  }
  if (facts?.fields?.some((field) => field.name === 'instance')) {
    templates.push({
      labelKey: 'templateHealthyInstance',
      rule: "__kaiten.instance.status == 'HEALTHY'",
    });
  }
  if (slug) {
    templates.push(
      {
        labelKey: 'templateEntitlementNearLimit',
        rule: `__kaiten.entitlements['${slug}'].percentage >= 0.9`,
      },
      {
        labelKey: 'templateEntitlementExhausted',
        rule: `__kaiten.entitlements['${slug}'].remaining < 1`,
      },
    );
  }
  templates.push({
    labelKey: 'templateHostAttribute',
    rule: "user.cohort == 'beta'",
  });

  return templates;
}

/**
 * A starting point instead of a blank box: pick a shape, then edit the
 * details. Inserted into the rule (appended with && when one is already
 * there), never replacing what the author wrote.
 */
export function CelRuleTemplates({
  roots,
  onInsert,
}: {
  roots: CelContextNode[];
  onInsert: (rule: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const templates = templatesFor(roots);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground h-6 gap-1 px-1.5 text-xs"
        >
          <SquarePlus className="h-3.5 w-3.5" />
          {t('Functionals.CelEditor.templates')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1">
        <ul>
          {templates.map((template) => (
            <li key={template.labelKey}>
              <button
                type="button"
                className="hover:bg-accent w-full rounded px-2 py-1.5 text-left"
                onClick={() => {
                  onInsert(template.rule);
                  setOpen(false);
                }}
              >
                <span className="block text-sm">
                  {t(`Functionals.CelEditor.${template.labelKey}`)}
                </span>
                <code className="text-muted-foreground block truncate text-xs">
                  {template.rule}
                </code>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
