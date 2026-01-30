import { FILE_NAME_REGEX, FILE_NAME_REPLACEMENT, DEFAULTS } from '../constants';

/**
 * Sanitize a string for use as a file name
 * Replaces all non-alphanumeric characters with underscores
 * @param str - String to sanitize
 * @param fallback - Fallback value if string is empty after sanitization
 * @returns Sanitized file name
 */
export function sanitizeFileName(str: string, fallback: string = DEFAULTS.NOTE_TITLE): string {
  if (!str || typeof str !== 'string') {
    return fallback;
  }
  const sanitized = str.replace(FILE_NAME_REGEX, FILE_NAME_REPLACEMENT);
  return sanitized || fallback;
}

/**
 * Truncate a string to a maximum length with ellipsis
 * @param str - String to truncate
 * @param maxLength - Maximum length
 * @param ellipsis - Ellipsis string (default: '...')
 * @returns Truncated string
 */
export function truncate(str: string, maxLength: number, ellipsis: string = '...'): string {
  if (!str || typeof str !== 'string') {
    return '';
  }
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Normalize a string by trimming whitespace
 * @param str - String to normalize
 * @returns Normalized string or empty string if input is invalid
 */
export function normalizeString(str: string | undefined | null): string {
  if (!str || typeof str !== 'string') {
    return '';
  }
  return str.trim();
}

/**
 * Generate a unique file name by appending a short ID
 * @param baseName - Base name for the file
 * @param id - Unique identifier (e.g., note ID)
 * @param extension - File extension (without dot)
 * @returns Unique file name
 */
export function generateUniqueFileName(baseName: string, id: string, extension: string): string {
  const sanitized = sanitizeFileName(baseName);
  const shortId = id.slice(0, 8);
  return `${sanitized}_${shortId}.${extension}`;
}

/**
 * Check if a string is empty or only whitespace
 * @param str - String to check
 * @returns True if string is empty or only whitespace
 */
export function isEmpty(str: string | undefined | null): boolean {
  return !str || normalizeString(str).length === 0;
}
