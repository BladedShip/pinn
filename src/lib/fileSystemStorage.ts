/**
 * File System Storage Adapter
 * Uses the File System Access API to store notes, flows, and folders in a user-selected directory
 */

import { logger } from '../utils/logger';
import {
  createSlugFromTitle,
  generateUniqueSlug,
  normalizeFolderPath,
  parseMarkdownWithFrontmatter,
  serializeMarkdownWithFrontmatter,
  type NoteMetadata,
} from './markdownUtils';

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
export async function requestDirectoryAccess(_defaultName: string = 'Pinn', allowReuse: boolean = false): Promise<FileSystemDirectoryHandle | null> {
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
  cachedNotesIndex = null;
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
export async function ensureDirectoryAccess(): Promise<FileSystemDirectoryHandle> {
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


// ============================================================================
// NEW FILE STRUCTURE FUNCTIONS
// ============================================================================

/**
 * Get or create the notes directory
 */
export async function ensureNotesDirectory(): Promise<FileSystemDirectoryHandle> {
  const handle = await ensureDirectoryAccess();
  try {
    return await handle.getDirectoryHandle('notes', { create: true });
  } catch (error) {
    logger.error('Error ensuring notes directory:', error);
    throw error;
  }
}

/**
 * Get or create a folder within the notes directory (supports nested folders)
 */
export async function ensureNotesFolder(folderPath: string): Promise<FileSystemDirectoryHandle> {
  const notesDir = await ensureNotesDirectory();
  
  if (!folderPath || folderPath.trim() === '') {
    // Return unfiled directory
    return await notesDir.getDirectoryHandle('unfiled', { create: true });
  }

  const normalizedPath = normalizeFolderPath(folderPath);
  if (!normalizedPath) {
    return await notesDir.getDirectoryHandle('unfiled', { create: true });
  }

  // Handle nested folders (e.g., "folder/sub-folder")
  const parts = normalizedPath.split('/').filter(p => p.length > 0);
  let currentDir = notesDir;

  for (const part of parts) {
    currentDir = await currentDir.getDirectoryHandle(part, { create: true });
  }

  return currentDir;
}

/**
 * Get all existing file slugs in a directory
 */
export async function getExistingSlugsInDirectory(
  dirHandle: FileSystemDirectoryHandle
): Promise<Set<string>> {
  const slugs = new Set<string>();
  try {
    // Type assertion for async iteration
    const dirHandleWithValues = dirHandle as FileSystemDirectoryHandle & {
      values(): AsyncIterableIterator<FileSystemHandle>;
    };
    for await (const entry of dirHandleWithValues.values()) {
      if (entry.kind === 'file') {
        const name = entry.name;
        // Remove extension to get slug
        const slug = name.replace(/\.(md|json)$/i, '');
        slugs.add(slug);
      }
    }
  } catch (error) {
    logger.error('Error reading directory for slugs:', error);
  }
  return slugs;
}

export interface NoteIndexEntry {
  id: string;
  title: string;
  folder?: string;
  filePath: string;
  created_at: string;
  updated_at: string;
}

export interface NotesIndex {
  version: string;
  lastUpdated: string;
  notes: NoteIndexEntry[];
}

// Cache the notes index in memory to prevent race conditions during rapid saves
let cachedNotesIndex: NotesIndex | null = null;

/**
 * Read notes index from notes-index.json
 */
export async function readNotesIndex(): Promise<NotesIndex | null> {
  // Return cached index if available
  if (cachedNotesIndex) {
    return cachedNotesIndex;
  }

  try {
    const notesDir = await ensureNotesDirectory();
    const fileHandle = await notesDir.getFileHandle('notes-index.json', { create: false });
    const file = await fileHandle.getFile();
    const text = await file.text();
    if (!text.trim()) {
      return null;
    }
    const index = JSON.parse(text);
    cachedNotesIndex = index;
    return index;
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      return null;
    }
    logger.error('Error reading notes index:', error);
    throw error;
  }
}

/**
 * Write notes index to notes-index.json
 */
export async function writeNotesIndex(notes: NoteIndexEntry[]): Promise<void> {
  try {
    const indexData: NotesIndex = {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      notes,
    };

    // Update cache immediately to prevent race conditions
    cachedNotesIndex = indexData;

    const notesDir = await ensureNotesDirectory();
    const fileHandle = await notesDir.getFileHandle('notes-index.json', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(indexData, null, 2));
    await writable.close();
  } catch (error) {
    logger.error('Error writing notes index:', error);
    throw error;
  }
}

/**
 * Read a note from its markdown file
 */
export async function readNoteFromFile(noteId: string): Promise<{
  id: string;
  title: string;
  content: string;
  folder?: string;
  created_at: string;
  updated_at: string;
} | null> {
  try {
    // First, try to find the note in the index
    const index = await readNotesIndex();
    if (!index) {
      return null;
    }

    const noteEntry = index.notes.find(n => n.id === noteId);
    if (!noteEntry) {
      return null;
    }

    // Read the actual file
    const notesDir = await ensureNotesDirectory();
    const filePath = noteEntry.filePath;
    const pathParts = filePath.split('/');
    const filename = pathParts[pathParts.length - 1];

    // Navigate to the folder if needed
    let dirHandle = notesDir;
    if (pathParts.length > 1) {
      for (let i = 0; i < pathParts.length - 1; i++) {
        dirHandle = await dirHandle.getDirectoryHandle(pathParts[i], { create: false });
      }
    }

    const fileHandle = await dirHandle.getFileHandle(filename, { create: false });
    const file = await fileHandle.getFile();
    const text = await file.text();

    const { metadata, content } = parseMarkdownWithFrontmatter(text);
    if (!metadata || metadata.id !== noteId) {
      logger.warn(`Note file metadata mismatch for ${noteId}`);
      return null;
    }

    return {
      id: metadata.id!,
      title: metadata.title!,
      content,
      folder: metadata.folder,
      created_at: metadata.created_at!,
      updated_at: metadata.updated_at!,
    };
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      return null;
    }
    logger.error(`Error reading note ${noteId}:`, error);
    throw error;
  }
}

