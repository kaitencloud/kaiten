import { getAppLocale } from '@/lib/app-locale';
import {
  formatDateTimeShort as formatDateTimeShortValue,
  formatDateTime as formatDateTimeValue,
  formatDate as formatDateValue,
} from '@/lib/detail';

// A caller that gives no language gets the one the app is shown in, not English: the
// header of every instance page writes "Expires" and its date through these.
export const formatDate = (dateString: string, locale = getAppLocale()) =>
  formatDateValue(dateString, locale);

export const formatDateTime = (dateString: string, locale = getAppLocale()) =>
  formatDateTimeValue(dateString, locale);

export const formatDateTimeShort = (
  dateString: string,
  locale = getAppLocale(),
) => formatDateTimeShortValue(dateString, locale);
