/**
 * Cloud Sync Library
 * Enables users to sync their notes to Firebase Realtime Database
 */

import { isFolderConfigured, hasDirectoryAccess, getDirectoryHandle } from './fileSystemStorage';
import { logger } from '../utils/logger';

export interface CloudConfig {
  apiKey: string;
  projectId: string;
  enabled: boolean;
}

const CONFIG_FILE = 'cloudConfig.json';

/**
 * Get cloud config from the user's directory
 */
export async function getCloudConfig(): Promise<CloudConfig | null> {
  try {
    if (!isFolderConfigured() || !hasDirectoryAccess()) {
      // Fallback to localStorage
      const stored = localStorage.getItem('pinn.cloudConfig');
      if (stored) {
        return JSON.parse(stored);
      }
      return null;
    }

    const dirHandle = getDirectoryHandle();
    if (!dirHandle) return null;

    const fileHandle = await dirHandle.getFileHandle(CONFIG_FILE, { create: false });
    const file = await fileHandle.getFile();
    const text = await file.text();

    if (!text.trim()) return null;

    const config = JSON.parse(text);
    return config;
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      return null;
    }
    logger.error('Error reading cloud config:', error);
    return null;
  }
}

/**
 * Save cloud config to the user's directory
 */
export async function saveCloudConfig(config: CloudConfig): Promise<void> {
  try {
    if (!isFolderConfigured() || !hasDirectoryAccess()) {
      // Fallback to localStorage
      localStorage.setItem('pinn.cloudConfig', JSON.stringify(config));
      return;
    }

    const dirHandle = getDirectoryHandle();
    if (!dirHandle) {
      throw new Error('No directory access');
    }

    const fileHandle = await dirHandle.getFileHandle(CONFIG_FILE, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(config, null, 2));
    await writable.close();
  } catch (error) {
    logger.error('Error saving cloud config:', error);
    // Fallback to localStorage
    localStorage.setItem('pinn.cloudConfig', JSON.stringify(config));
  }
}

/**
 * Clear cloud config
 */
export async function clearCloudConfig(): Promise<void> {
  try {
    if (!isFolderConfigured() || !hasDirectoryAccess()) {
      localStorage.removeItem('pinn.cloudConfig');
      return;
    }

    const dirHandle = getDirectoryHandle();
    if (!dirHandle) return;

    await dirHandle.removeEntry(CONFIG_FILE);
  } catch (error: any) {
    if (error.name !== 'NotFoundError') {
      logger.error('Error clearing cloud config:', error);
    }
    localStorage.removeItem('pinn.cloudConfig');
  }
}

/**
 * Sync state interface
 */
interface SyncState {
  timestamp: string;
  syncedNoteIds: string[];
  syncedFlowIds: string[];
}

const SYNC_STATE_KEY = 'pinn.lastSyncState';

/**
 * Get last sync state from localStorage
 */
