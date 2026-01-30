import {
  readAllFlowsFromDirectory,
  writeFlowToFile,
  deleteFlowFile,
  readCategoriesFromFile,
  writeCategoriesToFile,
  isFolderConfigured,
  hasDirectoryAccess,
} from './fileSystemStorage';
import { logger } from '../utils/logger';

export interface FlowNode {
  id: string;
  noteId: string;
  position: { x: number; y: number };
  data: {
    label: string;
    color?: string;
    tags?: string[];
    completed?: boolean;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  color?: string;
}

export interface Flow {
  id: string;
  title: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  tags?: string[];
  // Optional category grouping. When undefined or empty, the flow is unfiled
  category?: string;
  created_at: string;
  updated_at: string;
}

// In-memory cache
let flowsCache: Flow[] | null = null;
let categoriesCache: string[] | null = null;
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

// Fallback to localStorage if file system is not configured
const STORAGE_KEY = 'pinn.flows';
const CATEGORIES_KEY = 'pinn.flowCategories';

/**
 * Normalize a flow to ensure it has all required properties
 */
function normalizeFlow(flow: any): Flow {
  return {
    ...flow,
    nodes: Array.isArray(flow.nodes) ? flow.nodes : [],
    edges: Array.isArray(flow.edges) ? flow.edges : [],
    tags: Array.isArray(flow.tags) ? flow.tags : [],
  };
}

/**
 * Normalize an array of flows
 */
function normalizeFlows(flows: any[]): Flow[] {
  return flows.map(normalizeFlow);
}

/**
 * Initialize flows storage - load data from file system or localStorage
 */
async function initialize(): Promise<void> {
  if (isInitialized) return;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      const folderConfigured = isFolderConfigured();
      let hasAccess = hasDirectoryAccess();
      logger.log('Flows storage initialization:', { folderConfigured, hasAccess });

      // If folder is configured but handle isn't available, try to restore it
      // This is important because initializeDirectoryHandle might have been called before
      // but failed silently, so we try again here with a small delay
      if (folderConfigured && !hasAccess) {
        logger.log(
          'Flows storage initialization: Folder configured but handle not available, attempting to restore...'
        );
        const { initializeDirectoryHandle } = await import('./fileSystemStorage');
        // Give a small delay to ensure any previous initialization attempts have completed
        await new Promise(resolve => setTimeout(resolve, 50));
        await initializeDirectoryHandle();
        hasAccess = hasDirectoryAccess();
        logger.log(
          'Flows storage initialization: After handle restoration attempt, hasAccess:',
          hasAccess
        );
      }

      if (folderConfigured && hasAccess) {
        // Load from file system using new structure
        logger.log('Loading flows and categories from file system (new structure)...');
        const loadedFlows = await readAllFlowsFromDirectory();
        const loadedCategories = await readCategoriesFromFile();

        // Only update cache if we got valid data (array, even if empty)
        if (Array.isArray(loadedFlows)) {
          flowsCache = normalizeFlows(loadedFlows);
        } else {
          logger.warn('Invalid flows data loaded, keeping existing cache or empty array');
          flowsCache = flowsCache ? normalizeFlows(flowsCache) : [];
        }

        if (Array.isArray(loadedCategories)) {
          categoriesCache = loadedCategories;
        } else {
          logger.warn('Invalid categories data loaded, keeping existing cache or empty array');
          categoriesCache = categoriesCache || [];
        }

        logger.log(
          `Initialized flows storage: ${flowsCache.length} flows, ${categoriesCache.length} categories`
        );
      } else {
        logger.log(
          'Using localStorage fallback for flows (folder configured:',
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
            const flows = Array.isArray(parsed) ? parsed : [];
            flowsCache = normalizeFlows(flows);
          } else {
            flowsCache = [];
          }
        } catch {
          flowsCache = [];
        }

        try {
          const raw = localStorage.getItem(CATEGORIES_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            categoriesCache = Array.isArray(parsed)
              ? parsed
                  .filter(x => typeof x === 'string')
                  .map(x => x.trim())
                  .filter(Boolean)
              : [];
          } else {
            categoriesCache = [];
          }
        } catch {
          categoriesCache = [];
        }
        logger.log(
          `Initialized flows storage from localStorage: ${flowsCache.length} flows, ${categoriesCache.length} categories`
        );
      }
    } catch (error) {
      logger.error('Error initializing flows storage:', error);
      flowsCache = [];
      categoriesCache = [];
    }
    isInitialized = true;
  })();

  return initializationPromise;
}

/**
 * Write flows to storage (file system or localStorage) - internal async version
 * Writes individual files for each flow
 */
