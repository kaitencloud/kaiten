import {
  formatDateTimeShort as formatDateTimeShortValue,
  formatDateTime as formatDateTimeValue,
  formatDate as formatDateValue,
} from '@/lib/detail';

export const formatDate = (dateString: string, locale = 'en-US') =>
  formatDateValue(dateString, locale);

export const formatDateTime = (dateString: string, locale = 'en-US') =>
  formatDateTimeValue(dateString, locale);

export const formatDateTimeShort = (dateString: string, locale = 'en-US') =>
  formatDateTimeShortValue(dateString, locale);
