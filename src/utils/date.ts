import { DATE_FORMAT } from '../constants';

/**
 * Format a date string to a localized date-time string
 * @param dateString - ISO date string
 * @returns Formatted date string (e.g., "01/12/2024, 14:30:45")
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString(DATE_FORMAT.LOCALE, DATE_FORMAT.OPTIONS);
}

/**
 * Format a date string to a relative time string
 * @param dateString - ISO date string
 * @returns Relative time string (e.g., "5 minutes ago", "2 hours ago", or formatted date if older)
 */
export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  } else {
    return formatDate(dateString);
  }
}

/**
 * Format a date string to a short date string (date only, no time)
 * @param dateString - ISO date string
 * @returns Short date string (e.g., "01/12/2024")
 */
export function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(DATE_FORMAT.LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Format a date string to a time-only string
 * @param dateString - ISO date string
 * @returns Time string (e.g., "14:30:45")
 */
export function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString(DATE_FORMAT.LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
