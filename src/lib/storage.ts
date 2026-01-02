import { 
  readNotesFromFile, 
  writeNotesToFile, 
  readFoldersFromFile, 
  writeFoldersToFile,
  isFolderConfigured,
  hasDirectoryAccess 
} from './fileSystemStorage';
import { logger } from '../utils/logger';

export interface Note {
  id: string;
  title: string;
  content: string;
  // Optional folder grouping. When undefined or empty, the note is unfiled
  folder?: string;
  created_at: string;
  updated_at: string;
}

// In-memory cache
let notesCache: Note[] | null = null;
let foldersCache: string[] | null = null;
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

// Fallback to localStorage if file system is not configured
const STORAGE_KEY = 'pinn.notes';
const FOLDERS_KEY = 'pinn.folders';

/**
 * Initialize storage - load data from file system or localStorage
 */
async function initialize(): Promise<void> {
  if (isInitialized) return;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      const folderConfigured = isFolderConfigured();
      let hasAccess = hasDirectoryAccess();
      logger.log('Storage initialization:', { folderConfigured, hasAccess });
      
      // If folder is configured but handle isn't available, try to restore it
      // This is important because initializeDirectoryHandle might have been called before
      // but failed silently, so we try again here with a small delay
      if (folderConfigured && !hasAccess) {
        logger.log('Storage initialization: Folder configured but handle not available, attempting to restore...');
        const { initializeDirectoryHandle } = await import('./fileSystemStorage');
        // Give a small delay to ensure any previous initialization attempts have completed
        await new Promise(resolve => setTimeout(resolve, 50));
        await initializeDirectoryHandle();
        hasAccess = hasDirectoryAccess();
        logger.log('Storage initialization: After handle restoration attempt, hasAccess:', hasAccess);
      }
      
      if (folderConfigured && hasAccess) {
        // Load from file system
        logger.log('Loading notes and folders from file system...');
        const loadedNotes = await readNotesFromFile();
        const loadedFolders = await readFoldersFromFile();
        
        // Only update cache if we got valid data (array, even if empty)
        // Don't overwrite with null or undefined
        if (Array.isArray(loadedNotes)) {
          notesCache = loadedNotes;
        } else {
          logger.warn('Invalid notes data loaded, keeping existing cache or empty array');
          notesCache = notesCache || [];
        }
        
        if (Array.isArray(loadedFolders)) {
          foldersCache = loadedFolders;
        } else {
          logger.warn('Invalid folders data loaded, keeping existing cache or empty array');
          foldersCache = foldersCache || [];
        }
        
        logger.log(`Initialized storage: ${notesCache.length} notes, ${foldersCache.length} folders`);
      } else {
        logger.log('Using localStorage fallback (folder configured:', folderConfigured, ', has access:', hasAccess, ')');
        // Fallback to localStorage
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            notesCache = Array.isArray(parsed) ? parsed as Note[] : [];
          } else {
            notesCache = [];
          }
        } catch {
          notesCache = [];
        }

        try {
          const raw = localStorage.getItem(FOLDERS_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            foldersCache = Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : [];
          } else {
            foldersCache = [];
          }
        } catch {
          foldersCache = [];
        }
        logger.log(`Initialized storage from localStorage: ${notesCache.length} notes, ${foldersCache.length} folders`);
      }
    } catch (error) {
      logger.error('Error initializing storage:', error);
      notesCache = [];
      foldersCache = [];
    }
    isInitialized = true;
  })();

  return initializationPromise;
}

/**
 * Write notes to storage (file system or localStorage) - internal async version
 */