function getLastSyncState(): SyncState | null {
  try {
    const stored = localStorage.getItem(SYNC_STATE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    logger.error('Error reading last sync state:', error);
  }
  return null;
}

/**
 * Save sync state to localStorage
 */
function saveLastSyncState(state: SyncState): void {
  try {
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    logger.error('Error saving last sync state:', error);
  }
}

/**
 * Calculate size of JSON string in bytes
 */
function getJsonSize(jsonString: string): number {
  return new Blob([jsonString]).size;
}

/**
 * Split array into chunks based on maximum size (in bytes)
 * @param array Array to chunk
 * @param maxSizeBytes Maximum size per chunk in bytes
 * @returns Array of chunks
 */
function chunkArray<T>(array: T[], maxSizeBytes: number): T[][] {
  const chunks: T[][] = [];
  let currentChunk: T[] = [];
  let currentSize = 0;

  for (const item of array) {
    const itemJson = JSON.stringify(item);
    const itemSize = new Blob([itemJson]).size;

    // If single item exceeds max size, include it anyway (will need to be handled separately)
    if (itemSize > maxSizeBytes) {
      logger.warn(`Item size (${itemSize} bytes) exceeds chunk size limit (${maxSizeBytes} bytes)`);
    }

    // Check if adding this item would exceed the limit
    if (currentSize + itemSize > maxSizeBytes && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentSize = 0;
    }

    currentChunk.push(item);
    currentSize += itemSize;
  }

  // Add remaining chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Chunk size limit: 200MB (safe margin under 256MB Realtime Database limit)
 */
const CHUNK_SIZE_LIMIT_BYTES = 200 * 1024 * 1024; // 200MB
const TARGET_CHUNK_SIZE_BYTES = 150 * 1024 * 1024; // 150MB per chunk

/**
 * Data file interface with optional chunking info
 */
interface DataFile {
  name: string;
  content: string;
  isChunked?: boolean;
  chunkIndex?: number;
  totalChunks?: number;
}

/**
 * Get all data files that need to be synced
 * @param selectedNoteIds Optional array of note IDs to include. If not provided, all notes are included.
 * @param selectedFlowIds Optional array of flow IDs to include. If not provided, all flows are included.
 * @returns Array of data files, with chunked files if needed
 */
async function getAllDataFiles(
  selectedNoteIds?: string[],
  selectedFlowIds?: string[]
): Promise<DataFile[]> {
  const dataFiles: DataFile[] = [];

  if (!isFolderConfigured() || !hasDirectoryAccess()) {
    // Read from localStorage (fallback)
    const notesData = localStorage.getItem('pinn.notes');
    const flowsData = localStorage.getItem('pinn.flows');
    const categoriesData = localStorage.getItem('pinn.flowCategories');
    const themeData = localStorage.getItem('pinn.theme');
    const cloudConfigData = localStorage.getItem('pinn.cloudConfig');

    // Filter notes if selection is provided
    if (notesData) {
      let notesContent = notesData;
      if (selectedNoteIds !== undefined) {
        try {
          const notes = JSON.parse(notesData);
          if (Array.isArray(notes)) {
            const filteredNotes = notes.filter((note: any) => selectedNoteIds.includes(note.id));
            notesContent = JSON.stringify(filteredNotes);
          }
        } catch (e) {
          logger.warn('Error filtering notes:', e);
        }
      }
      dataFiles.push({ name: 'notes.json', content: notesContent });
    }

    // Filter flows if selection is provided
    if (flowsData) {
      let flowsContent = flowsData;
      if (selectedFlowIds !== undefined) {
        try {
          const flows = JSON.parse(flowsData);
          if (Array.isArray(flows)) {
            const filteredFlows = flows.filter((flow: any) => selectedFlowIds.includes(flow.id));
            flowsContent = JSON.stringify(filteredFlows);
          }
        } catch (e) {
          logger.warn('Error filtering flows:', e);
        }
      }
      dataFiles.push({ name: 'flows.json', content: flowsContent });
    }

    if (categoriesData) dataFiles.push({ name: 'flowCategories.json', content: categoriesData });
    if (themeData) dataFiles.push({ name: 'theme.json', content: themeData });
    if (cloudConfigData) dataFiles.push({ name: 'cloudConfig.json', content: cloudConfigData });

    return dataFiles;
  }

  // Use new file structure
  const dirHandle = getDirectoryHandle();
  if (!dirHandle) return dataFiles;

  try {
    // Read notes from new structure
    const { readAllNotesFromDirectory } = await import('./fileSystemStorage');
    const allNotes = await readAllNotesFromDirectory(true); // Load full content for sync

    let notesToSync = allNotes;

    // Apply incremental sync filter if no specific selection and last sync exists
    const lastSync = getLastSyncState();
    if (lastSync && selectedNoteIds === undefined) {
      // Only sync notes that are new or have been updated since last sync
      notesToSync = allNotes.filter((note: any) => {
        const wasSynced = lastSync.syncedNoteIds.includes(note.id);
        const noteUpdated = new Date(note.updated_at);
        const lastSyncTime = new Date(lastSync.timestamp);
        // Include if: not synced before OR updated after last sync
        return !wasSynced || noteUpdated > lastSyncTime;
      });
      logger.log(
        `Incremental sync: ${notesToSync.length} of ${allNotes.length} notes changed since last sync`
      );
    } else if (selectedNoteIds !== undefined) {
      // Respect explicit selection
      notesToSync = allNotes.filter((note: any) => selectedNoteIds.includes(note.id));
    }

    // Check if chunking is needed for notes
    const notesJson = JSON.stringify(notesToSync);
    const notesSize = getJsonSize(notesJson);

    if (notesSize > CHUNK_SIZE_LIMIT_BYTES) {
      // Split into chunks
      const chunks = chunkArray(notesToSync, TARGET_CHUNK_SIZE_BYTES);
      logger.log(
        `Notes size (${(notesSize / (1024 * 1024)).toFixed(2)}MB) exceeds limit, splitting into ${chunks.length} chunks`
      );

      chunks.forEach((chunk, index) => {
        dataFiles.push({
          name: `notes_${index}.json`,
          content: JSON.stringify(chunk),
          isChunked: true,
          chunkIndex: index,
          totalChunks: chunks.length,
        });
      });
    } else {
      dataFiles.push({ name: 'notes.json', content: notesJson });
    }
  } catch (error) {
    logger.warn('Error reading notes for cloud sync:', error);
  }

  try {
    // Read flows from new structure
    const { readAllFlowsFromDirectory } = await import('./fileSystemStorage');
    const allFlows = await readAllFlowsFromDirectory();

    let flowsToSync = allFlows;

    // Apply incremental sync filter if no specific selection and last sync exists
    const lastSync = getLastSyncState();
    if (lastSync && selectedFlowIds === undefined) {
      // Only sync flows that are new or have been updated since last sync
      flowsToSync = allFlows.filter((flow: any) => {
        const wasSynced = lastSync.syncedFlowIds.includes(flow.id);
        const flowUpdated = flow.updated_at ? new Date(flow.updated_at) : new Date(0);
        const lastSyncTime = new Date(lastSync.timestamp);
        // Include if: not synced before OR updated after last sync
        return !wasSynced || flowUpdated > lastSyncTime;
      });
      logger.log(
        `Incremental sync: ${flowsToSync.length} of ${allFlows.length} flows changed since last sync`
      );
    } else if (selectedFlowIds !== undefined) {
      // Respect explicit selection
      flowsToSync = allFlows.filter((flow: any) => selectedFlowIds.includes(flow.id));
    }

    // Check if chunking is needed for flows
    const flowsJson = JSON.stringify(flowsToSync);
    const flowsSize = getJsonSize(flowsJson);

    if (flowsSize > CHUNK_SIZE_LIMIT_BYTES) {
      // Split into chunks
      const chunks = chunkArray(flowsToSync, TARGET_CHUNK_SIZE_BYTES);
      logger.log(
        `Flows size (${(flowsSize / (1024 * 1024)).toFixed(2)}MB) exceeds limit, splitting into ${chunks.length} chunks`
      );

      chunks.forEach((chunk, index) => {
        dataFiles.push({
          name: `flows_${index}.json`,
          content: JSON.stringify(chunk),
          isChunked: true,
          chunkIndex: index,
          totalChunks: chunks.length,
        });
      });
    } else {
      dataFiles.push({ name: 'flows.json', content: flowsJson });
    }
  } catch (error) {
    logger.warn('Error reading flows for cloud sync:', error);
  }

  // Read other files (categories, theme, cloudConfig)
  const otherFiles = ['flowCategories.json', 'theme.json', 'cloudConfig.json'];
  for (const fileName of otherFiles) {
    try {
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: false });
      const file = await fileHandle.getFile();
      const text = await file.text();
      if (text.trim()) {
        dataFiles.push({ name: fileName, content: text });
      }
    } catch (error: any) {
      if (error.name !== 'NotFoundError') {
        logger.warn(`Could not read ${fileName}:`, error);
      }
    }
  }

  return dataFiles;
}

/**
 * Download a specific file from Firebase Realtime Database
 * @param config Cloud configuration
 * @param dataPath Path to the data (e.g., "users/{userId}")
 * @param dbName Name of the database entry (e.g., "notes", "flows")
 * @returns The parsed content or null if not found
 */
export async function downloadFileFromCloud(
  config: CloudConfig,
  dataPath: string,
  dbName: string
): Promise<any | null> {
  const commonRegions = ['asia-southeast1', 'us-central1', 'europe-west1', 'asia-east1'];
  const downloadUrls = [
    ...commonRegions.map(
      region =>
        `https://${config.projectId}-default-rtdb.${region}.firebasedatabase.app/${dataPath}/${dbName}.json?auth=${config.apiKey}`
    ),
    `https://${config.projectId}.firebaseio.com/${dataPath}/${dbName}.json?auth=${config.apiKey}`,
  ];

  for (const url of downloadUrls) {
    try {
      let response = await fetch(url);

      if (response.ok) {
        const data = await response.json();
        if (data === null) {
          return null; // File doesn't exist
        }

        // Extract content from Realtime Database structure
        if (data && typeof data === 'object' && data !== null) {
          if (data.content !== undefined) {
            return data.content;
          } else if (Object.keys(data).length > 0) {
            return data;
          }
        }
        return data;
      } else if (response.status === 401 || response.status === 403) {
        // Try without auth
        const publicUrl = url.replace('?auth=' + config.apiKey, '');
        response = await fetch(publicUrl);
        if (response.ok) {
          const data = await response.json();
          if (data === null) {
            return null;
          }
          if (data && typeof data === 'object' && data !== null) {
            if (data.content !== undefined) {
              return data.content;
            } else if (Object.keys(data).length > 0) {
              return data;
            }
          }
          return data;
        }
      }
    } catch (err) {
      continue; // Try next URL
    }
  }

  return null; // Not found
}

