import {
  readAllNotesFromDirectory,
  readNoteFromFile,
  writeNoteToFile,
  validateNotesIndex,
  rebuildNotesIndex,
  isFolderConfigured,
  hasDirectoryAccess,
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
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;
let indexValidated = false; // Track if index has been validated on this load

// Fallback to localStorage if file system is not configured
const STORAGE_KEY = 'pinn.notes';

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
        logger.log(
          'Storage initialization: Folder configured but handle not available, attempting to restore...'
        );
        const { initializeDirectoryHandle } = await import('./fileSystemStorage');
        // Give a small delay to ensure any previous initialization attempts have completed
        await new Promise(resolve => setTimeout(resolve, 50));
        await initializeDirectoryHandle();
        hasAccess = hasDirectoryAccess();
        logger.log(
          'Storage initialization: After handle restoration attempt, hasAccess:',
          hasAccess
        );
      }

      if (folderConfigured && hasAccess) {
        // Load from index first (fast path - metadata only)
        logger.log('Loading notes from index (fast path)...');
        const loadedNotes = await readAllNotesFromDirectory(false); // false = don't load content

        // Only update cache if we got valid data (array, even if empty)
        // Don't overwrite with null or undefined
        if (Array.isArray(loadedNotes)) {
          notesCache = loadedNotes;
        } else {
          logger.warn('Invalid notes data loaded, keeping existing cache or empty array');
          notesCache = notesCache || [];
        }

        // Validate index once on app load
        if (!indexValidated) {
          logger.log('Validating notes index against file system...');
          const isValid = await validateNotesIndex();
          if (!isValid) {
            logger.warn('Index validation failed, rebuilding...');
            await rebuildNotesIndex();
            // Reload from rebuilt index
            const reloadedNotes = await readAllNotesFromDirectory(false);
            if (Array.isArray(reloadedNotes)) {
              notesCache = reloadedNotes;
            }
          }
          indexValidated = true;
        }

        logger.log(`Initialized storage: ${notesCache.length} notes (from index)`);

        // Trigger background hydration
        hydrateAllNotes().catch(err => logger.error('Background hydration failed:', err));
      } else {
        logger.log(
          'Using localStorage fallback (folder configured:',
          folderConfigured,
          ', has access:',
          hasAccess,
          ')'
        );
        // Fallback to localStorage
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            notesCache = Array.isArray(parsed) ? (parsed as Note[]) : [];
          } else {
            notesCache = [];
          }
        } catch {
          notesCache = [];
        }

        logger.log(`Initialized storage from localStorage: ${notesCache.length} notes`);
      }
    } catch (error) {
      logger.error('Error initializing storage:', error);
      notesCache = [];
    }
    isInitialized = true;
  })();

  return initializationPromise;
}

/**
 * Write notes to storage (file system or localStorage) - internal async version
 * Writes individual files for each note
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
        logger.log('Writing notes to file system (individual files)...');
        // Write each note as an individual file
        for (const note of notes) {
          try {
            await writeNoteToFile(note);
          } catch (error) {
            logger.error(`Error writing note ${note.id}:`, error);
            // Continue with other notes
          }
        }
        logger.log('Successfully wrote all notes to file system');
      } else {
        // Folder is configured but handle isn't available - this shouldn't happen
        // Try to restore the handle
        logger.warn('Folder configured but handle not available. Attempting to restore...');
        const { initializeDirectoryHandle } = await import('./fileSystemStorage');
        await initializeDirectoryHandle();

        if (hasDirectoryAccess()) {
          logger.log('Handle restored, writing to file system...');
          for (const note of notes) {
            try {
              await writeNoteToFile(note);
            } catch (error) {
              logger.error(`Error writing note ${note.id}:`, error);
            }
          }
          logger.log('Successfully wrote notes to file system after handle restoration');
        } else {
          logger.error(
            'ERROR: Folder is configured but cannot access directory handle! Data not persisted.'
          );
          // Fall back to localStorage as emergency backup, but log warning
          localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
          logger.warn(
            'Wrote to localStorage as fallback - this should not happen if folder is configured!'
          );
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
        return Array.isArray(parsed) ? (parsed as Note[]) : [];
      }
    } catch {
      // ignore
    }
    return [];
  }
  return notesCache || [];
}

/**
 * Read folders from the file system structure
 * Folders are now determined by the actual directory structure
 */
