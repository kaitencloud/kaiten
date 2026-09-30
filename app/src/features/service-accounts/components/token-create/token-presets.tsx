import { CircleCheck, Circle } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { API_SCOPE_PERMISSIONS } from '@/lib/api/scopes.gen';
import { cn } from '@/lib/utils';
import type { AccessLevels, TokenPresetId } from '../../types';
import {
  applyPreset,
  includesPreset,
  removePreset,
} from '../../utils/access-levels';
import {
  AVAILABLE_RESOURCES,
  SCOPES_I18N_PREFIX,
  TOKEN_PRESET_IDS,
  TOKEN_PRESETS,
} from '../../utils/constants';

type TokenPresetsProps = {
  levels: AccessLevels;
  onChange: (levels: AccessLevels) => void;
};

/**
 * "Read: Feature Flags, Customers · Read & write: Instances", built from the
 * preset itself so it cannot say something the preset does not grant.
 */
function usePresetGrants(presetId: TokenPresetId): string {
  const { t } = useTranslation();
  const preset = TOKEN_PRESETS[presetId];

  return API_SCOPE_PERMISSIONS.map((level) => {
    const labels = AVAILABLE_RESOURCES.filter(
      (resource) => preset[resource.id] === level,
    ).map((resource) =>
      t(resource.labelKey, { defaultValue: resource.fallbackLabel }),
    );
    return labels.length > 0
      ? t(`${SCOPES_I18N_PREFIX}.presetGrants`, {
          level: t(`${SCOPES_I18N_PREFIX}.Levels.${level}`),
          resources: labels.join(', '),
        })
      : null;
  })
    .filter(Boolean)
    .join(' · ');
}

function PresetToggle({
  presetId,
  applied,
  onToggle,
}: {
  presetId: TokenPresetId;
  applied: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const grants = usePresetGrants(presetId);
  const id = useId();
  const Indicator = applied ? CircleCheck : Circle;

  // Named by its label alone, so a screen reader announces "Data plane, toggle
  // button, pressed" and reads the rest as its description.
  return (
    <button
      type="button"
      aria-pressed={applied}
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-description ${id}-grants`}
      onClick={onToggle}
      className={cn(
        'flex items-start gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        applied && 'border-primary bg-primary-subtle',
      )}
    >
      <Indicator
        className={cn(
          'mt-0.5 size-4 shrink-0',
          applied ? 'text-primary-subtle-foreground' : 'text-muted-foreground',
        )}
        aria-hidden
      />
      <span className="min-w-0 space-y-1">
        <span id={`${id}-label`} className="block text-sm font-medium">
          {t(`${SCOPES_I18N_PREFIX}.Presets.${presetId}.label`)}
        </span>
        <span
          id={`${id}-description`}
          className="block text-xs text-muted-foreground"
        >
          {t(`${SCOPES_I18N_PREFIX}.Presets.${presetId}.description`)}
        </span>
        <span
          id={`${id}-grants`}
          className="block text-xs text-muted-foreground/80"
        >
          {grants}
        </span>
      </span>
    </button>
  );
}

export function TokenPresets({ levels, onChange }: TokenPresetsProps) {
  // Nothing is stored about presets: one is on whenever the table covers it,
  // whether it got there by a click or row by row.
  const applied = TOKEN_PRESET_IDS.filter((id) =>
    includesPreset(levels, TOKEN_PRESETS[id]),
  );

  const toggle = (presetId: TokenPresetId) => {
    const preset = TOKEN_PRESETS[presetId];
    if (!applied.includes(presetId)) {
      onChange(applyPreset(levels, preset));
      return;
    }
    const kept = applied
      .filter((id) => id !== presetId)
      .map((id) => TOKEN_PRESETS[id]);
    onChange(removePreset(levels, preset, kept));
  };

  // The two cards say what each preset is for and grants, and the Access
  // card's description says what to do with them: no heading row of their own,
  // so the scope list keeps the height.
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {TOKEN_PRESET_IDS.map((presetId) => (
        <PresetToggle
          key={presetId}
          presetId={presetId}
          applied={applied.includes(presetId)}
          onToggle={() => toggle(presetId)}
        />
      ))}
    </div>
  );
}