/**
 * Write a note to its markdown file
 */
export async function writeNoteToFile(note: {
  id: string;
  title: string;
  content: string;
  folder?: string;
  created_at: string;
  updated_at: string;
}): Promise<void> {
  try {
    const notesDir = await ensureNotesDirectory();
    const folderDir = await ensureNotesFolder(note.folder || '');

    // Get existing slugs in the target directory
    const existingSlugs = await getExistingSlugsInDirectory(folderDir);

    // Check if note already exists in index to get current file path
    const index = await readNotesIndex();
    const existingNote = index?.notes.find(n => n.id === note.id);
    
    // If note exists and is in a different folder, we need to move it
    if (existingNote && existingNote.filePath) {
      const oldPathParts = existingNote.filePath.split('/');
      const oldFilename = oldPathParts[oldPathParts.length - 1];
      const oldSlug = oldFilename.replace(/\.md$/, '');

      const existingFolder = existingNote.folder || '';
      const newFolder = note.folder || '';

      // If folder changed, delete old file
      if (existingFolder !== newFolder) {
        try {
          let oldDirHandle = notesDir;
          if (oldPathParts.length > 1) {
            for (let i = 0; i < oldPathParts.length - 1; i++) {
              oldDirHandle = await oldDirHandle.getDirectoryHandle(oldPathParts[i], { create: false });
            }
          }
          await oldDirHandle.removeEntry(oldFilename, { recursive: false });
          // Remove old slug from existing slugs if it's in the same directory
          if (existingFolder === newFolder) {
            existingSlugs.delete(oldSlug);
          }
        } catch (error: any) {
          if (error.name !== 'NotFoundError') {
            logger.warn(`Could not delete old note file: ${error.message}`);
          }
        }
      } else {
        // Same folder - remove old slug so we can reuse or regenerate
        existingSlugs.delete(oldSlug);
      }
    }

    // Check if we can reuse the existing filename
    let filename: string;
    const existingFolder = existingNote?.folder || '';
    const newFolder = note.folder || '';

    if (existingNote && existingFolder === newFolder) {
      // If title hasn't changed (or we are in the same folder and it matches), try to reuse
      // We need to check if the current title still maps to the same slug or if we should force reuse
      // to avoid minor slug variations causing new files.
      // BUT, if the user explicitly changed the title, we usually want the filename to update.
      // However, if the slug generation is unstable or collides, we might want to stick to the old name.

      const oldPathParts = existingNote.filePath.split('/');
      const oldFilename = oldPathParts[oldPathParts.length - 1];
      const oldSlug = oldFilename.replace(/\.md$/, '');

      const newBaseSlug = createSlugFromTitle(note.title);

      // If the slug generated from the current title matches the old slug (ignoring uniqueness suffixes potentially),
      // or if we just want to be safe: check if the old filename still exists.

      // Ideally: If the title generates a DIFFERENT base slug, we rename.
      // If it generates the SAME base slug, we keep the old filename (even if it has a suffix like -1).

      // Let's check if the new title would generate a slug that "starts with" the old slug's base,
      // OR if we just want to reuse the filename if the title is effectively the same.

      // Simplest robust fix: If the note ID matches and we are in the same folder,
      // and the title generates a slug that matches the file's current slug (stripping potential uniqueness suffix?),
      // OR just strictly: if the title generates the SAME slug as before, reuse.

      // Better yet: If we are saving the *same note*, and the title hasn't changed enough to warrant a new slug, reuse.
      // Actually, if we just use the existing filename, we avoid the "create new file" issue entirely for content updates.
      // We only want to rename if the title CHANGED.

      if (existingNote.title === note.title) {
        // Title didn't change, reuse exact filename
        filename = oldFilename;
      } else {
        // Title changed, generate new slug
        const baseSlug = createSlugFromTitle(note.title);
        const isUntitled = !note.title || note.title.trim() === '' || note.title === 'Untitled';
        // We must remove the OLD slug from existingSlugs before generating the new one to avoid self-collision if we were to rename to same thing (unlikely if title changed)
        // But existingSlugs came from directory scan.
        existingSlugs.delete(oldSlug);

        const uniqueSlug = generateUniqueSlug(baseSlug, existingSlugs, isUntitled);
        filename = `${uniqueSlug}.md`;

        // Delete old file since we are renaming
        try {
          await folderDir.removeEntry(oldFilename, { recursive: false });
          logger.log(`Renaming note: deleted old file ${oldFilename}`);
        } catch (error: any) {
          if (error.name !== 'NotFoundError') {
            logger.warn(`Could not delete old note file during rename: ${error.message}`);
          }
        }
      }
    } else {
      // New note or moving folders
      const baseSlug = createSlugFromTitle(note.title);
      const isUntitled = !note.title || note.title.trim() === '' || note.title === 'Untitled';
      const uniqueSlug = generateUniqueSlug(baseSlug, existingSlugs, isUntitled);
      filename = `${uniqueSlug}.md`;
    }

    // Determine file path relative to notes directory
    const folderPath = note.folder ? normalizeFolderPath(note.folder) : '';
    const filePath = folderPath ? `${folderPath}/${filename}` : `unfiled/${filename}`;

    // Write the markdown file
    const metadata: NoteMetadata = {
      id: note.id,
      title: note.title,
      folder: note.folder,
      created_at: note.created_at,
      updated_at: note.updated_at,
    };

    const markdownContent = serializeMarkdownWithFrontmatter(metadata, note.content);
    const fileHandle = await folderDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(markdownContent);
    await writable.close();

    // Update index
    const currentIndex = await readNotesIndex();
    const indexNotes = currentIndex?.notes || [];
    const noteIndex = indexNotes.findIndex(n => n.id === note.id);

    const indexEntry = {
      id: note.id,
      title: note.title,
      folder: note.folder,
      filePath,
      created_at: note.created_at,
      updated_at: note.updated_at,
    };

    if (noteIndex >= 0) {
      indexNotes[noteIndex] = indexEntry;
    } else {
      indexNotes.push(indexEntry);
    }

    await writeNotesIndex(indexNotes);
  } catch (error) {
    logger.error(`Error writing note ${note.id}:`, error);
    throw error;
  }
}