async function writeAllAsync(notes: Note[]): Promise<void> {
  notesCache = notes;
  
  try {
    const folderConfigured = isFolderConfigured();
    const hasAccess = hasDirectoryAccess();
    
    logger.log('Writing notes:', { count: notes.length, folderConfigured, hasAccess });
    
    if (folderConfigured) {
      // If folder is configured, we MUST use file system
      // If handle isn't available, this is an error condition
      if (hasAccess) {
        logger.log('Writing notes to file system...');
        await writeNotesToFile(notes);
        logger.log('Successfully wrote notes to file system');
      } else {
        // Folder is configured but handle isn't available - this shouldn't happen
        // Try to restore the handle
        logger.warn('Folder configured but handle not available. Attempting to restore...');
        const { initializeDirectoryHandle } = await import('./fileSystemStorage');
        await initializeDirectoryHandle();
        
        if (hasDirectoryAccess()) {
          logger.log('Handle restored, writing to file system...');
          await writeNotesToFile(notes);
          logger.log('Successfully wrote notes to file system after handle restoration');
        } else {
          logger.error('ERROR: Folder is configured but cannot access directory handle! Data not persisted.');
          // Fall back to localStorage as emergency backup, but log warning
          localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
          logger.warn('Wrote to localStorage as fallback - this should not happen if folder is configured!');
        }
      }
    } else {
      // No folder configured, use localStorage
      logger.log('No folder configured, writing to localStorage');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    }
  } catch (error) {
    logger.error('Error writing notes:', error);
    // Still update cache even if write fails, but also try localStorage as backup
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
      logger.warn('Wrote to localStorage as backup due to error');
    } catch (localError) {
      logger.error('Failed to write to localStorage backup:', localError);
    }
  }
}

/**
 * Read all notes from cache (synchronous)
 */
function readAll(): Note[] {
  if (!isInitialized) {
    // Synchronous fallback - initialize will happen async
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed as Note[] : [];
      }
    } catch {
      // ignore
    }
    return [];
  }
  return notesCache || [];
}

/**
 * Write folders to storage
 */
async function writeFolders(folders: string[]): Promise<void> {
  const unique = Array.from(new Set(folders.map((f) => (f || '').trim()).filter(Boolean)));
  foldersCache = unique;
  
  try {
    const folderConfigured = isFolderConfigured();
    const hasAccess = hasDirectoryAccess();
    
    if (folderConfigured) {
      if (hasAccess) {
        await writeFoldersToFile(unique);
      } else {
        // Try to restore handle
        const { initializeDirectoryHandle } = await import('./fileSystemStorage');
        await initializeDirectoryHandle();
        
        if (hasDirectoryAccess()) {
          await writeFoldersToFile(unique);
        } else {
          logger.error('ERROR: Cannot write folders - folder configured but handle unavailable!');
          localStorage.setItem(FOLDERS_KEY, JSON.stringify(unique));
        }
      }
    } else {
      localStorage.setItem(FOLDERS_KEY, JSON.stringify(unique));
    }
  } catch (error) {
    logger.error('Error writing folders:', error);
    try {
      localStorage.setItem(FOLDERS_KEY, JSON.stringify(unique));
    } catch (localError) {
      logger.error('Failed to write folders to localStorage backup:', localError);
    }
  }
}

/**
 * Read folders from cache
 */
function readFolders(): string[] {
  if (!isInitialized) {
    try {
      const raw = localStorage.getItem(FOLDERS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : [];
      }
    } catch {
      // ignore
    }
    return [];
  }
  return foldersCache || [];
}

/**
 * Initialize storage (call this on app startup)
 */
export async function initStorage(): Promise<void> {
  await initialize();
}

/**
 * Refresh storage from file system (useful after changing folder)
 */
export async function refreshStorage(): Promise<void> {
  isInitialized = false;
  initializationPromise = null;
  await initialize();
}

export function getNotes(): Note[] {
  return readAll();
}

export function getNoteById(id: string): Note | null {
  return readAll().find((n) => n.id === id) || null;
}

// Sync wrapper for saveNote (non-blocking)
export function saveNote(note: Note): Note {
  const all = readAll();
  const index = all.findIndex((n) => n.id === note.id);
  const next: Note = { ...note, updated_at: new Date().toISOString() };
  if (index >= 0) {
    all[index] = next;
  } else {
    all.unshift(next);
  }
  writeAll(all); // Non-blocking async write
  return next;
}

