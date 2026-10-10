import { Building2, type LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useWebhooksServed } from '@/domains/webhooks';
import { API_SCOPE_PERMISSIONS } from '@/lib/api/scopes.gen';
import { dataModelIcons } from '@/lib/data-model-icons';
import { cn } from '@/lib/utils';
import type {
  AccessLevel,
  AccessLevels,
  AvailableResource,
  ResourceType,
  ScopeGroupId,
} from '../../types';
import { getAccessLevel } from '../../utils/access-levels';
import {
  AVAILABLE_RESOURCES,
  SCOPE_GROUP_IDS,
  SCOPES_I18N_PREFIX,
  WEBHOOKS_SCOPE_RESOURCE,
} from '../../utils/constants';

const LEVELS: AccessLevel[] = ['none', ...API_SCOPE_PERMISSIONS];

const GROUP_ICONS: Record<ScopeGroupId, LucideIcon> = {
  customers: dataModelIcons.customer,
  licensing: dataModelIcons.license,
  featureFlags: dataModelIcons.featureFlag,
  releases: dataModelIcons.release,
  billing: dataModelIcons.billing,
  organization: Building2,
};

// A ramp that reads down the column at a glance: neutral for no access, a
// tint for read, the solid colour for write. Not `accent` for no access: this
// theme's accent is a purple, which reads as access granted. The label keeps
// the foreground colour when selected, as on every toggle.
const LEVEL_ON_CLASSES: Record<AccessLevel, string> = {
  none: 'data-pressed:bg-foreground/10 data-pressed:text-foreground',
  read: 'data-pressed:bg-primary/20 data-pressed:text-foreground',
  write: 'data-pressed:bg-primary data-pressed:text-primary-foreground',
};

type ScopeAccessTableProps = {
  className?: string;
  levels: AccessLevels;
  onLevelChange: (resource: ResourceType, level: AccessLevel) => void;
};

type ScopeAccessRowProps = {
  resource: AvailableResource;
  level: AccessLevel;
  onLevelChange: ScopeAccessTableProps['onLevelChange'];
};

function ScopeAccessRow({
  resource,
  level,
  onLevelChange,
}: ScopeAccessRowProps) {
  const { t } = useTranslation();
  const label = t(resource.labelKey, { defaultValue: resource.fallbackLabel });

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {t(resource.descriptionKey, {
            defaultValue: resource.fallbackDescription,
          })}
        </p>
      </div>
      <ToggleGroup
        variant="outline"
        size="sm"
        className="shrink-0"
        value={[level]}
        // A single group empties when its item is pressed again; a
        // resource always has a level, so that press changes nothing.
        onValueChange={([value]) => {
          if (value) onLevelChange(resource.id, value as AccessLevel);
        }}
        aria-label={t(`${SCOPES_I18N_PREFIX}.levelsLabel`, { resource: label })}
      >
        {LEVELS.map((option) => (
          <ToggleGroupItem
            key={option}
            value={option}
            className={cn('px-3 text-xs', LEVEL_ON_CLASSES[option])}
          >
            {t(`${SCOPES_I18N_PREFIX}.Levels.${option}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </li>
  );
}

export function ScopeAccessTable({
  className,
  levels,
  onLevelChange,
}: ScopeAccessTableProps) {
  const { t } = useTranslation();
  // One id per instance: the dialog renders the same table while the inline
  // one is still in the page, hidden.
  const idPrefix = useId();
  const webhooksServed = useWebhooksServed();
  const labelOf = (resource: AvailableResource) =>
    t(resource.labelKey, { defaultValue: resource.fallbackLabel });
  // Left out while the answer is read, like the nav entry it goes with.
  const isOffered = (resource: AvailableResource) =>
    resource.id !== WEBHOOKS_SCOPE_RESOURCE || webhooksServed;

  // The border sits on the list, not on the scroller around it, so extra height
  // stays blank instead of stretching an empty box. overflow-clip rather than
  // hidden: hidden makes a scroll container, which would pin the sticky
  // headings to the list instead of the scroller.
  return (
    <div className={className}>
      <div className="divide-y overflow-clip rounded-md border">
        {SCOPE_GROUP_IDS.map((groupId) => {
          const resources = AVAILABLE_RESOURCES.filter(
            (resource) => resource.group === groupId && isOffered(resource),
          ).sort((a, b) => labelOf(a).localeCompare(labelOf(b)));
          if (resources.length === 0) return null;

          const GroupIcon = GROUP_ICONS[groupId];
          const headingId = `${idPrefix}-${groupId}`;

          return (
            <section key={groupId} aria-labelledby={headingId}>
              {/* Sticky within its section: the heading of the group being
                scrolled stays on top until the next one takes its place. */}
              <h3
                id={headingId}
                className="sticky top-0 z-10 flex items-center gap-2 bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground"
              >
                <GroupIcon className="size-4" aria-hidden />
                {t(`${SCOPES_I18N_PREFIX}.Groups.${groupId}.label`)}
              </h3>
              <ul className="divide-y">
                {resources.map((resource) => (
                  <ScopeAccessRow
                    key={resource.id}
                    resource={resource}
                    level={getAccessLevel(levels, resource.id)}
                    onLevelChange={onLevelChange}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