/**
 * Delete a note file
 */
export async function deleteNoteFile(noteId: string): Promise<void> {
  try {
    const index = await readNotesIndex();
    if (!index) {
      return;
    }

    const noteEntry = index.notes.find(n => n.id === noteId);
    if (!noteEntry) {
      return;
    }

    // Delete the file
    const notesDir = await ensureNotesDirectory();
    const filePath = noteEntry.filePath;
    const pathParts = filePath.split('/');
    const filename = pathParts[pathParts.length - 1];

    let dirHandle = notesDir;
    if (pathParts.length > 1) {
      for (let i = 0; i < pathParts.length - 1; i++) {
        dirHandle = await dirHandle.getDirectoryHandle(pathParts[i], { create: false });
      }
    }

    await dirHandle.removeEntry(filename, { recursive: false });

    // Update index
    const updatedNotes = index.notes.filter(n => n.id !== noteId);
    await writeNotesIndex(updatedNotes);
  } catch (error: any) {
    if (error.name !== 'NotFoundError') {
      logger.error(`Error deleting note ${noteId}:`, error);
      throw error;
    }
  }
}

/**
 * Validate notes index against file system
 * Returns true if index is valid, false if it needs rebuilding
 */
export async function validateNotesIndex(): Promise<boolean> {
  try {
    const index = await readNotesIndex();
    if (!index || !index.notes || index.notes.length === 0) {
      // Empty index is valid if there are no files
      return true;
    }

    const notesDir = await ensureNotesDirectory();
    const indexFilePaths = new Set(index.notes.map(n => n.filePath));

    // Check if all files in index exist
    for (const noteEntry of index.notes) {
      try {
        const filePath = noteEntry.filePath;
        const pathParts = filePath.split('/');
        const filename = pathParts[pathParts.length - 1];

        let dirHandle = notesDir;
        if (pathParts.length > 1) {
          for (let i = 0; i < pathParts.length - 1; i++) {
            dirHandle = await dirHandle.getDirectoryHandle(pathParts[i], { create: false });
          }
        }

        await dirHandle.getFileHandle(filename, { create: false });
      } catch (error: any) {
        if (error.name === 'NotFoundError') {
          logger.warn(`Index entry points to missing file: ${noteEntry.filePath}`);
          return false;
        }
        throw error;
      }
    }

    // Check for orphaned files (files not in index) - this is less critical but good to catch
    // We'll do a quick check in the unfiled directory
    try {
      const unfiledDir = await notesDir.getDirectoryHandle('unfiled', { create: false });
      const unfiledDirWithValues = unfiledDir as FileSystemDirectoryHandle & {
        values(): AsyncIterableIterator<FileSystemHandle>;
      };
      for await (const entry of unfiledDirWithValues.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.md')) {
          const filePath = `unfiled/${entry.name}`;
          if (!indexFilePaths.has(filePath)) {
            logger.warn(`Found file not in index: ${filePath}`);
            // Don't fail validation for this, but log it
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'NotFoundError') {
        logger.warn('Error checking for orphaned files:', error);
      }
    }

    return true;
  } catch (error) {
    logger.error('Error validating notes index:', error);
    return false;
  }
}

/**
 * Rebuild notes index by scanning the file system
 */
export async function rebuildNotesIndex(): Promise<void> {
  try {
    logger.log('Rebuilding notes index from file system...');
    const notesDir = await ensureNotesDirectory();
    const notes: Array<{
      id: string;
      title: string;
      folder?: string;
      filePath: string;
      created_at: string;
      updated_at: string;
    }> = [];

    // Recursively scan directories
    async function scanDirectory(
      dirHandle: FileSystemDirectoryHandle,
      folderPath: string = ''
    ): Promise<void> {
      const dirHandleWithValues = dirHandle as FileSystemDirectoryHandle & {
        values(): AsyncIterableIterator<FileSystemHandle>;
      };
      for await (const entry of dirHandleWithValues.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.md')) {
          try {
            const fileHandle = await dirHandle.getFileHandle(entry.name, { create: false });
            const file = await fileHandle.getFile();
            const text = await file.text();
            const { metadata } = parseMarkdownWithFrontmatter(text);

            if (metadata && metadata.id && metadata.title) {
              const filePath = folderPath ? `${folderPath}/${entry.name}` : entry.name;
              notes.push({
                id: metadata.id,
                title: metadata.title,
                folder: metadata.folder,
                filePath,
                created_at: metadata.created_at || new Date().toISOString(),
                updated_at: metadata.updated_at || new Date().toISOString(),
              });
            }
          } catch (error) {
            logger.warn(`Error reading file ${entry.name}:`, error);
          }
        } else if (entry.kind === 'directory' && entry.name !== 'trash') {
          // Skip trash directory
          const newFolderPath = folderPath ? `${folderPath}/${entry.name}` : entry.name;
          const subDirHandle = await dirHandle.getDirectoryHandle(entry.name, { create: false });
          await scanDirectory(subDirHandle, newFolderPath);
        }
      }
    }

    await scanDirectory(notesDir);
    await writeNotesIndex(notes);
    logger.log(`Rebuilt notes index with ${notes.length} notes`);
  } catch (error) {
    logger.error('Error rebuilding notes index:', error);
    throw error;
  }
}

