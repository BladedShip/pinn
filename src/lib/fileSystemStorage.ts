/**
 * File System Storage Adapter
 * Uses the File System Access API to store notes, flows, and folders in a user-selected directory
 */

import { logger } from '../utils/logger';

// Extend FileSystemDirectoryHandle type to include permission methods
interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemDirectoryHandleWithPermissions extends FileSystemDirectoryHandle {
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

// Extend Window interface for showDirectoryPicker
declare global {
  interface Window {
    showDirectoryPicker?(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
  }
}

const FOLDER_PATH_KEY = 'pinn.folderPath';
const FOLDER_CONFIGURED_KEY = 'pinn.folderConfigured';
const IDB_NAME = 'pinn-storage';
const IDB_STORE = 'directoryHandle';

// Store the directory handle in memory
let directoryHandle: FileSystemDirectoryHandle | null = null;
let isRestoringHandle = false;

/**
 * Get IndexedDB database
 */
async function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
  });
}

/**
 * Store directory handle in IndexedDB
 */
async function storeHandleInIndexedDB(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    await new Promise<void>((resolve, reject) => {
      const request = store.put(handle, 'handle');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    logger.error('Error storing directory handle in IndexedDB:', error);
    // Don't throw - this is a non-critical operation
  }
}

/**
 * Restore directory handle from IndexedDB
 */
async function restoreHandleFromIndexedDB(): Promise<FileSystemDirectoryHandle | null> {
  try {
    logger.log('restoreHandleFromIndexedDB: Starting...');
    const db = await getDB();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const request = store.get('handle');
      request.onsuccess = () => {
        logger.log('restoreHandleFromIndexedDB: Handle retrieved from IndexedDB:', !!request.result);
        resolve(request.result || null);
      };
      request.onerror = () => reject(request.error);
    });

    if (!handle) {
      logger.log('restoreHandleFromIndexedDB: No handle found in IndexedDB');
      return null;
    }

    logger.log('restoreHandleFromIndexedDB: Handle found, checking permission...');
    // Verify permission is still granted
    const handleWithPerms = handle as FileSystemDirectoryHandleWithPermissions;
    let permission = handleWithPerms.queryPermission ? await handleWithPerms.queryPermission({ mode: 'readwrite' }) : 'granted';
    logger.log('restoreHandleFromIndexedDB: Permission state:', permission);
    
    if (permission === 'granted') {
      logger.log('restoreHandleFromIndexedDB: Permission granted, returning handle');
      return handle;
    } else if (permission === 'prompt') {
      // Permission needs to be requested again
      // In some browsers, permission can be in 'prompt' state but still work
      // Try to request it, but don't fail immediately if it doesn't work
      try {
        permission = handleWithPerms.requestPermission ? await handleWithPerms.requestPermission({ mode: 'readwrite' }) : 'granted';
        logger.log('restoreHandleFromIndexedDB: After requestPermission, state:', permission);
        if (permission === 'granted') {
          return handle;
        }
      } catch (permError) {
        // requestPermission might fail without user gesture - that's okay
        logger.log('restoreHandleFromIndexedDB: Could not request permission automatically (user gesture may be required):', permError);
      }
      
      // Permission is 'prompt' - don't return the handle yet
      // The handle exists but needs user gesture to restore permission
      // Returning null so caller knows permission needs to be requested
      logger.log('restoreHandleFromIndexedDB: Permission is prompt - handle exists but needs user gesture to restore');
      return null; // Return null - caller should request permission with user gesture
    } else {
      // Permission was denied - don't clear the handle, just return null
      // User might want to try restoring it, or they can re-select
      logger.warn('restoreHandleFromIndexedDB: Directory permission was denied');
      // Don't clear handle - let user try to restore it or re-select
      return null;
    }
  } catch (error) {
    logger.error('restoreHandleFromIndexedDB: Error restoring directory handle from IndexedDB:', error);
    return null;
  }
}

/**
 * Clear directory handle from IndexedDB
 */