/**
 * Merge arrays of items by ID, updating existing items and adding new ones
 * @param existingItems Existing items from cloud
 * @param newItems New items to merge
 * @returns Merged array
 */
function mergeItemsById(existingItems: any[], newItems: any[]): any[] {
  if (!Array.isArray(existingItems)) {
    existingItems = [];
  }
  if (!Array.isArray(newItems)) {
    newItems = [];
  }

  // Create a map of existing items by ID
  const existingMap = new Map<string, any>();
  existingItems.forEach((item: any) => {
    if (item && item.id) {
      existingMap.set(item.id, item);
    }
  });

  // Update or add new items
  newItems.forEach((item: any) => {
    if (item && item.id) {
      existingMap.set(item.id, item); // This will update existing or add new
    }
  });

  // Convert back to array
  return Array.from(existingMap.values());
}

/**
 * Upload data to Firebase Realtime Database
 * @param config Cloud configuration
 * @param onProgress Optional progress callback
 * @param selectedNoteIds Optional array of note IDs to sync. If not provided, all notes are synced.
 * @param selectedFlowIds Optional array of flow IDs to sync. If not provided, all flows are synced.
 */
export async function uploadToCloud(
  config: CloudConfig,
  onProgress?: (percent: number) => void,
  selectedNoteIds?: string[],
  selectedFlowIds?: string[]
): Promise<void> {
  if (!config.apiKey || !config.projectId) {
    throw new Error('Cloud configuration is incomplete');
  }

  // Create a timestamp for this sync
  const timestamp = new Date().toISOString();

  // Find the user ID that has existing data (so all devices sync to the same location)
  // If no existing data found, use current device's user ID
  const commonRegions = ['asia-southeast1', 'us-central1', 'europe-west1', 'asia-east1'];
  let targetUserId: string | null = null;

  // Try to find existing user ID with data
  for (const region of commonRegions) {
    try {
      // Try with auth first
      let usersUrl = `https://${config.projectId}-default-rtdb.${region}.firebasedatabase.app/users.json?auth=${config.apiKey}`;
      let response = await fetch(usersUrl);

      // If that fails, try without auth (test mode)
      if (!response.ok && (response.status === 401 || response.status === 403)) {
        usersUrl = `https://${config.projectId}-default-rtdb.${region}.firebasedatabase.app/users.json`;
        response = await fetch(usersUrl);
      }

      if (response.ok) {
        const usersData = await response.json();
        if (usersData && typeof usersData === 'object' && usersData !== null) {
          const userIds = Object.keys(usersData);
          if (userIds.length > 0) {
            // Use the first user ID found (or you could use the one with most recent data)
            targetUserId = userIds[0];
            logger.log(
              `Found existing user ID with data: ${targetUserId}, will sync to this location`
            );
            break;
          }
        }
      }
    } catch (err) {
      continue;
    }
  }

  // If no existing user ID found, use current device's user ID
  if (!targetUserId) {
    targetUserId = getUserId();
    logger.log(`No existing data found, using current device user ID: ${targetUserId}`);
  }

  const dataPath = `users/${targetUserId}`;

  // Download existing data from cloud for merging
  if (onProgress) {
    onProgress(5); // Initial progress
  }

  let existingNotes: any[] = [];
  let existingFlows: any[] = [];
  let existingFolders: string[] = [];
  let existingCategories: string[] = [];

  try {
    const existingNotesData = await downloadFileFromCloud(config, dataPath, 'notes');
    if (existingNotesData && Array.isArray(existingNotesData)) {
      existingNotes = existingNotesData;
    } else if (existingNotesData && typeof existingNotesData === 'object') {
      // Might be wrapped, try to extract
      existingNotes = Array.isArray(existingNotesData) ? existingNotesData : [];
    }

    const existingFlowsData = await downloadFileFromCloud(config, dataPath, 'flows');
    if (existingFlowsData && Array.isArray(existingFlowsData)) {
      existingFlows = existingFlowsData;
    } else if (existingFlowsData && typeof existingFlowsData === 'object') {
      existingFlows = Array.isArray(existingFlowsData) ? existingFlowsData : [];
    }

    const existingFoldersData = await downloadFileFromCloud(config, dataPath, 'folders');
    if (existingFoldersData && Array.isArray(existingFoldersData)) {
      existingFolders = existingFoldersData;
    }

    const existingCategoriesData = await downloadFileFromCloud(config, dataPath, 'flowCategories');
    if (existingCategoriesData && Array.isArray(existingCategoriesData)) {
      existingCategories = existingCategoriesData;
    }
  } catch (error) {
    logger.warn('Error downloading existing data for merge, will proceed with upload only:', error);
    // Continue with upload - this might be the first sync
  }

  if (onProgress) {
    onProgress(15); // After downloading existing data
  }

  // Get local data files (filtered if selections provided)
  const dataFiles = await getAllDataFiles(selectedNoteIds, selectedFlowIds);

  if (dataFiles.length === 0) {
    throw new Error('No data to sync');
  }

  // Merge notes - handle both chunked and non-chunked formats
  const notesChunksToMerge = dataFiles.filter(
    f => f.name.startsWith('notes_') && f.name.endsWith('.json')
  );
  const notesFileToMerge = dataFiles.find(f => f.name === 'notes.json');

  if (notesChunksToMerge.length > 0) {
    // Handle chunked notes
    try {
      // Collect all local notes from chunks
      const localNotes: any[] = [];
      notesChunksToMerge.forEach(chunk => {
        const chunkNotes = JSON.parse(chunk.content);
        if (Array.isArray(chunkNotes)) {
          localNotes.push(...chunkNotes);
        }
      });

      // Merge with existing notes
      const mergedNotes = mergeItemsById(existingNotes, localNotes);

      // Update chunks with merged data (re-chunk if needed)
      const mergedJson = JSON.stringify(mergedNotes);
      const mergedSize = getJsonSize(mergedJson);

      if (mergedSize > CHUNK_SIZE_LIMIT_BYTES) {
        // Re-chunk merged data
        const chunks = chunkArray(mergedNotes, TARGET_CHUNK_SIZE_BYTES);
        // Remove old chunks
        dataFiles.splice(
          dataFiles.findIndex(f => f.name.startsWith('notes_')),
          notesChunksToMerge.length
        );
        // Add new chunks
        chunks.forEach((chunk, index) => {
          dataFiles.push({
            name: `notes_${index}.json`,
            content: JSON.stringify(chunk),
            isChunked: true,
            chunkIndex: index,
            totalChunks: chunks.length,
          });
        });
      } else {
        // Convert back to single file
        dataFiles.splice(
          dataFiles.findIndex(f => f.name.startsWith('notes_')),
          notesChunksToMerge.length
        );
        dataFiles.push({ name: 'notes.json', content: mergedJson });
      }

      logger.log(
        `Merged notes: ${existingNotes.length} existing + ${localNotes.length} local = ${mergedNotes.length} total`
      );
    } catch (e) {
      logger.warn('Error merging chunked notes:', e);
    }
  } else if (notesFileToMerge) {
    // Handle non-chunked notes
    try {
      const localNotes = JSON.parse(notesFileToMerge.content);
      if (Array.isArray(localNotes)) {
        // Merge: update existing notes and add new ones, but keep all existing notes
        const mergedNotes = mergeItemsById(existingNotes, localNotes);
        notesFileToMerge.content = JSON.stringify(mergedNotes);
        logger.log(
          `Merged notes: ${existingNotes.length} existing + ${localNotes.length} local = ${mergedNotes.length} total`
        );
      }
    } catch (e) {
      logger.warn('Error merging notes:', e);
    }
  } else if (existingNotes.length > 0) {
    // If no local notes file but we have existing notes in cloud, preserve them
    dataFiles.push({ name: 'notes.json', content: JSON.stringify(existingNotes) });
  }

  // Merge flows - handle both chunked and non-chunked formats
  const flowsChunksToMerge = dataFiles.filter(
    f => f.name.startsWith('flows_') && f.name.endsWith('.json')
  );
  const flowsFileToMerge = dataFiles.find(f => f.name === 'flows.json');

  if (flowsChunksToMerge.length > 0) {
    // Handle chunked flows
    try {
      // Collect all local flows from chunks
      const localFlows: any[] = [];
      flowsChunksToMerge.forEach(chunk => {
        const chunkFlows = JSON.parse(chunk.content);
        if (Array.isArray(chunkFlows)) {
          localFlows.push(...chunkFlows);
        }
      });

      // Merge with existing flows
      const mergedFlows = mergeItemsById(existingFlows, localFlows);

      // Update chunks with merged data (re-chunk if needed)
      const mergedJson = JSON.stringify(mergedFlows);
      const mergedSize = getJsonSize(mergedJson);

      if (mergedSize > CHUNK_SIZE_LIMIT_BYTES) {
        // Re-chunk merged data
        const chunks = chunkArray(mergedFlows, TARGET_CHUNK_SIZE_BYTES);
        // Remove old chunks
        dataFiles.splice(
          dataFiles.findIndex(f => f.name.startsWith('flows_')),
          flowsChunksToMerge.length
        );
        // Add new chunks
        chunks.forEach((chunk, index) => {
          dataFiles.push({
            name: `flows_${index}.json`,
            content: JSON.stringify(chunk),
            isChunked: true,
            chunkIndex: index,
            totalChunks: chunks.length,
          });
        });
      } else {
        // Convert back to single file
        dataFiles.splice(
          dataFiles.findIndex(f => f.name.startsWith('flows_')),
          flowsChunksToMerge.length
        );
        dataFiles.push({ name: 'flows.json', content: mergedJson });
      }

      logger.log(
        `Merged flows: ${existingFlows.length} existing + ${localFlows.length} local = ${mergedFlows.length} total`
      );
    } catch (e) {
      logger.warn('Error merging chunked flows:', e);
    }
  } else if (flowsFileToMerge) {
    // Handle non-chunked flows
    try {
      const localFlows = JSON.parse(flowsFileToMerge.content);
      if (Array.isArray(localFlows)) {
        // Merge: update existing flows and add new ones, but keep all existing flows
        const mergedFlows = mergeItemsById(existingFlows, localFlows);
        flowsFileToMerge.content = JSON.stringify(mergedFlows);
        logger.log(
          `Merged flows: ${existingFlows.length} existing + ${localFlows.length} local = ${mergedFlows.length} total`
        );
      }
    } catch (e) {
      logger.warn('Error merging flows:', e);
    }
  } else if (existingFlows.length > 0) {
    // If no local flows file but we have existing flows in cloud, preserve them
    dataFiles.push({ name: 'flows.json', content: JSON.stringify(existingFlows) });
  }

  // Merge folders and categories (always merge, not replace)
  const foldersFile = dataFiles.find(f => f.name === 'folders.json');
  if (foldersFile) {
    try {
      const localFolders = JSON.parse(foldersFile.content);
      if (Array.isArray(localFolders)) {
        const mergedFolders = Array.from(new Set([...existingFolders, ...localFolders]));
        foldersFile.content = JSON.stringify(mergedFolders);
      }
    } catch (e) {
      logger.warn('Error merging folders:', e);
    }
  } else if (existingFolders.length > 0) {
    dataFiles.push({ name: 'folders.json', content: JSON.stringify(existingFolders) });
  }

  const categoriesFile = dataFiles.find(f => f.name === 'flowCategories.json');
  if (categoriesFile) {
    try {
      const localCategories = JSON.parse(categoriesFile.content);
      if (Array.isArray(localCategories)) {
        const mergedCategories = Array.from(new Set([...existingCategories, ...localCategories]));
        categoriesFile.content = JSON.stringify(mergedCategories);
      }
    } catch (e) {
      logger.warn('Error merging categories:', e);
    }
  } else if (existingCategories.length > 0) {
    dataFiles.push({ name: 'flowCategories.json', content: JSON.stringify(existingCategories) });
  }

  if (onProgress) {
    onProgress(25); // After merging
  }

  // Upload each file to Realtime Database
  let uploadedCount = 0;
  const totalFiles = dataFiles.length;

  for (const file of dataFiles) {
    try {
      // Use Firebase Realtime Database REST API
      // Try different URL formats - Firebase uses different formats for different regions
      const dbName = file.name.replace('.json', ''); // Remove .json extension

      // Try different URL formats - Firebase uses different formats based on region
      // New format: https://{projectId}-default-rtdb.{region}.firebasedatabase.app
      // Old format: https://{projectId}.firebaseio.com
      // Common regions: us-central1, asia-southeast1, europe-west1, etc.
      const commonRegions = ['asia-southeast1', 'us-central1', 'europe-west1', 'asia-east1'];
      const urlFormats = [
        // Try with common regions first (most likely to work)
        ...commonRegions.map(
          region =>
            `https://${config.projectId}-default-rtdb.${region}.firebasedatabase.app/${dataPath}/${dbName}.json`
        ),
        // Fallback to old format
        `https://${config.projectId}.firebaseio.com/${dataPath}/${dbName}.json`,
      ];

      // Parse the content to ensure it's valid JSON
      let parsedContent;
      try {
        parsedContent = JSON.parse(file.content);
      } catch {
        // If not valid JSON, store as string
        parsedContent = file.content;
      }

      const dataToUpload = {
        content: parsedContent,
        fileName: file.name,
        lastUpdated: timestamp,
      };

      let response: Response | null = null;
      let lastError: string = '';

      // Try each URL format
      for (const baseUrl of urlFormats) {
        try {
          // For Realtime Database, we can use the API key, but rules must allow it
          // Or we can use it without auth if rules allow public access (test mode)
          const dbUrl = `${baseUrl}?auth=${config.apiKey}`;

          response = await fetch(dbUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(dataToUpload),
          });

          if (response.ok) {
            break; // Success, exit loop
          } else if (response.status === 401 || response.status === 403) {
            // Try without auth parameter if rules allow public access
            const publicUrl = `${baseUrl}`;
            response = await fetch(publicUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(dataToUpload),
            });

            if (response.ok) {
              break; // Success with public access
            }
          }

          lastError = await response.text();
        } catch (err) {
          lastError = err instanceof Error ? err.message : 'Unknown error';
          continue; // Try next URL format
        }
      }

      if (!response || !response.ok) {
        const errorText = lastError || (await response?.text()) || 'Unknown error';
        logger.error('Upload error response:', errorText);
        logger.error('Tried URLs:', urlFormats);

        // Provide helpful error messages
        if (response?.status === 403) {
          throw new Error(
            'Permission denied. Please check your Realtime Database rules. Make sure they allow write access (test mode allows this).'
          );
        } else if (response?.status === 401) {
          throw new Error(
            'Authentication failed. Please check your API key and make sure Realtime Database is enabled.'
          );
        } else if (response?.status === 404) {
          throw new Error(
            'Database not found. Please verify: 1) Realtime Database is enabled in Firebase Console, 2) Your Project ID is correct, 3) Database URL is accessible. Check REALTIME_DB_SETUP.md for setup instructions.'
          );
        } else {
          throw new Error(`Upload failed (${response?.status || 'network error'}): ${errorText}`);
        }
      }

      uploadedCount++;
      if (onProgress) {
        // Progress from 25% to 95% (uploading files)
        const uploadProgress = 25 + Math.round((uploadedCount / totalFiles) * 70);
        onProgress(uploadProgress);
      }
    } catch (error) {
      logger.error(`Error uploading ${file.name}:`, error);

      // Check if it's a network error
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new Error(
          `Network error: Could not connect to Firebase. Please check your internet connection.`
        );
      }

      throw new Error(
        `Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Save sync metadata (use the same targetUserId we used for uploads)
  if (onProgress) {
    onProgress(95); // Before saving metadata
  }

  // Collect chunk info and synced IDs
  const notesChunksForMetadata = dataFiles.filter(
    f => f.name.startsWith('notes_') && f.name.endsWith('.json')
  );
  const flowsChunksForMetadata = dataFiles.filter(
    f => f.name.startsWith('flows_') && f.name.endsWith('.json')
  );
  const notesFileForMetadata = dataFiles.find(f => f.name === 'notes.json');
  const flowsFileForMetadata = dataFiles.find(f => f.name === 'flows.json');

  // Collect all synced note and flow IDs
  const syncedNoteIds: string[] = [];
  const syncedFlowIds: string[] = [];

  if (notesChunksForMetadata.length > 0) {
    notesChunksForMetadata.forEach(chunk => {
      try {
        const notes = JSON.parse(chunk.content);
        if (Array.isArray(notes)) {
          notes.forEach((note: any) => {
            if (note.id) syncedNoteIds.push(note.id);
          });
        }
      } catch (e) {
        logger.warn('Error parsing notes chunk for ID collection:', e);
      }
    });
  } else if (notesFileForMetadata) {
    try {
      const notes = JSON.parse(notesFileForMetadata.content);
      if (Array.isArray(notes)) {
        notes.forEach((note: any) => {
          if (note.id) syncedNoteIds.push(note.id);
        });
      }
    } catch (e) {
      logger.warn('Error parsing notes for ID collection:', e);
    }
  }

  if (flowsChunksForMetadata.length > 0) {
    flowsChunksForMetadata.forEach(chunk => {
      try {
        const flows = JSON.parse(chunk.content);
        if (Array.isArray(flows)) {
          flows.forEach((flow: any) => {
            if (flow.id) syncedFlowIds.push(flow.id);
          });
        }
      } catch (e) {
        logger.warn('Error parsing flows chunk for ID collection:', e);
      }
    });
  } else if (flowsFileForMetadata) {
    try {
      const flows = JSON.parse(flowsFileForMetadata.content);
      if (Array.isArray(flows)) {
        flows.forEach((flow: any) => {
          if (flow.id) syncedFlowIds.push(flow.id);
        });
      }
    } catch (e) {
      logger.warn('Error parsing flows for ID collection:', e);
    }
  }

  try {
    const commonRegions = ['asia-southeast1', 'us-central1', 'europe-west1', 'asia-east1'];
    const metadataUrls = [
      ...commonRegions.map(
        region =>
          `https://${config.projectId}-default-rtdb.${region}.firebasedatabase.app/${dataPath}/_metadata.json?auth=${config.apiKey}`
      ),
      `https://${config.projectId}.firebaseio.com/${dataPath}/_metadata.json?auth=${config.apiKey}`,
    ];

    const metadata = {
      lastSync: timestamp,
      lastSyncTimestamp: timestamp,
      filesCount: dataFiles.length,
      notesChunked: notesChunksForMetadata.length > 0,
      notesChunks: notesChunksForMetadata.length > 0 ? notesChunksForMetadata.length : undefined,
      flowsChunked: flowsChunksForMetadata.length > 0,
      flowsChunks: flowsChunksForMetadata.length > 0 ? flowsChunksForMetadata.length : undefined,
      syncedNoteIds: syncedNoteIds,
      syncedFlowIds: syncedFlowIds,
      changedNotesCount: syncedNoteIds.length,
      changedFlowsCount: syncedFlowIds.length,
    };

    for (const url of metadataUrls) {
      try {
        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(metadata),
        });

        if (response.ok) {
          break; // Success
        }
      } catch {
        // Try next URL or without auth
        try {
          const publicUrl = url.replace('?auth=' + config.apiKey, '');
          await fetch(publicUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(metadata),
          });
          break;
        } catch {
          continue;
        }
      }
    }

    // Save sync state locally after successful upload
    saveLastSyncState({
      timestamp,
      syncedNoteIds,
      syncedFlowIds,
    });
  } catch (error) {
    logger.warn('Could not save metadata, but files were uploaded successfully');
  }

  if (onProgress) {
    onProgress(100); // Complete
  }
}