/**
 * Read all notes from the new file structure
 * Uses index for fast loading - only loads metadata, not content
 */
export async function readAllNotesFromDirectory(loadContent: boolean = false): Promise<Array<{
  id: string;
  title: string;
  content: string;
  folder?: string;
  created_at: string;
  updated_at: string;
}>> {
  try {
    const index = await readNotesIndex();
    if (!index || !index.notes || index.notes.length === 0) {
      return [];
    }

    // Fast path: return metadata from index without reading files
    if (!loadContent) {
      return index.notes.map(noteEntry => ({
        id: noteEntry.id,
        title: noteEntry.title,
        content: '', // Content not loaded
        folder: noteEntry.folder,
        created_at: noteEntry.created_at,
        updated_at: noteEntry.updated_at,
      }));
    }

    // Slow path: load full content for each note
    const notes: Array<{
      id: string;
      title: string;
      content: string;
      folder?: string;
      created_at: string;
      updated_at: string;
    }> = [];

    for (const noteEntry of index.notes) {
      const note = await readNoteFromFile(noteEntry.id);
      if (note) {
        notes.push(note);
      }
    }

    return notes;
  } catch (error) {
    logger.error('Error reading all notes from directory:', error);
    return [];
  }
}

// ============================================================================
// FLOWS DIRECTORY FUNCTIONS
// ============================================================================