async function writeAllAsync(flows: Flow[]): Promise<void> {
  flowsCache = flows;

  try {
    const folderConfigured = isFolderConfigured();
    const hasAccess = hasDirectoryAccess();

    logger.log('Writing flows:', { count: flows.length, folderConfigured, hasAccess });

    if (folderConfigured) {
      // If folder is configured, we MUST use file system
      if (hasAccess) {
        logger.log('Writing flows to file system (individual files)...');
        // Write each flow as an individual file
        for (const flow of flows) {
          try {
            await writeFlowToFile(flow);
          } catch (error) {
            logger.error(`Error writing flow ${flow.id}:`, error);
            // Continue with other flows
          }
        }
        logger.log('Successfully wrote all flows to file system');
      } else {
        // Try to restore the handle
        logger.warn('Folder configured but handle not available. Attempting to restore...');
        const { initializeDirectoryHandle } = await import('./fileSystemStorage');
        await initializeDirectoryHandle();

        if (hasDirectoryAccess()) {
          logger.log('Handle restored, writing to file system...');
          for (const flow of flows) {
            try {
              await writeFlowToFile(flow);
            } catch (error) {
              logger.error(`Error writing flow ${flow.id}:`, error);
            }
          }
          logger.log('Successfully wrote flows to file system after handle restoration');
        } else {
          logger.error(
            'ERROR: Folder is configured but cannot access directory handle! Data not persisted.'
          );
          localStorage.setItem(STORAGE_KEY, JSON.stringify(flows));
          logger.warn(
            'Wrote to localStorage as fallback - this should not happen if folder is configured!'
          );
        }
      }
    } else {
      // No folder configured, use localStorage
      logger.log('No folder configured, writing to localStorage');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(flows));
    }
  } catch (error) {
    logger.error('Error writing flows:', error);
    // Try localStorage as backup
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(flows));
      logger.warn('Wrote to localStorage as backup due to error');
    } catch (localError) {
      logger.error('Failed to write to localStorage backup:', localError);
    }
  }
}

/**
 * Read all flows from cache (synchronous)
 */
function readAll(): Flow[] {
  if (!isInitialized) {
    // Synchronous fallback - initialize will happen async
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const flows = Array.isArray(parsed) ? parsed : [];
        return normalizeFlows(flows);
      }
    } catch {
      // ignore
    }
    return [];
  }
  const flows = flowsCache || [];
  return normalizeFlows(flows);
}

/**
 * Write categories to storage
 */
async function writeCategories(categories: string[]): Promise<void> {
  const unique = Array.from(new Set(categories.map(c => (c || '').trim()).filter(Boolean)));
  categoriesCache = unique;

  try {
    const folderConfigured = isFolderConfigured();
    const hasAccess = hasDirectoryAccess();

    if (folderConfigured) {
      if (hasAccess) {
        await writeCategoriesToFile(unique);
      } else {
        // Try to restore handle
        const { initializeDirectoryHandle } = await import('./fileSystemStorage');
        await initializeDirectoryHandle();

        if (hasDirectoryAccess()) {
          await writeCategoriesToFile(unique);
        } else {
          logger.error(
            'ERROR: Cannot write categories - folder configured but handle unavailable!'
          );
          localStorage.setItem(CATEGORIES_KEY, JSON.stringify(unique));
        }
      }
    } else {
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(unique));
    }
  } catch (error) {
    logger.error('Error writing categories:', error);
    try {
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(unique));
    } catch (localError) {
      logger.error('Failed to write categories to localStorage backup:', localError);
    }
  }
}

/**
 * Read categories from cache
 */
function readCategories(): string[] {
  if (!isInitialized) {
    try {
      const raw = localStorage.getItem(CATEGORIES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
          ? parsed
              .filter(x => typeof x === 'string')
              .map(x => x.trim())
              .filter(Boolean)
          : [];
      }
    } catch {
      // ignore
    }
    return [];
  }
  return categoriesCache || [];
}

/**
 * Initialize flows storage (call this on app startup)
 */
export async function initFlowStorage(): Promise<void> {
  await initialize();
}

/**
 * Refresh flows storage from file system (useful after changing folder)
 */
export async function refreshFlowStorage(): Promise<void> {
  isInitialized = false;
  initializationPromise = null;
  await initialize();
}

// Synchronous wrapper (non-blocking write)
export function writeAll(flows: Flow[]): void {
  flowsCache = flows;
  writeAllAsync(flows).catch(logger.error);
}

export function getFlows(): Flow[] {
  return readAll();
}

export function getFlowById(id: string): Flow | null {
  return readAll().find(f => f.id === id) || null;
}

