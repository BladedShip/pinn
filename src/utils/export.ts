import JSZip from 'jszip';
import { Note } from '../lib/storage';
import { sanitizeFileName, generateUniqueFileName } from './string';
import { EXPORT_NAMES } from '../constants';
import { logger } from './logger';

/**
 * Download a blob as a file
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export a single note as JSON
 */
export function exportNoteAsJSON(note: Note): void {
  const blob = new Blob([JSON.stringify(note, null, 2)], { type: 'application/json' });
  const filename = `${sanitizeFileName(note.title)}.json`;
  downloadBlob(blob, filename);
}

/**
 * Export a single note as Markdown
 */
export function exportNoteAsMarkdown(note: Note): void {
  const markdown = `# ${note.title}\n\n${note.content}`;
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const filename = `${sanitizeFileName(note.title)}.md`;
  downloadBlob(blob, filename);
}

/**
 * Export all notes as a ZIP file containing JSON files
 */
export async function exportNotesAsJSON(notes: Note[]): Promise<void> {
  if (notes.length === 0) {
    throw new Error('No notes to export.');
  }

  try {
    const zip = new JSZip();

    // Add each note as an individual JSON file
    notes.forEach(note => {
      const fileName = generateUniqueFileName(note.title, note.id, 'json');
      zip.file(fileName, JSON.stringify(note, null, 2));
    });

    // Generate ZIP file
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, EXPORT_NAMES.NOTES_ZIP);
  } catch (error) {
    logger.error('Error creating ZIP file:', error);
    throw new Error('Failed to create export file.');
  }
}

/**
 * Export all notes as a ZIP file containing Markdown files
 */
export async function exportNotesAsMarkdown(notes: Note[]): Promise<void> {
  if (notes.length === 0) {
    throw new Error('No notes to export.');
  }

  try {
    const zip = new JSZip();

    // Add each note as an individual Markdown file
    notes.forEach(note => {
      const fileName = generateUniqueFileName(note.title, note.id, 'md');
      const markdown = `# ${note.title}\n\n${note.content}`;
      zip.file(fileName, markdown);
    });

    // Generate ZIP file
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, EXPORT_NAMES.NOTES_ZIP);
  } catch (error) {
    logger.error('Error creating ZIP file:', error);
    throw new Error('Failed to create export file.');
  }
}
