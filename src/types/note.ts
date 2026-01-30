/**
 * Note-related type definitions
 */

export interface Note {
  id: string;
  title: string;
  content: string;
  // Optional folder grouping. When undefined or empty, the note is unfiled
  folder?: string;
  created_at: string;
  updated_at: string;
}