async function clearHandleFromIndexedDB(): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    await new Promise<void>((resolve, reject) => {
      const request = store.delete('handle');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    logger.error('Error clearing directory handle from IndexedDB:', error);
  }
}

export interface DirectoryHandleInfo {
  name: string;
  handle: FileSystemDirectoryHandle;
}

/**
 * Check if File System Access API is supported
 */
export function isFileSystemSupported(): boolean {
  return 'showDirectoryPicker' in window;
}

/**
 * Check if a folder has been configured
 */
export function isFolderConfigured(): boolean {
  return localStorage.getItem(FOLDER_CONFIGURED_KEY) === 'true';
}

/**
 * Verify directory access by checking if we have a handle
 */
export function hasDirectoryAccess(): boolean {
  return directoryHandle !== null;
}

/**
 * Check if we have a valid directory handle with granted permission
 * This is more accurate than hasDirectoryAccess() as it verifies permission
 */
export async function hasValidDirectoryAccess(): Promise<boolean> {
  if (!directoryHandle) {
    return false;
  }
  
  try {
    const handleWithPerms = directoryHandle as FileSystemDirectoryHandleWithPermissions;
    const permission = handleWithPerms.queryPermission ? await handleWithPerms.queryPermission({ mode: 'readwrite' }) : 'granted';
    return permission === 'granted';
  } catch (error) {
    logger.error('Error checking directory permission:', error);
    return false;
  }
}

/**
 * Restore directory access with user gesture (for permission re-grant)
 * This should be called from a user interaction (button click)
 * If handle is missing, will automatically prompt user to re-select folder
 */