export function saveFlow(flow: Flow): Flow {
  const all = readAll();
  const index = all.findIndex(f => f.id === flow.id);
  const next: Flow = { ...flow, updated_at: new Date().toISOString() };
  if (index >= 0) {
    all[index] = next;
  } else {
    all.unshift(next);
  }
  flowsCache = all;

  // Write individual file
  if (isFolderConfigured() && hasDirectoryAccess()) {
    writeFlowToFile(next).catch(logger.error);
  } else {
    // Fallback to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
  return next;
}

export function createFlow(title: string): Flow {
  const now = new Date().toISOString();
  const flow: Flow = {
    id: crypto.randomUUID(),
    title: title || 'Untitled Flow',
    nodes: [],
    edges: [],
    tags: [],
    category: undefined,
    created_at: now,
    updated_at: now,
  };
  const all = readAll();
  all.unshift(flow);
  writeAll(all); // Non-blocking async write
  return flow;
}

export function deleteFlow(id: string): void {
  const all = readAll().filter(f => f.id !== id);
  flowsCache = all;

  // Delete individual file
  if (isFolderConfigured() && hasDirectoryAccess()) {
    deleteFlowFile(id).catch(logger.error);
  } else {
    // Fallback to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
}

export function addNoteToFlow(
  flowId: string,
  noteId: string,
  noteTitle: string,
  position?: { x: number; y: number }
): Flow | null {
  const flow = getFlowById(flowId);
  if (!flow) return null;

  // Check if note already exists in flow
  const existingNode = flow.nodes.find(n => n.noteId === noteId);
  if (existingNode) return flow;

  const newNode: FlowNode = {
    id: `node-${noteId}-${Date.now()}`,
    noteId,
    position: position || { x: Math.random() * 400, y: Math.random() * 400 },
    data: {
      label: noteTitle,
      color: '#e8935f',
    },
  };

  flow.nodes.push(newNode);
  return saveFlow(flow);
}

export function removeNodeFromFlow(flowId: string, nodeId: string): Flow | null {
  const flow = getFlowById(flowId);
  if (!flow) return null;

  flow.nodes = flow.nodes.filter(n => n.id !== nodeId);
  flow.edges = flow.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
  return saveFlow(flow);
}

/**
 * Check if a note is used as a node in any flow
 * Returns an array of flows that contain this note
 */
export function getFlowsContainingNote(
  noteId: string
): Array<{ flowId: string; flowTitle: string }> {
  const allFlows = readAll();
  const flowsContainingNote: Array<{ flowId: string; flowTitle: string }> = [];

  for (const flow of allFlows) {
    const node = flow.nodes.find(n => n.noteId === noteId);
    if (node) {
      flowsContainingNote.push({ flowId: flow.id, flowTitle: flow.title });
    }
  }

  return flowsContainingNote;
}

export function setFlowCategory(id: string, category: string | undefined): Flow | null {
  const all = readAll();
  const index = all.findIndex(f => f.id === id);
  if (index === -1) return null;
  const normalized = (category || '').trim();
  const next: Flow = {
    ...all[index],
    category: normalized || undefined,
    updated_at: new Date().toISOString(),
  };
  all[index] = next;
  writeAll(all); // Non-blocking async write
  if (normalized) {
    const list = readCategories();
    if (!list.includes(normalized)) {
      list.push(normalized);
      writeCategories(list).catch(logger.error); // Non-blocking async write
    }
  }
  return next;
}

export function getAllCategories(): string[] {
  const fromFlows = new Set<string>();
  for (const f of readAll()) {
    if (f.category && f.category.trim()) fromFlows.add(f.category.trim());
  }
  const fromList = new Set<string>(readCategories());
  const union = new Set<string>([...fromFlows, ...fromList]);
  return Array.from(union).sort((a, b) => a.localeCompare(b));
}

export function addCategory(name: string): void {
  const normalized = (name || '').trim();
  if (!normalized) return;
  const list = readCategories();
  if (!list.includes(normalized)) {
    list.push(normalized);
    writeCategories(list).catch(logger.error); // Non-blocking async write
  }
}

export function renameCategory(oldName: string, newName: string): { updatedCount: number } {
  const source = (oldName || '').trim();
  const target = (newName || '').trim();
  if (!source || !target || source === target) return { updatedCount: 0 };
  const all = readAll();
  let updated = 0;
  const next = all.map(f => {
    if ((f.category || '').trim() === source) {
      updated += 1;
      return { ...f, category: target, updated_at: new Date().toISOString() };
    }
    return f;
  });
  writeAll(next); // Non-blocking async write
  // update category list
  const list = readCategories().filter(c => c !== source);
  list.push(target);
  writeCategories(list).catch(logger.error); // Non-blocking async write
  return { updatedCount: updated };
}

export function deleteCategory(
  categoryName: string,
  mode: 'delete-flows' | 'move-to-unfiled'
): { affectedCount: number } {
  const target = (categoryName || '').trim();
  if (!target) return { affectedCount: 0 };
  const all = readAll();
  let affected = 0;
  let next: Flow[];
  if (mode === 'delete-flows') {
    const flowsInCategory = all.filter(f => (f.category || '').trim() === target);
    affected = flowsInCategory.length;

    // Move category and flows to trash
    if (isFolderConfigured() && hasDirectoryAccess()) {
      import('./trashStorage')
        .then(({ moveCategoryToTrash }) => {
          moveCategoryToTrash(target, flowsInCategory).catch(logger.error);
        })
        .catch(logger.error);
    }

    next = all.filter(f => {
      const isInCategory = (f.category || '').trim() === target;
      return !isInCategory;
    });
  } else {
    next = all.map(f => {
      if ((f.category || '').trim() === target) {
        affected += 1;
        return { ...f, category: undefined, updated_at: new Date().toISOString() };
      }
      return f;
    });
  }
  writeAll(next); // Non-blocking async write
  // remove category from list
  writeCategories(readCategories().filter(c => c !== target)).catch(logger.error); // Non-blocking async write
  return { affectedCount: affected };
}
