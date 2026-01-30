/**
 * Theme Storage
 * Manages theme preferences with localStorage and file system persistence
 */

import { isFolderConfigured, hasDirectoryAccess, getDirectoryHandle } from './fileSystemStorage';
import { logger } from '../utils/logger';

export type Theme = 'default' | 'darker';

const THEME_KEY = 'pinn.theme';
const THEME_FILE = 'theme.json';

/**
 * Get the current theme from localStorage
 */
export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'default' || stored === 'darker') {
      return stored;
    }
  } catch (error) {
    logger.error('Error reading theme from localStorage:', error);
  }
  return 'default';
}

/**
 * Save theme to localStorage and file system (if configured)
 */
export async function saveTheme(theme: Theme): Promise<void> {
  try {
    // Save to localStorage
    localStorage.setItem(THEME_KEY, theme);
    logger.log('Theme saved to localStorage:', theme);

    // Save to file system if folder is configured
    const folderConfigured = isFolderConfigured();
    const hasAccess = hasDirectoryAccess();

    if (folderConfigured && hasAccess) {
      await saveThemeToFile(theme);
    }
  } catch (error) {
    logger.error('Error saving theme:', error);
    // Still save to localStorage even if file write fails
    localStorage.setItem(THEME_KEY, theme);
  }
}

/**
 * Load theme from file system (if available)
 */
export async function loadThemeFromFile(): Promise<Theme | null> {
  try {
    if (!isFolderConfigured() || !hasDirectoryAccess()) {
      return null;
    }

    const handle = getDirectoryHandle();
    if (!handle) {
      return null;
    }

    const fileHandle = await handle.getFileHandle(THEME_FILE, { create: false });
    const file = await fileHandle.getFile();
    const text = await file.text();

    if (!text.trim()) {
      return null;
    }

    const data = JSON.parse(text);
    if (data && (data.theme === 'default' || data.theme === 'darker')) {
      logger.log('Theme loaded from file:', data.theme);
      return data.theme;
    }
  } catch (error: any) {
    if (error.name !== 'NotFoundError') {
      logger.error('Error loading theme from file:', error);
    }
  }
  return null;
}

/**
 * Save theme to file system
 */
async function saveThemeToFile(theme: Theme): Promise<void> {
  try {
    const handle = getDirectoryHandle();
    if (!handle) {
      throw new Error('No directory handle available');
    }

    const fileHandle = await handle.getFileHandle(THEME_FILE, { create: true });
    const writable = await fileHandle.createWritable();
    const data = { theme };
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    logger.log('Theme saved to file:', theme);
  } catch (error) {
    logger.error('Error saving theme to file:', error);
    throw error;
  }
}

/**
 * Initialize theme on app startup
 * Loads from file system if available, otherwise from localStorage
 */
export async function initializeTheme(): Promise<Theme> {
  try {
    // First try to load from file system
    const fileTheme = await loadThemeFromFile();
    if (fileTheme) {
      // Sync with localStorage
      localStorage.setItem(THEME_KEY, fileTheme);
      return fileTheme;
    }

    // Fall back to localStorage
    return getTheme();
  } catch (error) {
    logger.error('Error initializing theme:', error);
    return getTheme();
  }
}

/**
 * Apply theme to document
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  logger.log('Theme applied to document:', theme);
}
