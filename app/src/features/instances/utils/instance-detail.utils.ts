export const DAY_IN_MS = 1000 * 60 * 60 * 24;

export const getDaysUntil = (date: string, now: Date = new Date()) => {
  const endDate = new Date(date);
  return Math.ceil((endDate.getTime() - now.getTime()) / DAY_IN_MS);
};

export const getLicenseUrgencyVariant = (daysLeft: number) => {
  if (daysLeft <= 30) {
    return 'destructive' as const;
  }
  if (daysLeft <= 90) {
    return 'secondary' as const;
  }
  return 'success' as const;
};

// A count of days stops being readable past a few weeks: "in 45 days", then
// "in 7 months", then "in 10 years".
export const formatTimeUntil = (daysLeft: number, locale?: string) => {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (daysLeft < 60) {
    return format.format(daysLeft, 'day');
  }
  if (daysLeft < 730) {
    return format.format(Math.round(daysLeft / 30), 'month');
  }
  return format.format(Math.round(daysLeft / 365), 'year');
};

export const getLicenseProgressPercent = (
  startDate: string,
  endDate: string,
  now: Date = new Date(),
) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const total = end.getTime() - start.getTime();

  if (total <= 0) {
    return 100;
  }

  const elapsed = now.getTime() - start.getTime();
  const percent = (elapsed / total) * 100;
  return Math.max(0, Math.min(100, Math.round(percent)));
};