function readFolders(): string[] {
  // Folders are now determined by the file system structure
  // We get them from the notes index
  const folders = new Set<string>();
  const notes = readAll();
  for (const note of notes) {
    if (note.folder && note.folder.trim()) {
      folders.add(note.folder.trim());
    }
  }
  return Array.from(folders).sort((a, b) => a.localeCompare(b));
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
  indexValidated = false; // Reset validation flag
  await initialize();
}

export function getNotes(): Note[] {
  return readAll();
}

export function getNoteById(id: string): Note | null {
  const note = readAll().find(n => n.id === id);
  if (!note) {
    return null;
  }

  // If note has no content (loaded from index), we need to load it
  // This is lazy loading - content is only loaded when needed
  if (!note.content && isFolderConfigured() && hasDirectoryAccess()) {
    // Load content asynchronously (non-blocking)
    readNoteFromFile(id)
      .then(fullNote => {
        if (fullNote && notesCache) {
          const index = notesCache.findIndex(n => n.id === id);
          if (index >= 0) {
            notesCache[index] = fullNote;
          }
        }
      })
      .catch(error => {
        logger.error(`Error lazy loading note ${id}:`, error);
      });

    // Return note with empty content for now
    return note;
  }

  return note;
}

/**
 * Get note with content (forces content load if needed)
 */
export async function getNoteByIdWithContent(id: string): Promise<Note | null> {
  const note = readAll().find(n => n.id === id);
  if (!note) {
    return null;
  }

  // If note has no content, load it
  if (!note.content && isFolderConfigured() && hasDirectoryAccess()) {
    const fullNote = await readNoteFromFile(id);
    if (fullNote && notesCache) {
      const index = notesCache.findIndex(n => n.id === id);
      if (index >= 0) {
        notesCache[index] = fullNote;
        return fullNote;
      }
    }
    return fullNote;
  }

  return note;
}