export async function restoreDirectoryAccess(): Promise<boolean> {
  if (!isFolderConfigured()) {
    logger.log('restoreDirectoryAccess: Folder not configured');
    throw new Error('Folder not configured. Please select a folder first.');
  }

  try {
    logger.log('restoreDirectoryAccess: Attempting to restore handle from IndexedDB...');
    
    // First, try to get handle directly from IndexedDB
    // This is important because we want to keep the handle even if permission check fails
    let handle: FileSystemDirectoryHandle | null = null;
    try {
      const db = await getDB();
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
        const request = store.get('handle');
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (dbError) {
      logger.error('restoreDirectoryAccess: Error reading from IndexedDB:', dbError);
      throw new Error('Could not access stored folder information.');
    }
    
    // If handle doesn't exist in IndexedDB, automatically prompt user to re-select folder
    if (!handle) {
      logger.log('restoreDirectoryAccess: No handle found in IndexedDB, prompting user to re-select folder...');
      // Automatically prompt for folder selection
      if (!isFileSystemSupported()) {
        throw new Error('File System Access API is not supported in this browser.');
      }
      
      const newHandle = await (window.showDirectoryPicker?.({
        mode: 'readwrite',
      }) ?? Promise.reject(new Error('showDirectoryPicker not available')));
      
      if (!newHandle) {
        // User cancelled
        return false;
      }
      
      // Set the new handle
      await setDirectoryHandle(newHandle, newHandle.name);
      directoryHandle = newHandle;
      logger.log('restoreDirectoryAccess: Successfully re-selected folder');
      return true;
    }

    // Handle exists - now request permission with user gesture
    logger.log('restoreDirectoryAccess: Handle found, requesting permission with user gesture...');
    
    // First check current permission state
    const handleWithPerms = handle as FileSystemDirectoryHandleWithPermissions;
    let permission = handleWithPerms.queryPermission ? await handleWithPerms.queryPermission({ mode: 'readwrite' }) : 'granted';
    logger.log('restoreDirectoryAccess: Initial permission state:', permission);
    
    // If permission is not granted, request it (user gesture available from button click)
    if (permission !== 'granted') {
      logger.log('restoreDirectoryAccess: Requesting permission with user gesture...');
      try {
        permission = handleWithPerms.requestPermission ? await handleWithPerms.requestPermission({ mode: 'readwrite' }) : 'granted';
        logger.log('restoreDirectoryAccess: Permission after request:', permission);
      } catch (permError: any) {
        logger.error('restoreDirectoryAccess: Error requesting permission:', permError);
        // If requestPermission fails, try to verify if handle works anyway
        permission = 'prompt'; // Treat as prompt so we try verification
      }
    }

    // If permission is granted, use the handle
    if (permission === 'granted') {
      logger.log('restoreDirectoryAccess: Permission granted, setting handle...');
      directoryHandle = handle;
      await storeHandleInIndexedDB(handle);
      logger.log('restoreDirectoryAccess: Successfully restored access');
      return true;
    }
    
    // If permission is still 'prompt' or we got an error, try to verify access
    // Sometimes browsers allow access even when permission state is 'prompt'
    logger.log('restoreDirectoryAccess: Permission not granted, verifying if handle works...');
    try {
      // Try to verify we can access the directory
      const entries: string[] = [];
      // Type assertion for keys() method
      const handleWithKeys = handle as FileSystemDirectoryHandle & { keys(): AsyncIterableIterator<string> };
      for await (const entry of handleWithKeys.keys()) {
        entries.push(entry);
        break; // Just check if we can iterate
      }
      // If we can access it, permission is effectively granted
      logger.log('restoreDirectoryAccess: Can access directory, treating as granted');
      directoryHandle = handle;
      await storeHandleInIndexedDB(handle);
      return true;
    } catch (accessError: any) {
      logger.error('restoreDirectoryAccess: Cannot access directory:', accessError);
      // Can't access - the handle might be stale or permission was revoked
      // On macOS Chrome, requestPermission might trigger folder picker instead of permission dialog
      // So we need to let user re-select the folder
      // Since we know the folder path, we can guide them to select the same folder
      logger.log('restoreDirectoryAccess: Access failed, prompting user to re-select folder (same folder is fine)');
      
      // Prompt user to select folder - they should select the same one
      const newHandle = await (window.showDirectoryPicker?.({
        mode: 'readwrite',
      }) ?? Promise.reject(new Error('showDirectoryPicker not available')));
      
      if (!newHandle) {
        return false;
      }
      
      // Set the new handle (even if it's the same folder)
      await setDirectoryHandle(newHandle, newHandle.name);
      directoryHandle = newHandle;
      logger.log('restoreDirectoryAccess: Successfully re-selected folder');
      return true;
    }
  } catch (error: any) {
    logger.error('Error restoring directory access:', error);
    // Re-throw to provide better error message, but don't show error if user cancelled
    if (error.name === 'AbortError') {
      return false;
    }
    if (error.message) {
      throw error;
    }
    throw new Error('Failed to restore directory access. Please try again.');
  }
}

/**
 * Request user to select or create a directory
 * @param defaultName - Suggested default directory name
 * @param allowReuse - If true and folder is configured, try to restore handle first
 */
export async function requestDirectoryAccess(defaultName: string = 'Pinn', allowReuse: boolean = false): Promise<FileSystemDirectoryHandle | null> {
  try {
    if (!isFileSystemSupported()) {
      throw new Error('File System Access API is not supported in this browser');
    }

    // If folder is configured and we're trying to reuse it, try to restore handle first
    if (allowReuse && isFolderConfigured() && !directoryHandle) {
      logger.log('requestDirectoryAccess: Folder configured, attempting to restore handle...');
      const restored = await restoreHandleFromIndexedDB();
      if (restored) {
        // Verify we can still access it
        try {
          const restoredWithPerms = restored as FileSystemDirectoryHandleWithPermissions;
          let permission = restoredWithPerms.queryPermission ? await restoredWithPerms.queryPermission({ mode: 'readwrite' }) : 'granted';
          if (permission === 'prompt') {
            permission = restoredWithPerms.requestPermission ? await restoredWithPerms.requestPermission({ mode: 'readwrite' }) : 'granted';
          }
          if (permission === 'granted') {
            directoryHandle = restored;
            logger.log('requestDirectoryAccess: Successfully restored existing handle');
            return restored;
          }
        } catch (permError) {
          logger.log('requestDirectoryAccess: Could not restore handle, will prompt for new selection');
        }
      }
    }

    // Request directory access
    if (!window.showDirectoryPicker) {
      throw new Error('showDirectoryPicker is not available');
    }
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
    });

    // Store the handle name for display purposes
    localStorage.setItem(FOLDER_PATH_KEY, handle.name);

    // Store directory handle reference
    directoryHandle = handle;

    // Store in IndexedDB for persistence across page reloads
    await storeHandleInIndexedDB(handle);

    return handle;
  } catch (error: any) {
    // User cancelled or error occurred
    if (error.name === 'AbortError') {
      return null;
    }
    logger.error('Error requesting directory access:', error);
    throw error;
  }
}

