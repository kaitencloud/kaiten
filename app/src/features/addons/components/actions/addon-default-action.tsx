import { Star, StarOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Addon } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ROW_ACTION_LOOKS,
  type RowActionAppearance,
  useCanPerform,
} from '@/domains/billing';
import { useAddonDefault } from '../../hooks';
import { canBecomeDefault } from '../../utils/addon-lifecycle.utils';

type AddonDefaultActionProps = {
  addon: Addon;
  appearance: RowActionAppearance;
};

/**
 * Moves the family's default: onto this version, or off it when it is the default --
 * the one way out for a default that has to be archived. Only a PUBLISHED version
 * may become the default, and the API refuses the rest with
 * `UpdateAddon.DefaultMustBePublished`. The action stays visible but disabled, with
 * the reason on hover and focus, rather than vanishing: a vendor looking for it on a
 * draft should learn what to do next, not wonder where it went.
 */
export function AddonDefaultAction({
  addon,
  appearance,
}: AddonDefaultActionProps) {
  const { t } = useTranslation();
  const allowed = useCanPerform('addons.update');
  const { isPending, setDefault, unsetDefault } = useAddonDefault(addon);
  const look = ROW_ACTION_LOOKS[appearance];

  if (!allowed) {
    return null;
  }
  if (addon.isDefault) {
    return (
      <Button
        className={look.className}
        disabled={isPending}
        onClick={unsetDefault}
        size="sm"
        type="button"
        variant={look.variant}
      >
        <StarOff className="size-3" />
        {t('Pages.Addons.DefaultActions.unset')}
      </Button>
    );
  }
  if (!canBecomeDefault(addon)) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className={look.wrapperClassName} tabIndex={0}>
              <Button
                className={look.disabledClassName}
                disabled
                size="sm"
                type="button"
                variant={look.variant}
              >
                <Star className="size-3" />
                {t('Pages.Addons.DefaultActions.set')}
              </Button>
            </span>
          }
        />
        <TooltipContent>
          {t('Pages.Addons.DefaultActions.setUnavailable')}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      className={look.className}
      disabled={isPending}
      onClick={setDefault}
      size="sm"
      type="button"
      variant={look.variant}
    >
      <Star className="size-3" />
      {t('Pages.Addons.DefaultActions.set')}
    </Button>
  );
}