/**
 * Download data from Firebase Realtime Database
 * @param config Cloud configuration
 * @param onProgress Optional progress callback
 * @param selectedNoteIds Optional array of note IDs to download. If not provided, all notes are downloaded.
 * @param selectedFlowIds Optional array of flow IDs to download. If not provided, all flows are downloaded.
 */
export async function downloadFromCloud(
  config: CloudConfig,
  onProgress?: (percent: number) => void,
  selectedNoteIds?: string[],
  selectedFlowIds?: string[]
): Promise<{ [key: string]: string }> {
  if (!config.apiKey || !config.projectId) {
    throw new Error('Cloud configuration is incomplete');
  }

  // Try to discover what data exists in the database
  // Since rules only allow access to /users/$userId (not /users), we need to try different approaches
  const userId = getUserId();
  logger.log(`Downloading from database, projectId: ${config.projectId}`);

  const commonRegions = ['asia-southeast1', 'us-central1', 'europe-west1', 'asia-east1'];
  let foundUserPath: string | null = null;

  // Strategy 1: Try to access /users.json without auth (test mode might allow this)
  for (const region of commonRegions) {
    try {
      // Try with auth first
      let usersUrl = `https://${config.projectId}-default-rtdb.${region}.firebasedatabase.app/users.json?auth=${config.apiKey}`;
      let response = await fetch(usersUrl);

      // If that fails, try without auth (test mode)
      if (!response.ok && (response.status === 401 || response.status === 403)) {
        usersUrl = `https://${config.projectId}-default-rtdb.${region}.firebasedatabase.app/users.json`;
        response = await fetch(usersUrl);
      }

      if (response.ok) {
        const usersData = await response.json();
        if (usersData && typeof usersData === 'object' && usersData !== null) {
          // Find the first user ID that has data
          const userIds = Object.keys(usersData);
          if (userIds.length > 0) {
            foundUserPath = `users/${userIds[0]}`;
            logger.log(`Found data at path: ${foundUserPath}`);
            break;
          }
        }
      }
    } catch (err) {
      // Try next region
      continue;
    }
  }

  // Strategy 2: If we can't list users (rules don't allow /users read), we need to try known user IDs
  // Since we can't discover them, we'll try the current user's path
  // But if that returns null for all files, we know it's the wrong user ID
  if (!foundUserPath) {
    foundUserPath = `users/${userId}`;
    logger.log(`Using current user path: ${foundUserPath}`);
    logger.warn(
      `Note: If downloads return null, the database rules may need to allow reading /users to discover user IDs. Current rules only allow /users/$userId access.`
    );
  }

  // First, try to download metadata to check for chunking
  let metadata: any = null;
  try {
    const metadataUrls = [
      ...commonRegions.map(
        region =>
          `https://${config.projectId}-default-rtdb.${region}.firebasedatabase.app/${foundUserPath}/_metadata.json?auth=${config.apiKey}`
      ),
      `https://${config.projectId}.firebaseio.com/${foundUserPath}/_metadata.json?auth=${config.apiKey}`,
    ];

    for (const url of metadataUrls) {
      try {
        let response = await fetch(url);
        if (!response.ok && (response.status === 401 || response.status === 403)) {
          response = await fetch(url.replace('?auth=' + config.apiKey, ''));
        }
        if (response.ok) {
          const data = await response.json();
          if (data && typeof data === 'object' && data !== null) {
            if (data.content !== undefined) {
              metadata = data.content;
            } else {
              metadata = data;
            }
            break;
          }
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    logger.warn('Could not download metadata, will try to detect chunks manually:', error);
  }

  const files = ['notes', 'folders', 'flows', 'flowCategories', 'theme', 'cloudConfig']; // Without .json extension
  const downloadedFiles: { [key: string]: string } = {};

  let downloadedCount = 0;

  // Helper function to download chunks
  const downloadChunks = async (baseName: string, chunkCount: number): Promise<string | null> => {
    const chunks: any[] = [];

    for (let i = 0; i < chunkCount; i++) {
      const chunkName = `${baseName}_${i}`;
      const downloadUrls = [
        ...commonRegions.map(
          region =>
            `https://${config.projectId}-default-rtdb.${region}.firebasedatabase.app/${foundUserPath}/${chunkName}.json?auth=${config.apiKey}`
        ),
        `https://${config.projectId}.firebaseio.com/${foundUserPath}/${chunkName}.json?auth=${config.apiKey}`,
      ];

      let chunkData: any = null;
      for (const url of downloadUrls) {
        try {
          let response = await fetch(url);
          if (!response.ok && (response.status === 401 || response.status === 403)) {
            response = await fetch(url.replace('?auth=' + config.apiKey, ''));
          }
          if (response.ok) {
            const data = await response.json();
            if (data && data !== null) {
              if (data.content !== undefined) {
                chunkData = data.content;
              } else {
                chunkData = data;
              }
              break;
            }
          }
        } catch {
          continue;
        }
      }

      if (chunkData) {
        const chunkContent = typeof chunkData === 'string' ? chunkData : JSON.stringify(chunkData);
        try {
          const parsed = JSON.parse(chunkContent);
          if (Array.isArray(parsed)) {
            chunks.push(...parsed);
          }
        } catch (e) {
          logger.warn(`Error parsing chunk ${chunkName}:`, e);
        }
      } else {
        logger.warn(`Could not download chunk ${chunkName}`);
      }
    }

    return chunks.length > 0 ? JSON.stringify(chunks) : null;
  };

  for (const dbName of files) {
    // Check if this file is chunked (notes or flows)
    const isChunked =
      (dbName === 'notes' && metadata?.notesChunked) ||
      (dbName === 'flows' && metadata?.flowsChunked);
    const chunkCount =
      dbName === 'notes' ? metadata?.notesChunks : dbName === 'flows' ? metadata?.flowsChunks : 0;

    if (isChunked && chunkCount > 0) {
      // Download chunks
      logger.log(`Downloading ${chunkCount} chunks for ${dbName}`);
      const mergedContent = await downloadChunks(dbName, chunkCount);
      if (mergedContent) {
        downloadedFiles[`${dbName}.json`] = mergedContent;
        downloadedCount++;
        if (onProgress) {
          onProgress(Math.round((downloadedCount / files.length) * 100));
        }
        continue; // Skip the regular download logic
      } else {
        logger.warn(`Failed to download chunks for ${dbName}, falling back to single file`);
        // Fall through to try single file
      }
    }

    // Regular download logic (for non-chunked files or fallback)
    try {
      // Use Firebase Realtime Database REST API
      // Try different URL formats with common regions
      // Use the found path (or current user path)
      const downloadUrls = [
        ...commonRegions.map(
          region =>
            `https://${config.projectId}-default-rtdb.${region}.firebasedatabase.app/${foundUserPath}/${dbName}.json?auth=${config.apiKey}`
        ),
        `https://${config.projectId}.firebaseio.com/${foundUserPath}/${dbName}.json?auth=${config.apiKey}`,
      ];

      let response: Response | null = null;
      let successfulUrl: string | null = null;

      // Try each URL format
      let downloadedData: any = null;
      for (const url of downloadUrls) {
        try {
          logger.log(
            `Trying to download ${dbName} from: ${url.replace(config.apiKey, 'API_KEY_HIDDEN')}`
          );
          response = await fetch(url);
          logger.log(`Response for ${dbName}: status=${response.status}, ok=${response.ok}`);

          if (response.ok) {
            const data = await response.json();
            logger.log(
              `Got data for ${dbName}, type: ${typeof data}, isNull: ${data === null}, isEmpty: ${data && typeof data === 'object' && data !== null && Object.keys(data).length === 0}, keys: ${data && typeof data === 'object' && data !== null ? Object.keys(data).join(',') : 'N/A'}`
            );

            // If data is null, it means the path exists but is empty - this is valid, skip it
            // But if we're using the wrong user ID, we should try to find the right one
            if (data === null) {
              logger.log(
                `Path exists but data is null for ${dbName} at ${foundUserPath} - this user ID may not have data`
              );
              // Don't break - continue to try other regions, but if all return null, we know this user ID is wrong
              continue;
            }

            // Accept any response that's not null
            if (data !== null && data !== undefined) {
              successfulUrl = url;
              downloadedData = data;
              logger.log(
                `Successfully found ${dbName} at ${url.replace(config.apiKey, 'API_KEY_HIDDEN')}`
              );
              break; // Success - exit the loop
            }
          } else if (response.status === 401 || response.status === 403) {
            // Try without auth
            const publicUrl = url.replace('?auth=' + config.apiKey, '');
            logger.log(`Trying without auth: ${publicUrl}`);
            response = await fetch(publicUrl);
            logger.log(
              `Public response for ${dbName}: status=${response.status}, ok=${response.ok}`
            );
            if (response.ok) {
              const data = await response.json();
              logger.log(
                `Got public data for ${dbName}, type: ${typeof data}, isNull: ${data === null}`
              );
              if (data !== null) {
                successfulUrl = publicUrl;
                downloadedData = data;
                logger.log(`Successfully found ${dbName} at public URL`);
                break; // Success with public access - exit the loop
              }
            }
          }
        } catch (err) {
          logger.log(`Error fetching ${url}:`, err);
          continue; // Try next URL
        }
      }

      if (successfulUrl && downloadedData !== null) {
        logger.log(
          `Successfully connected to ${dbName} at: ${successfulUrl.replace(config.apiKey, 'API_KEY_HIDDEN')}`
        );

        const data = downloadedData;

        // Debug: Log the actual data structure received
        logger.log(`Downloaded ${dbName}:`, {
          type: typeof data,
          hasContent: data?.content !== undefined,
          keys: data && typeof data === 'object' ? Object.keys(data) : 'N/A',
          sample: data && typeof data === 'object' ? JSON.stringify(data).substring(0, 200) : data,
        });

        // Extract content from Realtime Database structure
        // Data might be stored as { content: ..., fileName: ..., lastUpdated: ... }
        // or directly as the content itself
        let fileContent: string | null = null;

        if (data && typeof data === 'object' && data !== null) {
          if (data.content !== undefined) {
            // Wrapped structure: { content: ..., fileName: ..., lastUpdated: ... }
            fileContent =
              typeof data.content === 'string' ? data.content : JSON.stringify(data.content);
          } else if (Object.keys(data).length > 0) {
            // Direct object content - stringify the whole object
            fileContent = JSON.stringify(data);
          } else {
            // Empty object - might be valid (empty array/object in JSON)
            fileContent = JSON.stringify(data);
          }
        } else if (data !== null && data !== undefined) {
          // Direct content (string or other primitive)
          fileContent = typeof data === 'string' ? data : JSON.stringify(data);
        }

        if (fileContent !== null) {
          // Filter notes or flows if selections are provided
          if (dbName === 'notes' && selectedNoteIds !== undefined) {
            try {
              const notes = JSON.parse(fileContent);
              if (Array.isArray(notes)) {
                const filteredNotes = notes.filter((note: any) =>
                  selectedNoteIds.includes(note.id)
                );
                fileContent = JSON.stringify(filteredNotes);
                logger.log(
                  `Filtered notes: ${notes.length} total, ${filteredNotes.length} selected`
                );
              }
            } catch (e) {
              logger.warn('Error filtering notes:', e);
            }
          } else if (dbName === 'flows' && selectedFlowIds !== undefined) {
            try {
              const flows = JSON.parse(fileContent);
              if (Array.isArray(flows)) {
                const filteredFlows = flows.filter((flow: any) =>
                  selectedFlowIds.includes(flow.id)
                );
                fileContent = JSON.stringify(filteredFlows);
                logger.log(
                  `Filtered flows: ${flows.length} total, ${filteredFlows.length} selected`
                );
              }
            } catch (e) {
              logger.warn('Error filtering flows:', e);
            }
          }

          const fileName = `${dbName}.json`;
          downloadedFiles[fileName] = fileContent;

          downloadedCount++;
          if (onProgress) {
            onProgress(Math.round((downloadedCount / files.length) * 100));
          }
          logger.log(`Successfully extracted content for ${dbName}`);
        } else {
          logger.warn(
            `File ${dbName} downloaded but content could not be extracted. Data structure:`,
            typeof data,
            data
          );
        }
      } else if (response?.status === 404 || !successfulUrl) {
        // File doesn't exist - try checking for chunks (for notes/flows only)
        if ((dbName === 'notes' || dbName === 'flows') && !isChunked) {
          // Try to detect chunks by attempting to download chunk 0
          logger.log(`File ${dbName} not found, checking for chunks...`);
          const testChunkUrl = commonRegions.map(
            region =>
              `https://${config.projectId}-default-rtdb.${region}.firebasedatabase.app/${foundUserPath}/${dbName}_0.json?auth=${config.apiKey}`
          )[0];

          try {
            let testResponse = await fetch(testChunkUrl);
            if (!testResponse.ok && (testResponse.status === 401 || testResponse.status === 403)) {
              testResponse = await fetch(testChunkUrl.replace('?auth=' + config.apiKey, ''));
            }

            if (testResponse.ok) {
              // Chunks exist! Try to download them (we'll need to find how many)
              // For now, try up to 10 chunks
              logger.log(`Chunks detected for ${dbName}, attempting to download...`);
              for (let chunkCount = 1; chunkCount <= 10; chunkCount++) {
                const mergedContent = await downloadChunks(dbName, chunkCount);
                if (mergedContent) {
                  downloadedFiles[`${dbName}.json`] = mergedContent;
                  downloadedCount++;
                  if (onProgress) {
                    onProgress(Math.round((downloadedCount / files.length) * 100));
                  }
                  logger.log(`Successfully downloaded ${chunkCount} chunks for ${dbName}`);
                  break;
                }
              }
            } else {
              logger.log(`File ${dbName} not found in Realtime Database (404)`);
            }
          } catch {
            logger.log(`File ${dbName} not found in Realtime Database (tried all URL formats)`);
          }
        } else {
          logger.log(`File ${dbName} not found in Realtime Database (404)`);
        }
      } else {
        logger.warn(`Could not download ${dbName}: ${response?.status || 'network error'}`);
      }
    } catch (error) {
      logger.error(`Error downloading ${dbName}:`, error);

      // Check if it's a network error
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new Error(
          `Network error: Could not connect to Firebase. Please check your internet connection.`
        );
      }
      // Continue with other files
    }
  }

  // Log summary of what was downloaded
  logger.log(
    `Download complete. Files downloaded: ${Object.keys(downloadedFiles).length}`,
    Object.keys(downloadedFiles)
  );

  // Return whatever files were found, even if empty
  // This allows downloading partial data or handling empty cloud storage gracefully
  return downloadedFiles;
}

/**
 * Save downloaded data to the local directory
 */
export async function saveDownloadedData(data: { [key: string]: string }): Promise<void> {
  if (!isFolderConfigured() || !hasDirectoryAccess()) {
    // Save to localStorage
    for (const [fileName, content] of Object.entries(data)) {
      if (fileName === 'notes.json') {
        localStorage.setItem('pinn.notes', content);
      } else if (fileName === 'flows.json') {
        localStorage.setItem('pinn.flows', content);
      } else if (fileName === 'flowCategories.json') {
        localStorage.setItem('pinn.flowCategories', content);
      } else if (fileName === 'theme.json') {
        localStorage.setItem('pinn.theme', content);
      } else if (fileName === 'cloudConfig.json') {
        localStorage.setItem('pinn.cloudConfig', content);
      }
    }
    return;
  }

  const dirHandle = getDirectoryHandle();
  if (!dirHandle) {
    throw new Error('No directory access');
  }

  // Handle notes.json - save to new structure
  if (data['notes.json']) {
    try {
      const notes = JSON.parse(data['notes.json']);
      if (Array.isArray(notes)) {
        const { writeNoteToFile } = await import('./fileSystemStorage');
        for (const note of notes) {
          try {
            await writeNoteToFile(note);
          } catch (error) {
            logger.error(`Error saving note ${note.id}:`, error);
          }
        }
      }
    } catch (error) {
      logger.error('Error parsing notes.json:', error);
    }
  }

  // Handle flows.json - save to new structure
  if (data['flows.json']) {
    try {
      const flows = JSON.parse(data['flows.json']);
      if (Array.isArray(flows)) {
        const { writeFlowToFile } = await import('./fileSystemStorage');
        for (const flow of flows) {
          try {
            await writeFlowToFile(flow);
          } catch (error) {
            logger.error(`Error saving flow ${flow.id}:`, error);
          }
        }
      }
    } catch (error) {
      logger.error('Error parsing flows.json:', error);
    }
  }

  // Handle other files (categories, theme, cloudConfig)
  const otherFiles = ['flowCategories.json', 'theme.json', 'cloudConfig.json'];
  for (const fileName of otherFiles) {
    if (data[fileName]) {
      try {
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(data[fileName]);
        await writable.close();
      } catch (error) {
        logger.error(`Error saving ${fileName}:`, error);
        throw error;
      }
    }
  }
}

/**
 * Get or create a unique user ID for cloud storage
 */
export function getUserId(): string {
  let userId = localStorage.getItem('pinn.cloudUserId');

  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem('pinn.cloudUserId', userId);
  }

  return userId;
}

/**
 * Validate Firebase configuration
 */
export async function validateCloudConfig(config: CloudConfig): Promise<boolean> {
  try {
    if (!config.apiKey || !config.projectId) {
      return false;
    }

    // Try to access Realtime Database to verify configuration
    const dataPath = 'data';
    const commonRegions = ['asia-southeast1', 'us-central1', 'europe-west1', 'asia-east1'];
    const testUrls = [
      ...commonRegions.map(
        region =>
          `https://${config.projectId}-default-rtdb.${region}.firebasedatabase.app/${dataPath}/_metadata.json?auth=${config.apiKey}`
      ),
      `https://${config.projectId}.firebaseio.com/${dataPath}/_metadata.json?auth=${config.apiKey}`,
    ];

    // Try each URL format
    for (const url of testUrls) {
      try {
        // This will return 404 if data doesn't exist, but that's okay - we just want to verify the database is accessible
        let response = await fetch(url);

        // 200 (exists), 404 (doesn't exist but database is accessible), or 403/401 (auth issue)
        if (response.status === 200 || response.status === 404) {
          return true;
        }

        // If auth failed, try without auth (test mode allows this)
        if (response.status === 401 || response.status === 403) {
          const publicUrl = url.replace('?auth=' + config.apiKey, '');
          response = await fetch(publicUrl);
          if (response.status === 200 || response.status === 404) {
            return true;
          }
        }
      } catch {
        continue; // Try next URL format
      }
    }

    return false;
  } catch (error) {
    logger.error('Error validating cloud config:', error);
    return false;
  }
}