/**
 * Set the directory handle (used after onboarding)
 */
export async function setDirectoryHandle(handle: FileSystemDirectoryHandle, pathName?: string): Promise<void> {
  directoryHandle = handle;
  localStorage.setItem(FOLDER_CONFIGURED_KEY, 'true');
  if (pathName) {
    localStorage.setItem(FOLDER_PATH_KEY, pathName);
  } else {
    localStorage.setItem(FOLDER_PATH_KEY, handle.name);
  }
  // Store in IndexedDB for persistence across page reloads
  await storeHandleInIndexedDB(handle);
}

/**
 * Get the current directory handle
 */
export function getDirectoryHandle(): FileSystemDirectoryHandle | null {
  return directoryHandle;
}

/**
 * Get the stored folder path name (for display)
 */
export function getFolderPath(): string | null {
  return localStorage.getItem(FOLDER_PATH_KEY);
}

/**
 * Clear the directory handle and path
 */
export async function clearDirectoryHandle(): Promise<void> {
  directoryHandle = null;
  localStorage.removeItem(FOLDER_CONFIGURED_KEY);
  localStorage.removeItem(FOLDER_PATH_KEY);
  await clearHandleFromIndexedDB();
}

/**
 * Initialize and restore directory handle from IndexedDB
 * Call this on app startup before other storage operations
 */
