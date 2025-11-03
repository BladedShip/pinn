export interface Note {
  id: string;
  title: string;
  content: string;
  // Optional folder grouping. When undefined or empty, the note is unfiled
  folder?: string;
  created_at: string;
  updated_at: string;
}

const STORAGE_KEY = 'pinn.notes';
const FOLDERS_KEY = 'pinn.folders';

function readAll(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Note[];
    return [];
  } catch {
    return [];
  }
}

export function writeAll(notes: Note[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function readFolders(): string[] {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
    return [];
  } catch {
    return [];
  }
}

function writeFolders(folders: string[]) {
  const unique = Array.from(new Set(folders.map((f) => (f || '').trim()).filter(Boolean)));
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(unique));
}

export function getNotes(): Note[] {
  return readAll();
}

export function getNoteById(id: string): Note | null {
  return readAll().find((n) => n.id === id) || null;
}

export function saveNote(note: Note): Note {
  const all = readAll();
  const index = all.findIndex((n) => n.id === note.id);
  const next: Note = { ...note, updated_at: new Date().toISOString() };
  if (index >= 0) {
    all[index] = next;
  } else {
    all.unshift(next);
  }
  writeAll(all);
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
  writeAll(all);
  return note;
}

export function deleteNote(id: string) {
  const all = readAll().filter((n) => n.id !== id);
  writeAll(all);
}

export function setNoteFolder(id: string, folder: string | undefined): Note | null {
  const all = readAll();
  const index = all.findIndex((n) => n.id === id);
  if (index === -1) return null;
  const normalized = (folder || '').trim();
  const next: Note = { ...all[index], folder: normalized || undefined, updated_at: new Date().toISOString() };
  all[index] = next;
  writeAll(all);
  if (normalized) {
    const list = readFolders();
    if (!list.includes(normalized)) {
      list.push(normalized);
      writeFolders(list);
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

export function addFolder(name: string) {
  const normalized = (name || '').trim();
  if (!normalized) return;
  const list = readFolders();
  if (!list.includes(normalized)) {
    list.push(normalized);
    writeFolders(list);
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
  writeAll(next);
  // update folder list
  const list = readFolders().filter((f) => f !== source);
  list.push(target);
  writeFolders(list);
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
  writeAll(next);
  // remove folder from list
  writeFolders(readFolders().filter((f) => f !== target));
  return { affectedCount: affected };
}

