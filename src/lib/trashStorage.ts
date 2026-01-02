/**
 * Trash storage system for managing deleted items
 * Moves deleted items to trash/ folder with ability to restore
 */

import { logger } from '../utils/logger';
import {
  ensureDirectoryAccess,
  getDirectoryHandle,
  isFolderConfigured,
  hasDirectoryAccess,
  readNoteFromFile,
  writeNoteToFile,
  deleteNoteFile,
  readNotesIndex,
  writeNotesIndex,
  ensureNotesDirectory,
  ensureNotesFolder,
  readFlowFromFile,
  writeFlowToFile,
  deleteFlowFile,
  ensureFlowsDirectory,
} from './fileSystemStorage';
import { normalizeFolderPath } from './markdownUtils';
import type { Note } from './storage';
import type { Flow } from './flowStorage';

export interface TrashedItem {
  id: string;
  type: 'note' | 'flow' | 'folder' | 'category';
  title: string;
  originalPath: string;
  trashPath: string;
  originalFolder?: string;
  originalCategory?: string;
  deletedAt: string;
  metadata?: any;
}

interface TrashIndex {
  version: string;
  lastUpdated: string;
  items: TrashedItem[];
}

const TRASH_INDEX_FILE = 'trash-index.json';

/**
 * Get or create trash directory
 */
async function ensureTrashDirectory(): Promise<FileSystemDirectoryHandle> {
  const handle = await ensureDirectoryAccess();
  try {
    return await handle.getDirectoryHandle('trash', { create: true });
  } catch (error) {
    logger.error('Error ensuring trash directory:', error);
    throw error;
  }
}

/**
 * Get or create trash subdirectory (notes, flows, etc.)
 */
async function ensureTrashSubdirectory(subdir: string): Promise<FileSystemDirectoryHandle> {
  const trashDir = await ensureTrashDirectory();
  try {
    return await trashDir.getDirectoryHandle(subdir, { create: true });
  } catch (error) {
    logger.error(`Error ensuring trash subdirectory ${subdir}:`, error);
    throw error;
  }
}

/**
 * Read trash index
 */
async function readTrashIndex(): Promise<TrashIndex> {
  try {
    if (!isFolderConfigured() || !hasDirectoryAccess()) {
      return { version: '1.0', lastUpdated: new Date().toISOString(), items: [] };
    }

    const trashDir = await ensureTrashDirectory();
    try {
      const fileHandle = await trashDir.getFileHandle(TRASH_INDEX_FILE, { create: false });
      const file = await fileHandle.getFile();
      const text = await file.text();
      const index = JSON.parse(text) as TrashIndex;
      return index;
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        return { version: '1.0', lastUpdated: new Date().toISOString(), items: [] };
      }
      throw error;
    }
  } catch (error) {
    logger.error('Error reading trash index:', error);
    return { version: '1.0', lastUpdated: new Date().toISOString(), items: [] };
  }
}

/**
 * Write trash index
 */
async function writeTrashIndex(index: TrashIndex): Promise<void> {
  try {
    if (!isFolderConfigured() || !hasDirectoryAccess()) {
      return;
    }

    const trashDir = await ensureTrashDirectory();
    const fileHandle = await trashDir.getFileHandle(TRASH_INDEX_FILE, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(index, null, 2));
    await writable.close();
  } catch (error) {
    logger.error('Error writing trash index:', error);
    throw error;
  }
}

/**
 * Move a note to trash
 */