export async function initializeDirectoryHandle(): Promise<void> {
  // Only restore if folder is configured
  if (!isFolderConfigured()) {
    logger.log('initializeDirectoryHandle: No folder configured, skipping');
    return;
  }

  // If handle is already set, don't restore
  if (directoryHandle) {
    logger.log('initializeDirectoryHandle: Handle already exists, skipping');
    return;
  }

  // If already restoring, wait for it to complete
  if (isRestoringHandle) {
    logger.log('initializeDirectoryHandle: Already restoring, waiting...');
    // Wait for restoration to complete by polling
    let attempts = 0;
    while (isRestoringHandle && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    if (directoryHandle) {
      logger.log('initializeDirectoryHandle: Handle restored by other operation');
      return;
    }
  }

  isRestoringHandle = true;
  logger.log('initializeDirectoryHandle: Starting handle restoration...');
  
  try {
    const handle = await restoreHandleFromIndexedDB();
    if (handle) {
      directoryHandle = handle;
      logger.log('initializeDirectoryHandle: Directory handle restored from IndexedDB, access available:', hasDirectoryAccess());
    } else {
      logger.warn('initializeDirectoryHandle: Failed to restore directory handle - permission may need to be re-granted');
      // Keep the folder configured flag - don't clear it
      // The folder is still configured, just permission needs to be re-granted
      // User can re-grant permission when they try to use file operations
      logger.log('initializeDirectoryHandle: Folder remains configured, but handle needs to be restored with user permission');
    }
  } catch (error) {
    logger.error('initializeDirectoryHandle: Error initializing directory handle:', error);
    // Keep the folder configured flag even on error
    // The folder path is still stored, user just needs to re-grant permission
    logger.log('initializeDirectoryHandle: Folder remains configured despite error');
  } finally {
    isRestoringHandle = false;
    logger.log('initializeDirectoryHandle: Completed, handle available:', hasDirectoryAccess());
  }
}

/**
 * Ensure we have directory access before operations
 * If handle is not available but folder is configured, try to restore it
 */
async function ensureDirectoryAccess(): Promise<FileSystemDirectoryHandle> {
  if (!directoryHandle) {
    // If folder is configured but handle is missing, try to restore it
    if (isFolderConfigured()) {
      logger.log('ensureDirectoryAccess: Folder configured but handle missing, attempting to restore...');
      const restored = await restoreHandleFromIndexedDB();
      if (restored) {
        // Try to request permission if needed
        try {
          const restoredWithPerms = restored as FileSystemDirectoryHandleWithPermissions;
          let permission = restoredWithPerms.queryPermission ? await restoredWithPerms.queryPermission({ mode: 'readwrite' }) : 'granted';
          if (permission === 'prompt') {
            permission = restoredWithPerms.requestPermission ? await restoredWithPerms.requestPermission({ mode: 'readwrite' }) : 'granted';
          }
          if (permission === 'granted') {
            directoryHandle = restored;
            logger.log('ensureDirectoryAccess: Successfully restored handle');
            return restored;
          }
        } catch (permError) {
          logger.error('ensureDirectoryAccess: Could not restore permission:', permError);
        }
      }
      throw new Error('Directory access was revoked. Please re-select your folder in settings to continue using file system storage.');
    } else {
    throw new Error('No directory selected. Please select a folder in settings.');
    }
  }
  return directoryHandle;
}

/**
 * Read a JSON file from the directory
 */
async function readJSONFile(filename: string): Promise<any> {
  try {
    const handle = await ensureDirectoryAccess();
    logger.log(`Reading file ${filename} from directory...`);
    const fileHandle = await handle.getFileHandle(filename, { create: false });
    const file = await fileHandle.getFile();
    const text = await file.text();
    if (!text.trim()) {
      logger.log(`File ${filename} exists but is empty`);
      return null;
    }
    const parsed = JSON.parse(text);
    logger.log(`Successfully read and parsed ${filename}`);
    return parsed;
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      logger.log(`File ${filename} not found in directory`);
      return null;
    }
    logger.error(`Error reading file ${filename}:`, error);
    throw error;
  }
}

/**
 * Write a JSON file to the directory
 */
async function writeJSONFile(filename: string, data: any): Promise<void> {
  try {
    const handle = await ensureDirectoryAccess();
    logger.log(`Writing file ${filename} to directory...`);
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    const jsonString = JSON.stringify(data, null, 2);
    await writable.write(jsonString);
    await writable.close();
    logger.log(`Successfully wrote ${filename} (${jsonString.length} bytes)`);
  } catch (error) {
    logger.error(`Error writing file ${filename}:`, error);
    throw error;
  }
}

/**
 * Delete a file from the directory
 */
async function deleteFile(filename: string): Promise<void> {
  try {
    const handle = await ensureDirectoryAccess();
    await handle.removeEntry(filename, { recursive: false });
  } catch (error: any) {
    if (error.name !== 'NotFoundError') {
      logger.error(`Error deleting file ${filename}:`, error);
      throw error;
    }
  }
}

// Storage operations for notes
export async function readNotesFromFile(): Promise<any[]> {
  try {
    const data = await readJSONFile('notes.json');
    if (data === null) {
      logger.log('notes.json not found or empty, returning empty array');
      return [];
    }
    if (!Array.isArray(data)) {
      logger.warn('notes.json contains invalid data (not an array), returning empty array');
      return [];
    }
    logger.log(`Loaded ${data.length} notes from notes.json`);
    return data;
  } catch (error) {
    logger.error('Error reading notes.json:', error);
    return [];
  }
}

export async function writeNotesToFile(notes: any[]): Promise<void> {
  await writeJSONFile('notes.json', notes);
}

