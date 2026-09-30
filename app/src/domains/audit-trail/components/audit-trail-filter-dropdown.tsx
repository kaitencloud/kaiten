import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Check, ChevronDown, type LucideIcon } from 'lucide-react';
import { type RefObject, useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useEllipsis } from '@/hooks/use-ellipsis';
import { cn } from '@/lib/utils';
import type { AuditTrailOption } from '../audit-trail.types';

interface AuditFilterDropdownProps {
  icon: LucideIcon;
  label: string;
  allLabel: string;
  value: string;
  options: AuditTrailOption[];
  onChange: (value: string) => void;
}

// Single-select filter dropdown: a labelled trigger button that opens a list of
// options (prefixed by an "all" reset row). Feature-local — the global feed's
// filters are bespoke rather than the shared filter framework.
export function AuditFilterDropdown({
  icon: Icon,
  label,
  allLabel,
  value,
  options,
  onChange,
}: AuditFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  // The trigger caps the picked label; a tooltip gives it back once it is cut.
  const {
    className: ellipsisClassName,
    isEllipsis,
    ref: labelRef,
  } = useEllipsis();
  const selected = options.find((option) => option.value === value);
  const active = value !== 'all';
  const display = active ? (selected?.label ?? label) : label;
  const allOptions: AuditTrailOption[] = [
    { value: 'all', label: allLabel },
    ...options,
  ];

  const handleSelect = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const renderOption = (option: AuditTrailOption) => (
    <button
      key={option.value}
      type="button"
      onClick={() => handleSelect(option.value)}
      className={cn(
        'flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-foreground',
        option.value === value && 'bg-accent/60',
      )}
    >
      <span className="wrap-anywhere">{option.label}</span>
      {option.value === value && (
        <Check
          className="size-4 shrink-0 text-primary-subtle-foreground"
          aria-hidden
        />
      )}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          {/* The popover's trigger wraps the tooltip's, so the button's
              data-state stays the popover's open/closed. */}
          <PopoverTrigger asChild>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn('gap-1.5', active && 'border-primary/50')}
              >
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                <span
                  ref={labelRef as RefObject<HTMLSpanElement>}
                  className={cn('max-w-[150px]', ellipsisClassName)}
                >
                  {display}
                </span>
                <ChevronDown
                  className="size-3.5 text-muted-foreground"
                  aria-hidden
                />
              </Button>
            </TooltipTrigger>
          </PopoverTrigger>
          {isEllipsis && (
            <TooltipContent align="start" side="top" className="max-w-sm">
              {display}
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
      {/* Sized to its options, as the shared filter lists are: a label wraps
          past 420px rather than being cut. */}
      <PopoverContent
        align="start"
        className="w-auto min-w-56 max-w-[min(92vw,420px)] p-1"
      >
        <div className="flex max-h-72 flex-col overflow-y-auto">
          {allOptions.map(renderOption)}
        </div>
      </PopoverContent>
    </Popover>
  );
}