/**
 * Get or create the flows directory
 */
export async function ensureFlowsDirectory(): Promise<FileSystemDirectoryHandle> {
  const handle = await ensureDirectoryAccess();
  try {
    return await handle.getDirectoryHandle('flows', { create: true });
  } catch (error) {
    logger.error('Error ensuring flows directory:', error);
    throw error;
  }
}

/**
 * Read a flow from its JSON file
 */
export async function readFlowFromFile(flowId: string): Promise<any | null> {
  try {
    const flowsDir = await ensureFlowsDirectory();
    
    // We need to search for the file by reading all files
    // Since we're using title-based slugs, we need to check each file
    const flowsDirWithValues = flowsDir as FileSystemDirectoryHandle & {
      values(): AsyncIterableIterator<FileSystemHandle>;
    };
    for await (const entry of flowsDirWithValues.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.json')) {
        try {
          const fileHandle = await flowsDir.getFileHandle(entry.name, { create: false });
          const file = await fileHandle.getFile();
          const text = await file.text();
          const flow = JSON.parse(text);
          if (flow.id === flowId) {
            return flow;
          }
        } catch (error) {
          // Skip invalid files
          continue;
        }
      }
    }
    return null;
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      return null;
    }
    logger.error(`Error reading flow ${flowId}:`, error);
    throw error;
  }
}