// Sync wrapper for saveNote (non-blocking)
export function saveNote(note: Note): Note {
  const all = readAll();
  const index = all.findIndex(n => n.id === note.id);
  const next: Note = { ...note, updated_at: new Date().toISOString() };
  if (index >= 0) {
    all[index] = next;
  } else {
    all.unshift(next);
  }
  notesCache = all;
  // Write individual file
  if (isFolderConfigured() && hasDirectoryAccess()) {
    writeNoteToFile(next).catch(logger.error);
  } else {
    // Fallback to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
  return next;
}

// Async version
export async function saveNoteAsync(note: Note): Promise<Note> {
  const all = readAll();
  const index = all.findIndex(n => n.id === note.id);
  const next: Note = { ...note, updated_at: new Date().toISOString() };
  if (index >= 0) {
    all[index] = next;
  } else {
    all.unshift(next);
  }
  notesCache = all;

  // Write individual file
  if (isFolderConfigured() && hasDirectoryAccess()) {
    await writeNoteToFile(next);
  } else {
    // Fallback to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
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

export async function deleteNote(id: string): Promise<void> {
  const note = getNoteById(id);
  if (!note) {
    logger.warn(`Note ${id} not found, cannot delete`);
    return;
  }

  // Move to trash instead of deleting
  try {
    if (isFolderConfigured() && hasDirectoryAccess()) {
      const { moveNoteToTrash } = await import('./trashStorage');
      await moveNoteToTrash(id, note.folder);
    } else {
      // localStorage mode: move to localStorage trash
      const { moveNoteToTrashLocalStorage } = await import('./trashStorage');
      await moveNoteToTrashLocalStorage(note);
    }

    // Only remove from cache after successful trash operation
    const all = readAll().filter(n => n.id !== id);
    notesCache = all;

    // Update localStorage if not using file system
    if (!isFolderConfigured() || !hasDirectoryAccess()) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }
  } catch (error) {
    logger.error(`Error deleting note ${id}:`, error);
    // Don't update cache if trash operation failed - note should remain visible
    throw error;
  }
}

export function setNoteFolder(id: string, folder: string | undefined): Note | null {
  const all = readAll();
  const index = all.findIndex(n => n.id === id);
  if (index === -1) return null;
  const normalized = (folder || '').trim();
  const next: Note = {
    ...all[index],
    folder: normalized || undefined,
    updated_at: new Date().toISOString(),
  };
  all[index] = next;
  notesCache = all;

  // Write individual file (will move it to the correct folder)
  if (isFolderConfigured() && hasDirectoryAccess()) {
    writeNoteToFile(next).catch(logger.error);
  } else {
    // Fallback to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
  return next;
}

export function getAllFolders(): string[] {
  // Folders are now determined by the file system structure
  return readFolders();
}

export function addFolder(name: string): void {
  // Folders are now created automatically when notes are added to them
  // This function is kept for API compatibility but doesn't need to do anything
  // The folder will be created when a note is assigned to it
  logger.log(`addFolder called for: ${name} (folders are now managed by file system structure)`);
}

export function renameFolder(oldName: string, newName: string): { updatedCount: number } {
  const source = (oldName || '').trim();
  const target = (newName || '').trim();
  if (!source || !target || source === target) return { updatedCount: 0 };
  const all = readAll();
  let updated = 0;
  const notesToUpdate: Note[] = [];

  for (const note of all) {
    if ((note.folder || '').trim() === source) {
      updated += 1;
      const updatedNote: Note = { ...note, folder: target, updated_at: new Date().toISOString() };
      notesToUpdate.push(updatedNote);
    }
  }

  // Update each note file individually
  if (isFolderConfigured() && hasDirectoryAccess()) {
    for (const note of notesToUpdate) {
      const index = all.findIndex(n => n.id === note.id);
      if (index >= 0) {
        all[index] = note;
      }
      writeNoteToFile(note).catch(logger.error);
    }
  } else {
    // Fallback to localStorage
    for (const note of notesToUpdate) {
      const index = all.findIndex(n => n.id === note.id);
      if (index >= 0) {
        all[index] = note;
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  notesCache = all;
  return { updatedCount: updated };
}

export async function deleteFolder(
  folderName: string,
  mode: 'delete-notes' | 'move-to-unfiled'
): Promise<{ affectedCount: number }> {
  const target = (folderName || '').trim();
  if (!target) return { affectedCount: 0 };
  const all = readAll();
  let affected = 0;
  let next: Note[];

  if (mode === 'delete-notes') {
    const notesInFolder = all.filter(n => (n.folder || '').trim() === target);
    affected = notesInFolder.length;

    // Move folder and notes to trash
    try {
      const { moveFolderToTrash } = await import('./trashStorage');
      await moveFolderToTrash(target, notesInFolder);
    } catch (error) {
      logger.error(`Error moving folder ${target} to trash:`, error);
      throw error;
    }

    // Only remove from cache after successful trash operation
    next = all.filter(n => {
      const isInFolder = (n.folder || '').trim() === target;
      return !isInFolder;
    });
  } else {
    next = all.map(n => {
      if ((n.folder || '').trim() === target) {
        affected += 1;
        const updatedNote = { ...n, folder: undefined, updated_at: new Date().toISOString() };
        // Update the note file (will move to unfiled)
        if (isFolderConfigured() && hasDirectoryAccess()) {
          writeNoteToFile(updatedNote).catch(logger.error);
        }
        return updatedNote;
      }
      return n;
    });
  }

  notesCache = next;

  // Update localStorage if not using file system
  if (!isFolderConfigured() || !hasDirectoryAccess()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  return { affectedCount: affected };
}

// Synchronous wrapper (non-blocking write)
export function writeAll(notes: Note[]): void {
  notesCache = notes;
  writeAllAsync(notes).catch(logger.error);
}

/**
 * Background hydration of all notes content
 */
async function hydrateAllNotes(): Promise<void> {
  if (!isFolderConfigured() || !hasDirectoryAccess() || !notesCache) {
    return;
  }

  logger.log('Starting background hydration of notes content...');
  const notesToHydrate = notesCache.filter(n => !n.content);

  if (notesToHydrate.length === 0) {
    logger.log('All notes already hydrated');
    return;
  }

  logger.log(`Hydrating ${notesToHydrate.length} notes...`);

  // Process in small batches to avoid blocking UI
  const BATCH_SIZE = 5;
  for (let i = 0; i < notesToHydrate.length; i += BATCH_SIZE) {
    const batch = notesToHydrate.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async note => {
        try {
          const fullNote = await readNoteFromFile(note.id);
          if (fullNote && notesCache) {
            const index = notesCache.findIndex(n => n.id === note.id);
            if (index >= 0) {
              notesCache[index] = fullNote;
            }
          }
        } catch (error) {
          logger.error(`Error hydrating note ${note.id}:`, error);
        }
      })
    );
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  logger.log('Background hydration completed');
}