export async function moveNoteToTrash(noteId: string, originalFolder?: string): Promise<void> {
  try {
    if (!isFolderConfigured() || !hasDirectoryAccess()) {
      logger.warn('Cannot move note to trash: file system not configured');
      return;
    }

    // Read the note
    const note = await readNoteFromFile(noteId);
    if (!note) {
      logger.warn(`Note ${noteId} not found, cannot move to trash`);
      return;
    }

    // Read current index to get file path
    const notesIndex = await readNotesIndex();
    const noteEntry = notesIndex?.notes.find(n => n.id === noteId);
    if (!noteEntry) {
      logger.warn(`Note ${noteId} not found in index, cannot move to trash`);
      return;
    }

    // Move file to trash
    const notesDir = await ensureNotesDirectory();
    const trashNotesDir = await ensureTrashSubdirectory('notes');
    
    const pathParts = noteEntry.filePath.split('/');
    const filename = pathParts[pathParts.length - 1];
    
    // Read file content
    let dirHandle = notesDir;
    if (pathParts.length > 1) {
      for (let i = 0; i < pathParts.length - 1; i++) {
        dirHandle = await dirHandle.getDirectoryHandle(pathParts[i], { create: false });
      }
    }
    
    const sourceFile = await dirHandle.getFileHandle(filename, { create: false });
    const sourceFileContent = await (await sourceFile.getFile()).text();
    
    // Write to trash
    const trashFileHandle = await trashNotesDir.getFileHandle(filename, { create: true });
    const writable = await trashFileHandle.createWritable();
    await writable.write(sourceFileContent);
    await writable.close();
    
    // Delete from original location
    await dirHandle.removeEntry(filename, { recursive: false });
    
    // Update trash index
    const trashIndex = await readTrashIndex();
    const trashItem: TrashedItem = {
      id: noteId,
      type: 'note',
      title: note.title,
      originalPath: noteEntry.filePath,
      trashPath: `trash/notes/${filename}`,
      originalFolder: originalFolder || note.folder,
      deletedAt: new Date().toISOString(),
      metadata: {
        content: note.content,
        created_at: note.created_at,
        updated_at: note.updated_at,
      },
    };
    
    trashIndex.items.push(trashItem);
    trashIndex.lastUpdated = new Date().toISOString();
    await writeTrashIndex(trashIndex);
    
    // Remove from notes index
    const updatedNotes = notesIndex.notes.filter(n => n.id !== noteId);
    await writeNotesIndex(updatedNotes);
    
    logger.log(`Moved note ${noteId} to trash`);
  } catch (error) {
    logger.error(`Error moving note ${noteId} to trash:`, error);
    throw error;
  }
}

/**
 * Move a flow to trash
 */