// Async version
export async function saveNoteAsync(note: Note): Promise<Note> {
  const all = readAll();
  const index = all.findIndex((n) => n.id === note.id);
  const next: Note = { ...note, updated_at: new Date().toISOString() };
  if (index >= 0) {
    all[index] = next;
  } else {
    all.unshift(next);
  }
  await writeAllAsync(all);
  return next;
}

export function createNote(title: string, content: string): Note {
  const now = new Date().toISOString();
  const note: Note = {
    id: crypto.randomUUID(),
    title: title || 'Untitled',
    content,
    folder: undefined,
    created_at: now,
    updated_at: now,
  };
  const all = readAll();
  all.unshift(note);
  writeAll(all); // Non-blocking async write
  return note;
}

export function deleteNote(id: string): void {
  const all = readAll().filter((n) => n.id !== id);
  writeAll(all); // Non-blocking async write
}

export function setNoteFolder(id: string, folder: string | undefined): Note | null {
  const all = readAll();
  const index = all.findIndex((n) => n.id === id);
  if (index === -1) return null;
  const normalized = (folder || '').trim();
  const next: Note = { ...all[index], folder: normalized || undefined, updated_at: new Date().toISOString() };
  all[index] = next;
  writeAll(all); // Non-blocking async write
  if (normalized) {
    const list = readFolders();
    if (!list.includes(normalized)) {
      list.push(normalized);
      writeFolders(list).catch(logger.error); // Non-blocking async write
    }
  }
  return next;
}

export function getAllFolders(): string[] {
  const fromNotes = new Set<string>();
  for (const n of readAll()) {
    if (n.folder && n.folder.trim()) fromNotes.add(n.folder.trim());
  }
  const fromList = new Set<string>(readFolders());
  const union = new Set<string>([...fromNotes, ...fromList]);
  return Array.from(union).sort((a, b) => a.localeCompare(b));
}

export function addFolder(name: string): void {
  const normalized = (name || '').trim();
  if (!normalized) return;
  const list = readFolders();
  if (!list.includes(normalized)) {
    list.push(normalized);
    writeFolders(list).catch(logger.error); // Non-blocking async write
  }
}

export function renameFolder(oldName: string, newName: string): { updatedCount: number } {
  const source = (oldName || '').trim();
  const target = (newName || '').trim();
  if (!source || !target || source === target) return { updatedCount: 0 };
  const all = readAll();
  let updated = 0;
  const next = all.map((n) => {
    if ((n.folder || '').trim() === source) {
      updated += 1;
      return { ...n, folder: target, updated_at: new Date().toISOString() };
    }
    return n;
  });
  writeAll(next); // Non-blocking async write
  // update folder list
  const list = readFolders().filter((f) => f !== source);
  list.push(target);
  writeFolders(list).catch(logger.error); // Non-blocking async write
  return { updatedCount: updated };
}

export function deleteFolder(
  folderName: string,
  mode: 'delete-notes' | 'move-to-unfiled'
): { affectedCount: number } {
  const target = (folderName || '').trim();
  if (!target) return { affectedCount: 0 };
  const all = readAll();
  let affected = 0;
  let next: Note[];
  if (mode === 'delete-notes') {
    next = all.filter((n) => {
      const isInFolder = (n.folder || '').trim() === target;
      if (isInFolder) affected += 1;
      return !isInFolder;
    });
  } else {
    next = all.map((n) => {
      if ((n.folder || '').trim() === target) {
        affected += 1;
        return { ...n, folder: undefined, updated_at: new Date().toISOString() };
      }
      return n;
    });
  }
  writeAll(next); // Non-blocking async write
  // remove folder from list
  writeFolders(readFolders().filter((f) => f !== target)).catch(logger.error); // Non-blocking async write
  return { affectedCount: affected };
}

// Synchronous wrapper for backward compatibility (non-blocking write)
export function writeAll(notes: Note[]): void {
  notesCache = notes;
  writeAllAsync(notes).catch(logger.error);
}
