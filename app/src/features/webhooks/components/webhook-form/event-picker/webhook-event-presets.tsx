import { Circle, CircleCheck } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  WEBHOOK_EVENT_PRESET_IDS,
  WEBHOOK_EVENT_PRESETS,
  type WebhookEventPresetId,
} from '../../../utils/webhook-event-presets';

// Full keys, so that the i18n check sees each of them.
const PRESET_LABEL_KEYS = {
  instanceLifecycle:
    'Pages.Integrations.Webhooks.Form.picker.presets.instanceLifecycle',
  billing: 'Pages.Integrations.Webhooks.Form.picker.presets.billing',
  usageAlerts: 'Pages.Integrations.Webhooks.Form.picker.presets.usageAlerts',
} as const satisfies Record<WebhookEventPresetId, string>;

type WebhookEventPresetsProps = {
  applied: readonly WebhookEventPresetId[];
  onToggle: (presetId: WebhookEventPresetId) => void;
};

function WebhookEventPresetPill({
  presetId,
  applied,
  onToggle,
}: {
  presetId: WebhookEventPresetId;
  applied: boolean;
  onToggle: (presetId: WebhookEventPresetId) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const Indicator = applied ? CircleCheck : Circle;

  function handleClick() {
    onToggle(presetId);
  }

  // Named by its label, so it reads "Billing, toggle button, pressed", and
  // described by its event count.
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={applied}
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-count`}
      onClick={handleClick}
      className={cn(
        'rounded-full',
        applied && 'border-primary bg-primary-subtle',
      )}
    >
      <Indicator
        aria-hidden
        className={cn(
          applied ? 'text-primary-subtle-foreground' : 'text-muted-foreground',
        )}
      />
      <span id={`${id}-label`}>{t(PRESET_LABEL_KEYS[presetId])}</span>
      <span id={`${id}-count`} className="text-xs text-muted-foreground">
        {t('Pages.Integrations.Webhooks.Form.picker.presetCount', {
          count: WEBHOOK_EVENT_PRESETS[presetId].length,
        })}
      </span>
    </Button>
  );
}

/**
 * The preset pills: each checks a set of events, or unchecks it when every one
 * of them is checked. They act on the whole set, whatever the search shows.
 */
export function WebhookEventPresets({
  applied,
  onToggle,
}: WebhookEventPresetsProps) {
  const { t } = useTranslation();
  const labelId = useId();

  function renderPreset(presetId: WebhookEventPresetId) {
    return (
      <WebhookEventPresetPill
        key={presetId}
        presetId={presetId}
        applied={applied.includes(presetId)}
        onToggle={onToggle}
      />
    );
  }

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex flex-wrap items-center gap-2"
    >
      <span id={labelId} className="text-xs font-medium text-muted-foreground">
        {t('Pages.Integrations.Webhooks.Form.picker.presets.label')}
      </span>
      {WEBHOOK_EVENT_PRESET_IDS.map(renderPreset)}
    </div>
  );
}