/**
 * Write a flow to its JSON file
 */
export async function writeFlowToFile(flow: {
  id: string;
  title: string;
  [key: string]: any;
}): Promise<void> {
  try {
    const flowsDir = await ensureFlowsDirectory();
    
    // Get existing slugs
    const existingSlugs = await getExistingSlugsInDirectory(flowsDir);
    
    // Check if flow already exists
    const existingFlow = await readFlowFromFile(flow.id);
    if (existingFlow) {
      // Find the existing file
      const flowsDirWithValues = flowsDir as FileSystemDirectoryHandle & {
        values(): AsyncIterableIterator<FileSystemHandle>;
      };
      for await (const entry of flowsDirWithValues.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.json')) {
          try {
            const fileHandle = await flowsDir.getFileHandle(entry.name, { create: false });
            const file = await fileHandle.getFile();
            const text = await file.text();
            const parsed = JSON.parse(text);
            if (parsed.id === flow.id) {
              // Delete old file if title changed
              const oldSlug = entry.name.replace(/\.json$/, '');
              if (oldSlug !== createSlugFromTitle(flow.title)) {
                await flowsDir.removeEntry(entry.name, { recursive: false });
                existingSlugs.delete(oldSlug);
              } else {
                // Same slug, just update the file
                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(flow, null, 2));
                await writable.close();
                return;
              }
              break;
            }
          } catch (error) {
            continue;
          }
        }
      }
    }

    // Generate unique slug
    const baseSlug = createSlugFromTitle(flow.title);
    const isUntitled = !flow.title || flow.title.trim() === '' || flow.title === 'Untitled';
    const uniqueSlug = generateUniqueSlug(baseSlug, existingSlugs, isUntitled);
    const filename = `${uniqueSlug}.json`;

    // Write the file
    const fileHandle = await flowsDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(flow, null, 2));
    await writable.close();
  } catch (error) {
    logger.error(`Error writing flow ${flow.id}:`, error);
    throw error;
  }
}

/**
 * Delete a flow file
 */
export async function deleteFlowFile(flowId: string): Promise<void> {
  try {
    const flowsDir = await ensureFlowsDirectory();
    
    // Find and delete the file
    const flowsDirWithValues = flowsDir as FileSystemDirectoryHandle & {
      values(): AsyncIterableIterator<FileSystemHandle>;
    };
    for await (const entry of flowsDirWithValues.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.json')) {
        try {
          const fileHandle = await flowsDir.getFileHandle(entry.name, { create: false });
          const file = await fileHandle.getFile();
          const text = await file.text();
          const flow = JSON.parse(text);
          if (flow.id === flowId) {
            await flowsDir.removeEntry(entry.name, { recursive: false });
            return;
          }
        } catch (error) {
          continue;
        }
      }
    }
  } catch (error: any) {
    if (error.name !== 'NotFoundError') {
      logger.error(`Error deleting flow ${flowId}:`, error);
      throw error;
    }
  }
}

/**
 * Read all flows from the flows directory
 */
export async function readAllFlowsFromDirectory(): Promise<any[]> {
  try {
    const flowsDir = await ensureFlowsDirectory();
    const flows: any[] = [];

    const flowsDirWithValues = flowsDir as FileSystemDirectoryHandle & {
      values(): AsyncIterableIterator<FileSystemHandle>;
    };
    for await (const entry of flowsDirWithValues.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.json')) {
        try {
          const fileHandle = await flowsDir.getFileHandle(entry.name, { create: false });
          const file = await fileHandle.getFile();
          const text = await file.text();
          const flow = JSON.parse(text);
          if (flow.id && flow.title) {
            flows.push(flow);
          }
        } catch (error) {
          logger.warn(`Error reading flow file ${entry.name}:`, error);
          continue;
        }
      }
    }

    return flows;
  } catch (error) {
    logger.error('Error reading all flows from directory:', error);
    return [];
  }
}

// ============================================================================
// CATEGORY STORAGE FUNCTIONS
// Categories are stored in flowCategories.json
// ============================================================================

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


