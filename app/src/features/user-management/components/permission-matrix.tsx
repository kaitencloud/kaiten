import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  permissionLevel,
  permissionResources,
  changePermissionLevel,
  type AccessLevel,
} from '../access-helpers';

export function PermissionMatrix({
  permissions,
  available,
  onChange,
  disabled = false,
}: {
  permissions: string[];
  available: string[];
  onChange: (permissions: string[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  function renderResource(resource: string) {
    const label = t(`Pages.Access.resources.${resource}`);
    const level = permissionLevel(permissions, resource);
    function renderLevel(option: AccessLevel) {
      const offered =
        option === 'none' || available.includes(`${option}:${resource}`);
      return (
        <ToggleGroupItem
          key={option}
          value={option}
          disabled={disabled || !offered}
          className={`px-3 text-xs pointer-coarse:min-h-11 pointer-coarse:min-w-11 ${option === 'none' ? 'data-pressed:bg-foreground/10' : option === 'read' ? 'data-pressed:bg-primary/20' : 'data-pressed:bg-primary data-pressed:text-primary-foreground'}`}
        >
          {t(`Pages.Access.levels.${option}`)}
        </ToggleGroupItem>
      );
    }
    return (
      <li
        key={resource}
        className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
      >
        <span className="text-sm font-medium">{label}</span>
        <ToggleGroup
          size="sm"
          variant="outline"
          value={[level]}
          aria-label={t('Pages.Access.resourceAccess', { resource: label })}
          onValueChange={([value]) =>
            value &&
            onChange(
              changePermissionLevel(
                permissions,
                resource,
                value as AccessLevel,
                available,
              ),
            )
          }
        >
          {(['none', 'read', 'write'] as const).map(renderLevel)}
        </ToggleGroup>
      </li>
    );
  }
  return (
    <ul className="divide-y rounded-md border">
      {permissionResources(available).map(renderResource)}
    </ul>
  );
}
