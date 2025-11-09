import { 
  isFolderConfigured, 
  hasDirectoryAccess,
  getDirectoryHandle 
} from './fileSystemStorage';

const GEMINI_API_KEY_STORAGE_KEY = 'pinn.gemini_api_key';
const GEMINI_API_KEY_FILE = 'geminiApiKey.json';

/**
 * Get Gemini API key from local directory or localStorage
 */
export async function getGeminiApiKey(): Promise<string | null> {
  try {
    // If folder is configured, only read from folder (folder-specific)
    if (isFolderConfigured() && hasDirectoryAccess()) {
      const dirHandle = getDirectoryHandle();
      if (dirHandle) {
        try {
          const fileHandle = await dirHandle.getFileHandle(GEMINI_API_KEY_FILE, { create: false });
          const file = await fileHandle.getFile();
          const text = await file.text();
          if (text.trim()) {
            const data = JSON.parse(text);
            if (data.apiKey) {
              return data.apiKey;
            }
          }
        } catch (error: any) {
          if (error.name !== 'NotFoundError') {
            console.warn('Error reading Gemini API key from file:', error);
          }
        }
      }
      // If folder is configured but file doesn't exist, return null (don't use localStorage)
      return null;
    }

    // Only use localStorage as fallback when no folder is configured
    return localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Save Gemini API key to local directory and localStorage
 */
export async function saveGeminiApiKey(apiKey: string): Promise<void> {
  try {
    // Always save to localStorage as fallback
    localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, apiKey);

    // Also save to local directory if available
    if (isFolderConfigured() && hasDirectoryAccess()) {
      const dirHandle = getDirectoryHandle();
      if (dirHandle) {
        try {
          const fileHandle = await dirHandle.getFileHandle(GEMINI_API_KEY_FILE, { create: true });
          const writable = await fileHandle.createWritable();
          const jsonString = JSON.stringify({ apiKey }, null, 2);
          await writable.write(jsonString);
          await writable.close();
          console.log('Successfully saved Gemini API key to file');
        } catch (error) {
          console.error('Error saving Gemini API key to file:', error);
          // Continue - localStorage is already saved
        }
      }
    }
  } catch (error) {
    console.error('Error saving Gemini API key:', error);
  }
}

/**
 * Delete Gemini API key from local directory and localStorage
 */
export async function deleteGeminiApiKey(): Promise<void> {
  try {
    localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);

    // Also delete from local directory if available
    if (isFolderConfigured() && hasDirectoryAccess()) {
      const dirHandle = getDirectoryHandle();
      if (dirHandle) {
        try {
          await dirHandle.removeEntry(GEMINI_API_KEY_FILE);
        } catch (error: any) {
          if (error.name !== 'NotFoundError') {
            console.error('Error deleting Gemini API key file:', error);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error deleting Gemini API key:', error);
  }
}

