/** User-local calendar grouping and localized time labels shared by feeds. */
export const formatRelativeTimeToNow = (
  timestamp: string,
  locale: string,
  now = new Date(),
): string => {
  const diffSeconds = Math.round(
    (new Date(timestamp).getTime() - now.getTime()) / 1000,
  );
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const absoluteDiffSeconds = Math.abs(diffSeconds);
  if (absoluteDiffSeconds < 60) return formatter.format(diffSeconds, 'second');
  if (absoluteDiffSeconds < 3_600)
    return formatter.format(Math.round(diffSeconds / 60), 'minute');
  if (absoluteDiffSeconds < 86_400)
    return formatter.format(Math.round(diffSeconds / 3_600), 'hour');
  return formatter.format(Math.round(diffSeconds / 86_400), 'day');
};

export const formatTimeOfDay = (timestamp: string, locale: string): string =>
  new Date(timestamp).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });

export const getDayKey = (timestamp: string): string => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

export interface DayHeadingLabels {
  today: string;
  yesterday: string;
}

export const formatDayHeading = (
  timestamp: string,
  locale: string,
  labels: DayHeadingLabels,
  now: Date = new Date(),
): string => {
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diffDays = Math.round(
    (startOfDay(now) - startOfDay(new Date(timestamp))) / 86_400_000,
  );
  if (diffDays === 0) return labels.today;
  if (diffDays === 1) return labels.yesterday;
  return new Date(timestamp).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

export interface DayGroup<T> {
  key: string;
  heading: string;
  entries: T[];
}

export const groupItemsByDay = <T>(
  items: T[],
  getTimestamp: (item: T) => string,
  makeHeading: (timestamp: string) => string,
): DayGroup<T>[] => {
  const groups: DayGroup<T>[] = [];
  const groupsByKey = new Map<string, DayGroup<T>>();
  for (const item of items) {
    const timestamp = getTimestamp(item);
    const key = getDayKey(timestamp);
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.entries.push(item);
      continue;
    }
    const group: DayGroup<T> = {
      key,
      heading: makeHeading(timestamp),
      entries: [item],
    };
    groupsByKey.set(key, group);
    groups.push(group);
  }
  return groups;
};
