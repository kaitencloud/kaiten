import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  INSTANCE_STATUS_VALUES,
  InstanceStatusBadge,
  type InstanceStatus,
  resolveInstanceStatus,
} from '@/domains/customer-management';

type InstanceStatusEditorProps = {
  status?: InstanceStatus;
  // `previous` is the status shown when the option was picked, so the caller
  // can offer to put it back.
  onSelect: (
    status: InstanceStatus,
    previous: InstanceStatus,
  ) => void | Promise<void>;
  isUpdating?: boolean;
};

/**
 * Inline status editor for the instance detail header: the status badge is a
 * trigger that opens a list of every operational status; picking one persists
 * the change on the fly (no separate edit/save step).
 */
export const InstanceStatusEditor = ({
  status,
  onSelect,
  isUpdating = false,
}: InstanceStatusEditorProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = resolveInstanceStatus(status);

  const handleSelect = async (next: InstanceStatus) => {
    setOpen(false);
    if (next !== current) {
      await onSelect(next, current);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={t(
              'Pages.Customers.Instances.Detail.statusEditor.title',
            )}
            disabled={isUpdating}
            className={cn(
              'rounded-md outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring',
              isUpdating ? 'opacity-60' : 'cursor-pointer hover:opacity-80',
            )}
          >
            <InstanceStatusBadge status={current} />
          </button>
        }
      />
      <PopoverContent align="start" className="w-52 p-1">
        <div className="flex flex-col gap-0.5">
          {INSTANCE_STATUS_VALUES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleSelect(option)}
              className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              <InstanceStatusBadge status={option} />
              {option === current && (
                <Check className="size-4 text-muted-foreground" />
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
