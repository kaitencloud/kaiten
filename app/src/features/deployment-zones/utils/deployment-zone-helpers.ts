import { formatDate as formatLocalizedDate } from '@/lib/format-date';
export {
  formatZoneType,
  getZoneTypeBadgeVariant,
} from '@/domains/release-management';

export const formatDate = (dateString: string) => {
  return formatLocalizedDate(dateString, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};
