import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { InstanceEntitlementGroupOption } from '../../utils/instance-detail-entitlements.utils';

type EntitlementGroupFilterSelectProps = {
  allGroupsLabel: string;
  ariaLabel: string;
  onChange: (value: string) => void;
  options: InstanceEntitlementGroupOption[];
  value: string;
};

export function EntitlementGroupFilterSelect({
  allGroupsLabel,
  ariaLabel,
  onChange,
  options,
  value,
}: EntitlementGroupFilterSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full md:w-55" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allGroupsLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