export async function moveFlowToTrash(flowId: string, originalCategory?: string): Promise<void> {
  try {
    if (!isFolderConfigured() || !hasDirectoryAccess()) {
      logger.warn('Cannot move flow to trash: file system not configured');
      return;
    }

    // Read the flow
    const flow = await readFlowFromFile(flowId);
    if (!flow) {
      logger.warn(`Flow ${flowId} not found, cannot move to trash`);
      return;
    }

    // Find flow file in flows directory
    const flowsDir = await ensureFlowsDirectory();
    const trashFlowsDir = await ensureTrashSubdirectory('flows');
    
    const flowsDirWithValues = flowsDir as FileSystemDirectoryHandle & {
      values(): AsyncIterableIterator<FileSystemHandle>;
    };
    
    let filename: string | null = null;
    for await (const entry of flowsDirWithValues.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.json')) {
        try {
          const fileHandle = await flowsDir.getFileHandle(entry.name, { create: false });
          const file = await fileHandle.getFile();
          const text = await file.text();
          const flowData = JSON.parse(text);
          if (flowData.id === flowId) {
            filename = entry.name;
            break;
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    if (!filename) {
      logger.warn(`Flow ${flowId} file not found, cannot move to trash`);
      return;
    }
    
    // Read file content
    const sourceFile = await flowsDir.getFileHandle(filename, { create: false });
    const sourceFileContent = await (await sourceFile.getFile()).text();
    
    // Write to trash
    const trashFileHandle = await trashFlowsDir.getFileHandle(filename, { create: true });
    const writable = await trashFileHandle.createWritable();
    await writable.write(sourceFileContent);
    await writable.close();
    
    // Delete from original location
    await flowsDir.removeEntry(filename, { recursive: false });
    
    // Update trash index
    const trashIndex = await readTrashIndex();
    const trashItem: TrashedItem = {
      id: flowId,
      type: 'flow',
      title: flow.title,
      originalPath: `flows/${filename}`,
      trashPath: `trash/flows/${filename}`,
      originalCategory: originalCategory || flow.category,
      deletedAt: new Date().toISOString(),
      metadata: flow,
    };
    
    trashIndex.items.push(trashItem);
    trashIndex.lastUpdated = new Date().toISOString();
    await writeTrashIndex(trashIndex);
    
    logger.log(`Moved flow ${flowId} to trash`);
  } catch (error) {
    logger.error(`Error moving flow ${flowId} to trash:`, error);
    throw error;
  }
}

/**
 * Move a folder to trash (moves all notes in folder)
 */
export async function moveFolderToTrash(folderName: string, notesInFolder: Note[]): Promise<void> {
  try {
    if (!isFolderConfigured() || !hasDirectoryAccess()) {
      logger.warn('Cannot move folder to trash: file system not configured');
      return;
    }

    // Move all notes in folder to trash
    for (const note of notesInFolder) {
      await moveNoteToTrash(note.id, folderName);
    }
    
    // Add folder metadata to trash index
    const trashIndex = await readTrashIndex();
    const folderItem: TrashedItem = {
      id: `folder-${folderName}`,
      type: 'folder',
      title: folderName,
      originalPath: `notes/${normalizeFolderPath(folderName)}`,
      trashPath: `trash/folders/${folderName}`,
      deletedAt: new Date().toISOString(),
      metadata: {
        noteIds: notesInFolder.map(n => n.id),
        noteCount: notesInFolder.length,
      },
    };
    
    trashIndex.items.push(folderItem);
    trashIndex.lastUpdated = new Date().toISOString();
    await writeTrashIndex(trashIndex);
    
    logger.log(`Moved folder ${folderName} to trash (${notesInFolder.length} notes)`);
  } catch (error) {
    logger.error(`Error moving folder ${folderName} to trash:`, error);
    throw error;
  }
}

/**
 * Move a category to trash (moves all flows in category)
 */
export async function moveCategoryToTrash(categoryName: string, flowsInCategory: Flow[]): Promise<void> {
  try {
    if (!isFolderConfigured() || !hasDirectoryAccess()) {
      logger.warn('Cannot move category to trash: file system not configured');
      return;
    }

    // Move all flows in category to trash
    for (const flow of flowsInCategory) {
      await moveFlowToTrash(flow.id, categoryName);
    }
    
    // Add category metadata to trash index
    const trashIndex = await readTrashIndex();
    const categoryItem: TrashedItem = {
      id: `category-${categoryName}`,
      type: 'category',
      title: categoryName,
      originalPath: `flows/category/${categoryName}`,
      trashPath: `trash/categories/${categoryName}`,
      deletedAt: new Date().toISOString(),
      metadata: {
        flowIds: flowsInCategory.map(f => f.id),
        flowCount: flowsInCategory.length,
      },
    };
    
    trashIndex.items.push(categoryItem);
    trashIndex.lastUpdated = new Date().toISOString();
    await writeTrashIndex(trashIndex);
    
    logger.log(`Moved category ${categoryName} to trash (${flowsInCategory.length} flows)`);
  } catch (error) {
    logger.error(`Error moving category ${categoryName} to trash:`, error);
    throw error;
  }
}

/**
 * Restore a note from trash
 */
export async function restoreNoteFromTrash(noteId: string): Promise<void> {
  try {
    if (!isFolderConfigured() || !hasDirectoryAccess()) {
      logger.warn('Cannot restore note from trash: file system not configured');
      return;
    }

    const trashIndex = await readTrashIndex();
    const trashItem = trashIndex.items.find(item => item.id === noteId && item.type === 'note');
    
    if (!trashItem) {
      logger.warn(`Note ${noteId} not found in trash`);
      return;
    }

    // Read note from trash
    const trashNotesDir = await ensureTrashSubdirectory('notes');
    const pathParts = trashItem.trashPath.split('/');
    const filename = pathParts[pathParts.length - 1];
    
    const trashFile = await trashNotesDir.getFileHandle(filename, { create: false });
    const fileContent = await (await trashFile.getFile()).text();
    
    // Parse markdown with frontmatter to get note data
    const { parseMarkdownWithFrontmatter } = await import('./markdownUtils');
    const { metadata, content } = parseMarkdownWithFrontmatter(fileContent);
    
    if (!metadata) {
      throw new Error('Invalid note format in trash');
    }
    
    // Restore to original location
    const note: Note = {
      id: metadata.id,
      title: metadata.title,
      content: content,
      folder: trashItem.originalFolder || metadata.folder,
      created_at: metadata.created_at,
      updated_at: metadata.updated_at,
    };
    
    await writeNoteToFile(note);
    
    // Delete from trash
    await trashNotesDir.removeEntry(filename, { recursive: false });
    
    // Remove from trash index
    trashIndex.items = trashIndex.items.filter(item => item.id !== noteId);
    trashIndex.lastUpdated = new Date().toISOString();
    await writeTrashIndex(trashIndex);
    
    logger.log(`Restored note ${noteId} from trash`);
  } catch (error) {
    logger.error(`Error restoring note ${noteId} from trash:`, error);
    throw error;
  }
}

/**
 * Restore a flow from trash
 */
export async function restoreFlowFromTrash(flowId: string): Promise<void> {
  try {
    if (!isFolderConfigured() || !hasDirectoryAccess()) {
      logger.warn('Cannot restore flow from trash: file system not configured');
      return;
    }

    const trashIndex = await readTrashIndex();
    const trashItem = trashIndex.items.find(item => item.id === flowId && item.type === 'flow');
    
    if (!trashItem) {
      logger.warn(`Flow ${flowId} not found in trash`);
      return;
    }

    // Read flow from trash
    const trashFlowsDir = await ensureTrashSubdirectory('flows');
    const pathParts = trashItem.trashPath.split('/');
    const filename = pathParts[pathParts.length - 1];
    
    const trashFile = await trashFlowsDir.getFileHandle(filename, { create: false });
    const fileContent = await (await trashFile.getFile()).text();
    const flow = JSON.parse(fileContent);
    
    // Restore to original location
    await writeFlowToFile(flow);
    
    // Delete from trash
    await trashFlowsDir.removeEntry(filename, { recursive: false });
    
    // Remove from trash index
    trashIndex.items = trashIndex.items.filter(item => item.id !== flowId);
    trashIndex.lastUpdated = new Date().toISOString();
    await writeTrashIndex(trashIndex);
    
    logger.log(`Restored flow ${flowId} from trash`);
  } catch (error) {
    logger.error(`Error restoring flow ${flowId} from trash:`, error);
    throw error;
  }
}

/**
 * Restore a folder from trash
 */
export async function restoreFolderFromTrash(folderName: string): Promise<void> {
  try {
    if (!isFolderConfigured() || !hasDirectoryAccess()) {
      logger.warn('Cannot restore folder from trash: file system not configured');
      return;
    }

    const trashIndex = await readTrashIndex();
    const folderItem = trashIndex.items.find(
      item => item.type === 'folder' && item.title === folderName
    );
    
    if (!folderItem || !folderItem.metadata?.noteIds) {
      logger.warn(`Folder ${folderName} not found in trash or has no notes`);
      return;
    }

    // Restore all notes in folder
    for (const noteId of folderItem.metadata.noteIds) {
      await restoreNoteFromTrash(noteId);
    }
    
    // Remove folder from trash index
    trashIndex.items = trashIndex.items.filter(
      item => !(item.type === 'folder' && item.title === folderName)
    );
    trashIndex.lastUpdated = new Date().toISOString();
    await writeTrashIndex(trashIndex);
    
    logger.log(`Restored folder ${folderName} from trash`);
  } catch (error) {
    logger.error(`Error restoring folder ${folderName} from trash:`, error);
    throw error;
  }
}

/**
 * Restore a category from trash
 */
export async function restoreCategoryFromTrash(categoryName: string): Promise<void> {
  try {
    if (!isFolderConfigured() || !hasDirectoryAccess()) {
      logger.warn('Cannot restore category from trash: file system not configured');
      return;
    }

    const trashIndex = await readTrashIndex();
    const categoryItem = trashIndex.items.find(
      item => item.type === 'category' && item.title === categoryName
    );
    
    if (!categoryItem || !categoryItem.metadata?.flowIds) {
      logger.warn(`Category ${categoryName} not found in trash or has no flows`);
      return;
    }

    // Restore all flows in category
    for (const flowId of categoryItem.metadata.flowIds) {
      await restoreFlowFromTrash(flowId);
    }
    
    // Remove category from trash index
    trashIndex.items = trashIndex.items.filter(
      item => !(item.type === 'category' && item.title === categoryName)
    );
    trashIndex.lastUpdated = new Date().toISOString();
    await writeTrashIndex(trashIndex);
    
    logger.log(`Restored category ${categoryName} from trash`);
  } catch (error) {
    logger.error(`Error restoring category ${categoryName} from trash:`, error);
    throw error;
  }
}

/**
 * Get all trashed notes
 */
export async function getTrashedNotes(): Promise<TrashedItem[]> {
  const trashIndex = await readTrashIndex();
  return trashIndex.items.filter(item => item.type === 'note');
}

/**
 * Get all trashed flows
 */
export async function getTrashedFlows(): Promise<TrashedItem[]> {
  const trashIndex = await readTrashIndex();
  return trashIndex.items.filter(item => item.type === 'flow');
}

/**
 * Get all trashed folders
 */
export async function getTrashedFolders(): Promise<TrashedItem[]> {
  const trashIndex = await readTrashIndex();
  return trashIndex.items.filter(item => item.type === 'folder');
}

/**
 * Get all trashed categories
 */
export async function getTrashedCategories(): Promise<TrashedItem[]> {
  const trashIndex = await readTrashIndex();
  return trashIndex.items.filter(item => item.type === 'category');
}

/**
 * Permanently delete a note from trash
 */
export async function permanentlyDeleteNote(noteId: string): Promise<void> {
  try {
    if (!isFolderConfigured() || !hasDirectoryAccess()) {
      logger.warn('Cannot permanently delete note: file system not configured');
      return;
    }

    const trashIndex = await readTrashIndex();
    const trashItem = trashIndex.items.find(item => item.id === noteId && item.type === 'note');
    
    if (!trashItem) {
      logger.warn(`Note ${noteId} not found in trash`);
      return;
    }

    // Delete file from trash
    const trashNotesDir = await ensureTrashSubdirectory('notes');
    const pathParts = trashItem.trashPath.split('/');
    const filename = pathParts[pathParts.length - 1];
    
    try {
      await trashNotesDir.removeEntry(filename, { recursive: false });
    } catch (error: any) {
      if (error.name !== 'NotFoundError') {
        logger.warn(`Could not delete file ${filename} from trash:`, error);
      }
    }
    
    // Remove from trash index
    trashIndex.items = trashIndex.items.filter(item => item.id !== noteId);
    trashIndex.lastUpdated = new Date().toISOString();
    await writeTrashIndex(trashIndex);
    
    logger.log(`Permanently deleted note ${noteId} from trash`);
  } catch (error) {
    logger.error(`Error permanently deleting note ${noteId}:`, error);
    throw error;
  }
}

/**
 * Permanently delete a flow from trash
 */
export async function permanentlyDeleteFlow(flowId: string): Promise<void> {
  try {
    if (!isFolderConfigured() || !hasDirectoryAccess()) {
      logger.warn('Cannot permanently delete flow: file system not configured');
      return;
    }

    const trashIndex = await readTrashIndex();
    const trashItem = trashIndex.items.find(item => item.id === flowId && item.type === 'flow');
    
    if (!trashItem) {
      logger.warn(`Flow ${flowId} not found in trash`);
      return;
    }

    // Delete file from trash
    const trashFlowsDir = await ensureTrashSubdirectory('flows');
    const pathParts = trashItem.trashPath.split('/');
    const filename = pathParts[pathParts.length - 1];
    
    try {
      await trashFlowsDir.removeEntry(filename, { recursive: false });
    } catch (error: any) {
      if (error.name !== 'NotFoundError') {
        logger.warn(`Could not delete file ${filename} from trash:`, error);
      }
    }
    
    // Remove from trash index
    trashIndex.items = trashIndex.items.filter(item => item.id !== flowId);
    trashIndex.lastUpdated = new Date().toISOString();
    await writeTrashIndex(trashIndex);
    
    logger.log(`Permanently deleted flow ${flowId} from trash`);
  } catch (error) {
    logger.error(`Error permanently deleting flow ${flowId}:`, error);
    throw error;
  }
}

/**
 * Permanently delete a folder from trash
 */
export async function permanentlyDeleteFolder(folderName: string): Promise<void> {
  try {
    if (!isFolderConfigured() || !hasDirectoryAccess()) {
      logger.warn('Cannot permanently delete folder: file system not configured');
      return;
    }

    const trashIndex = await readTrashIndex();
    const folderItem = trashIndex.items.find(
      item => item.type === 'folder' && item.title === folderName
    );
    
    if (!folderItem) {
      logger.warn(`Folder ${folderName} not found in trash`);
      return;
    }

    // Permanently delete all notes in folder
    if (folderItem.metadata?.noteIds) {
      for (const noteId of folderItem.metadata.noteIds) {
        await permanentlyDeleteNote(noteId);
      }
    }
    
    // Remove folder from trash index
    trashIndex.items = trashIndex.items.filter(
      item => !(item.type === 'folder' && item.title === folderName)
    );
    trashIndex.lastUpdated = new Date().toISOString();
    await writeTrashIndex(trashIndex);
    
    logger.log(`Permanently deleted folder ${folderName} from trash`);
  } catch (error) {
    logger.error(`Error permanently deleting folder ${folderName}:`, error);
    throw error;
  }
}

/**
 * Permanently delete a category from trash
 */
export async function permanentlyDeleteCategory(categoryName: string): Promise<void> {
  try {
    if (!isFolderConfigured() || !hasDirectoryAccess()) {
      logger.warn('Cannot permanently delete category: file system not configured');
      return;
    }

    const trashIndex = await readTrashIndex();
    const categoryItem = trashIndex.items.find(
      item => item.type === 'category' && item.title === categoryName
    );
    
    if (!categoryItem) {
      logger.warn(`Category ${categoryName} not found in trash`);
      return;
    }

    // Permanently delete all flows in category
    if (categoryItem.metadata?.flowIds) {
      for (const flowId of categoryItem.metadata.flowIds) {
        await permanentlyDeleteFlow(flowId);
      }
    }
    
    // Remove category from trash index
    trashIndex.items = trashIndex.items.filter(
      item => !(item.type === 'category' && item.title === categoryName)
    );
    trashIndex.lastUpdated = new Date().toISOString();
    await writeTrashIndex(trashIndex);
    
    logger.log(`Permanently deleted category ${categoryName} from trash`);
  } catch (error) {
    logger.error(`Error permanently deleting category ${categoryName}:`, error);
    throw error;
  }
}

/**
 * Empty trash (permanently delete all items)
 */
export async function emptyTrash(): Promise<void> {
  try {
    if (!isFolderConfigured() || !hasDirectoryAccess()) {
      logger.warn('Cannot empty trash: file system not configured');
      return;
    }

    const trashIndex = await readTrashIndex();
    
    // Permanently delete all items
    for (const item of trashIndex.items) {
      try {
        switch (item.type) {
          case 'note':
            await permanentlyDeleteNote(item.id);
            break;
          case 'flow':
            await permanentlyDeleteFlow(item.id);
            break;
          case 'folder':
            await permanentlyDeleteFolder(item.title);
            break;
          case 'category':
            await permanentlyDeleteCategory(item.title);
            break;
        }
      } catch (error) {
        logger.error(`Error deleting ${item.type} ${item.id} from trash:`, error);
        // Continue with other items
      }
    }
    
    // Clear trash index
    trashIndex.items = [];
    trashIndex.lastUpdated = new Date().toISOString();
    await writeTrashIndex(trashIndex);
    
    logger.log('Trash emptied');
  } catch (error) {
    logger.error('Error emptying trash:', error);
    throw error;
  }
}