export async function readFoldersFromFile(): Promise<string[]> {
  try {
    const data = await readJSONFile('folders.json');
    if (data === null) {
      logger.log('folders.json not found or empty, returning empty array');
      return [];
    }
    if (!Array.isArray(data)) {
      logger.warn('folders.json contains invalid data (not an array), returning empty array');
      return [];
    }
    const folders = data.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
    logger.log(`Loaded ${folders.length} folders from folders.json`);
    return folders;
  } catch (error) {
    logger.error('Error reading folders.json:', error);
    return [];
  }
}

export async function writeFoldersToFile(folders: string[]): Promise<void> {
  const unique = Array.from(new Set(folders.map((f) => (f || '').trim()).filter(Boolean)));
  await writeJSONFile('folders.json', unique);
}

export async function readCategoriesFromFile(): Promise<string[]> {
  try {
    const data = await readJSONFile('flowCategories.json');
    if (data === null) {
      logger.log('flowCategories.json not found or empty, returning empty array');
      return [];
    }
    if (!Array.isArray(data)) {
      logger.warn('flowCategories.json contains invalid data (not an array), returning empty array');
      return [];
    }
    const categories = data.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
    logger.log(`Loaded ${categories.length} categories from flowCategories.json`);
    return categories;
  } catch (error) {
    logger.error('Error reading flowCategories.json:', error);
    return [];
  }
}

export async function writeCategoriesToFile(categories: string[]): Promise<void> {
  const unique = Array.from(new Set(categories.map((c) => (c || '').trim()).filter(Boolean)));
  await writeJSONFile('flowCategories.json', unique);
}

// Storage operations for flows
export async function readFlowsFromFile(): Promise<any[]> {
  try {
    const data = await readJSONFile('flows.json');
    if (data === null) {
      logger.log('flows.json not found or empty, returning empty array');
      return [];
    }
    if (!Array.isArray(data)) {
      logger.warn('flows.json contains invalid data (not an array), returning empty array');
      return [];
    }
    logger.log(`Loaded ${data.length} flows from flows.json`);
    return data;
  } catch (error) {
    logger.error('Error reading flows.json:', error);
    return [];
  }
}

export async function writeFlowsToFile(flows: any[]): Promise<void> {
  await writeJSONFile('flows.json', flows);
}

/**
 * Migrate data from localStorage to file system
 */
export async function migrateFromLocalStorage(): Promise<{ notesMigrated: number; flowsMigrated: number }> {
  const handle = await ensureDirectoryAccess();
  
  let notesMigrated = 0;
  let flowsMigrated = 0;

  try {
    // Migrate notes
    const notesData = localStorage.getItem('pinn.notes');
    if (notesData) {
      const notes = JSON.parse(notesData);
      if (Array.isArray(notes) && notes.length > 0) {
        await writeNotesToFile(notes);
        notesMigrated = notes.length;
      }
    }

    // Migrate flows
    const flowsData = localStorage.getItem('pinn.flows');
    if (flowsData) {
      const flows = JSON.parse(flowsData);
      if (Array.isArray(flows) && flows.length > 0) {
        await writeFlowsToFile(flows);
        flowsMigrated = flows.length;
      }
    }

    // Migrate folders
    const foldersData = localStorage.getItem('pinn.folders');
    if (foldersData) {
      const folders = JSON.parse(foldersData);
      if (Array.isArray(folders) && folders.length > 0) {
        await writeFoldersToFile(folders);
      }
    }

    // Migrate flow categories
    const categoriesData = localStorage.getItem('pinn.flowCategories');
    if (categoriesData) {
      const categories = JSON.parse(categoriesData);
      if (Array.isArray(categories) && categories.length > 0) {
        await writeCategoriesToFile(categories);
      }
    }
  } catch (error) {
    logger.error('Error during migration:', error);
    throw error;
  }

  return { notesMigrated, flowsMigrated };
}

