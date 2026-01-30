/**
 * Application-wide constants
 * Centralized location for magic strings, numbers, and configuration values
 */

// LocalStorage Keys
export const STORAGE_KEYS = {
  NOTES: 'pinn.notes',
  FOLDERS: 'pinn.folders',
  FLOWS: 'pinn.flows',
  FLOW_CATEGORIES: 'pinn.flowCategories',
  THEME: 'pinn.theme',
  CLOUD_CONFIG: 'pinn.cloudConfig',
  CLOUD_USER_ID: 'pinn.cloudUserId',
  FOLDER_PATH: 'pinn.folderPath',
  FOLDER_CONFIGURED: 'pinn.folderConfigured',
  PENDING_FOLDER: 'pinn.pendingFolder',
  PENDING_FLOW_CATEGORY: 'pinn.pendingFlowCategory',
} as const;

// File System Storage Keys (from fileSystemStorage.ts)
export const FILE_SYSTEM_KEYS = {
  FOLDER_PATH: 'pinn.folderPath',
  FOLDER_CONFIGURED: 'pinn.folderConfigured',
} as const;

// Theme Storage Key (from themeStorage.ts)
export const THEME_KEY = 'pinn.theme';

// Gemini API Storage Key (from geminiStorage.ts)
export const GEMINI_API_KEY_STORAGE_KEY = 'pinn.geminiApiKey';

// Timeout Values (in milliseconds)
export const TIMEOUTS = {
  AUTO_SAVE: 500, // Editor auto-save delay
  TOAST_DISMISS: 3000, // Toast notification auto-dismiss
  INIT_DELAY: 10, // App initialization delay
  STORAGE_INIT_DELAY: 50, // Storage initialization delay
  FILE_SYSTEM_DELAY: 100, // File system operation delay
  PDF_EXPORT_TIMEOUT: 5000, // PDF export timeout
  FLOW_TOOLTIP_DISMISS: 3000, // Flow tooltip dismiss delay
  URL_REVOKE_DELAY: 100, // URL revoke delay
  INPUT_FOCUS_DELAY: 100, // Input focus delay
} as const;

// Default Values
export const DEFAULTS = {
  NOTE_TITLE: 'Untitled',
  FOLDER_NAME: 'Unfiled',
  SORT_BY: 'date' as const,
  DATE_FILTER: 'all' as const,
  TAG_FILTER: 'all' as const,
} as const;

// Theme Colors
export const THEME_COLORS = {
  ACCENT: '#e8935f',
  ACCENT_HOVER: '#d8834f',
  BLUE: '#3b82f6',
  BLUE_HOVER: '#2563eb',
  RED: '#ef4444',
  RED_HOVER: '#dc2626',
} as const;

// IndexedDB Configuration
export const IDB_CONFIG = {
  NAME: 'pinn-storage',
  STORE: 'directoryHandle',
  VERSION: 1,
} as const;

// Export File Names
export const EXPORT_NAMES = {
  NOTES_ZIP: 'pinn-notes-export.zip',
  NOTES_JSON: 'pinn-notes-export.json',
} as const;

// Date Formatting
export const DATE_FORMAT = {
  LOCALE: 'en-GB',
  OPTIONS: {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  },
} as const;

// Search Configuration
export const SEARCH_CONFIG = {
  DEBOUNCE_MS: 300, // Debounce delay for search input
} as const;

// File Name Sanitization
export const FILE_NAME_REGEX = /[^a-z0-9]/gi;
export const FILE_NAME_REPLACEMENT = '_';
