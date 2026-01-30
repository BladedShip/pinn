/**
 * Markdown utilities for parsing and serializing markdown files with YAML frontmatter
 * Handles title-based slug generation for readable filenames
 */

export interface NoteMetadata {
  id: string;
  title: string;
  folder?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Remove emojis and special characters from a string
 * Keeps only alphanumeric characters, spaces, and hyphens
 */
function removeEmojisAndSpecialChars(str: string): string {
  // Remove emojis and special unicode characters
  // Keep alphanumeric, spaces, hyphens, and underscores
  return str
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Emoji range
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport & Map
    .replace(/[\u{2600}-\u{26FF}]/gu, '') // Misc symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '') // Dingbats
    .replace(/[^\w\s-]/g, '') // Remove non-word, non-space, non-hyphen
    .trim();
}

/**
 * Create a clean slug from a title
 * Removes emojis, special characters, converts to lowercase, replaces spaces with hyphens
 */
export function createSlugFromTitle(title: string): string {
  if (!title || typeof title !== 'string') {
    return '';
  }

  const cleaned = removeEmojisAndSpecialChars(title);

  // Convert to lowercase and replace spaces/underscores with hyphens
  const slug = cleaned
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens

  return slug || '';
}

/**
 * Generate a unique filename slug
 * If the base slug is empty or "untitled", generates "untitled-{number}"
 * Handles collisions by appending numbers or short random strings
 */
export function generateUniqueSlug(
  baseSlug: string,
  existingSlugs: Set<string>,
  isUntitled: boolean = false
): string {
  // If empty or just "untitled", generate untitled-N format
  if (!baseSlug || baseSlug === 'untitled' || isUntitled) {
    let counter = 1;
    let candidate = `untitled-${counter}`;

    while (existingSlugs.has(candidate)) {
      counter++;
      candidate = `untitled-${counter}`;
    }

    return candidate;
  }

  // Check if base slug is available
  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }

  // Handle collision - try appending numbers first
  let counter = 1;
  let candidate = `${baseSlug}-${counter}`;

  while (existingSlugs.has(candidate) && counter < 1000) {
    counter++;
    candidate = `${baseSlug}-${counter}`;
  }

  // If still colliding after 1000 attempts, append short random string
  if (existingSlugs.has(candidate)) {
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    candidate = `${baseSlug}-${randomSuffix}`;

    // Final check - if still colliding, add timestamp
    if (existingSlugs.has(candidate)) {
      const timestamp = Date.now().toString(36).substring(7);
      candidate = `${baseSlug}-${timestamp}`;
    }
  }

  return candidate;
}

/**
 * Normalize folder path for filesystem
 * Handles nested folders, sanitizes folder names
 */
export function normalizeFolderPath(folderPath: string | undefined): string {
  if (!folderPath || typeof folderPath !== 'string') {
    return '';
  }

  // Split by / or \ to handle nested paths
  const parts = folderPath
    .split(/[/\\]+/)
    .map(part => {
      // Sanitize each folder name part
      const cleaned = removeEmojisAndSpecialChars(part);
      return cleaned
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    })
    .filter(part => part.length > 0); // Remove empty parts

  return parts.join('/');
}

/**
 * Parse markdown content with YAML frontmatter
 * Returns metadata and content separately
 */
export function parseMarkdownWithFrontmatter(content: string): {
  metadata: Partial<NoteMetadata> | null;
  content: string;
} {
  if (!content || typeof content !== 'string') {
    return { metadata: null, content: '' };
  }

  // Check for frontmatter (starts with ---)
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    // No frontmatter, return content as-is
    return { metadata: null, content: content.trim() };
  }

  const frontmatterText = match[1];
  const markdownContent = match[2];

  // Parse simple YAML frontmatter (key: value pairs)
  const metadata: Partial<NoteMetadata> = {};
  const lines = frontmatterText.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue; // Skip empty lines and comments
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }

    const key = trimmed.substring(0, colonIndex).trim();
    let value = trimmed.substring(colonIndex + 1).trim();

    // Remove quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Type conversion for known fields
    if (key === 'id' || key === 'title' || key === 'folder') {
      metadata[key as keyof NoteMetadata] = value;
    } else if (key === 'created_at' || key === 'updated_at') {
      metadata[key as keyof NoteMetadata] = value;
    }
  }

  return {
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
    content: markdownContent.trim(),
  };
}

/**
 * Serialize note to markdown with YAML frontmatter
 */
export function serializeMarkdownWithFrontmatter(metadata: NoteMetadata, content: string): string {
  const frontmatter = [
    '---',
    `id: ${metadata.id}`,
    `title: ${JSON.stringify(metadata.title)}`,
    ...(metadata.folder ? [`folder: ${JSON.stringify(metadata.folder)}`] : []),
    `created_at: ${metadata.created_at}`,
    `updated_at: ${metadata.updated_at}`,
    '---',
    '',
  ].join('\n');

  return frontmatter + (content || '');
}

/**
 * Get filename from note (for display/debugging)
 */
export function getNoteFilename(note: NoteMetadata, extension: string = 'md'): string {
  const slug = createSlugFromTitle(note.title);
  const baseSlug = slug || 'untitled';
  return `${baseSlug}.${extension}`;
}
