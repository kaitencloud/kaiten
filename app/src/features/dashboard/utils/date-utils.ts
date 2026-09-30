import { formatDate } from '@/lib/format-date';

/**
 * Get min and max dates from an array of dates
 */
export const getMinMaxDate = (dates: Date[]) => {
  if (dates.length === 0) {
    return { minDate: new Date(), maxDate: new Date() };
  }

  let minDate = dates[0];
  let maxDate = dates[0];

  for (const date of dates) {
    if (date) {
      if (minDate === undefined || date < minDate) {
        minDate = date;
      }
      if (maxDate === undefined || date > maxDate) {
        maxDate = date;
      }
    }
  }

  return {
    minDate: minDate ?? new Date(),
    maxDate: maxDate ?? new Date(),
  };
};

/**
 * Format a date range description
 */
export const getMinMaxDescription = (dates: Date[]) => {
  const { minDate, maxDate } = getMinMaxDate(dates);
  return `${formatDate(minDate, { dateStyle: 'long' })} - ${formatDate(maxDate, { dateStyle: 'long' })}`;
};

/**
 * Group items by date using a date extractor function
 */
export const groupByDate = <T>(
  items: T[],
  dateExtractor: (item: T) => string,
): Array<{ date: Date; count: number }> => {
  const groupedByDate = new Map<string, { date: Date; count: number }>();

  for (const item of items) {
    const date = new Date(dateExtractor(item));
    // Use YYYY-MM-DD as key to group by day
    const dateKey = date.toISOString().split('T')[0];
    const existing = groupedByDate.get(dateKey);

    if (existing) {
      existing.count += 1;
    } else {
      groupedByDate.set(dateKey, { date, count: 1 });
    }
  }

  return Array.from(groupedByDate.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
};

/**
 * Calculate instances expiring within a number of days
 */
export const getInstancesExpiringIn = (
  instances: Array<{ endLicenseDate: string }>,
  days: number,
): number => {
  const now = new Date();
  const targetDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  return instances.filter((instance) => {
    const endDate = new Date(instance.endLicenseDate);
    return endDate >= now && endDate <= targetDate;
  }).length;
};
