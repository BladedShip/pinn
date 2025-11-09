/**
 * Cloud Sync Library
 * Enables users to sync their notes to Firebase Realtime Database
 */

import { 
  isFolderConfigured, 
  hasDirectoryAccess,
  getDirectoryHandle 
} from './fileSystemStorage';

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
    console.error('Error reading cloud config:', error);
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
    console.error('Error saving cloud config:', error);
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
      console.error('Error clearing cloud config:', error);
    }
    localStorage.removeItem('pinn.cloudConfig');
  }
}

/**
 * Get all data files that need to be synced
 */
async function getAllDataFiles(): Promise<{ name: string; content: string }[]> {
  const files = ['notes.json', 'folders.json', 'flows.json', 'flowCategories.json', 'theme.json', 'cloudConfig.json'];
  const dataFiles: { name: string; content: string }[] = [];

  if (!isFolderConfigured() || !hasDirectoryAccess()) {
    // Read from localStorage
    const notesData = localStorage.getItem('pinn.notes');
    const foldersData = localStorage.getItem('pinn.folders');
    const flowsData = localStorage.getItem('pinn.flows');
    const categoriesData = localStorage.getItem('pinn.flowCategories');
    const themeData = localStorage.getItem('pinn.theme');
    const cloudConfigData = localStorage.getItem('pinn.cloudConfig');

    if (notesData) dataFiles.push({ name: 'notes.json', content: notesData });
    if (foldersData) dataFiles.push({ name: 'folders.json', content: foldersData });
    if (flowsData) dataFiles.push({ name: 'flows.json', content: flowsData });
    if (categoriesData) dataFiles.push({ name: 'flowCategories.json', content: categoriesData });
    if (themeData) dataFiles.push({ name: 'theme.json', content: themeData });
    if (cloudConfigData) dataFiles.push({ name: 'cloudConfig.json', content: cloudConfigData });

    return dataFiles;
  }

  const dirHandle = getDirectoryHandle();
  if (!dirHandle) return dataFiles;

  for (const fileName of files) {
    try {
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: false });
      const file = await fileHandle.getFile();
      const text = await file.text();
      if (text.trim()) {
        dataFiles.push({ name: fileName, content: text });
      }
    } catch (error: any) {
      if (error.name !== 'NotFoundError') {
        console.warn(`Could not read ${fileName}:`, error);
      }
    }
  }

  return dataFiles;
}

/**
 * Upload data to Firebase Realtime Database
 */
export async function uploadToCloud(config: CloudConfig, onProgress?: (percent: number) => void): Promise<void> {
  if (!config.apiKey || !config.projectId) {
    throw new Error('Cloud configuration is incomplete');
  }

  // Get all data files
  const dataFiles = await getAllDataFiles();
  
  if (dataFiles.length === 0) {
    throw new Error('No data to sync');
  }

  // Create a timestamp for this sync
  const timestamp = new Date().toISOString();
  // Use a fixed path for personal cloud sync (not per-user, so all devices can access the same data)
  const dataPath = 'data';

  // Upload each file to Realtime Database
  let uploadedCount = 0;
  
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
        ...commonRegions.map(region => `https://${config.projectId}-default-rtdb.${region}.firebasedatabase.app/${dataPath}/${dbName}.json`),
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
        const errorText = lastError || await response?.text() || 'Unknown error';
        console.error('Upload error response:', errorText);
        console.error('Tried URLs:', urlFormats);
        
        // Provide helpful error messages
        if (response?.status === 403) {
          throw new Error('Permission denied. Please check your Realtime Database rules. Make sure they allow write access (test mode allows this).');
        } else if (response?.status === 401) {
          throw new Error('Authentication failed. Please check your API key and make sure Realtime Database is enabled.');
        } else if (response?.status === 404) {
          throw new Error('Database not found. Please verify: 1) Realtime Database is enabled in Firebase Console, 2) Your Project ID is correct, 3) Database URL is accessible. Check REALTIME_DB_SETUP.md for setup instructions.');
        } else {
          throw new Error(`Upload failed (${response?.status || 'network error'}): ${errorText}`);
        }
      }

      uploadedCount++;
      if (onProgress) {
        onProgress(Math.round((uploadedCount / dataFiles.length) * 100));
      }
    } catch (error) {
      console.error(`Error uploading ${file.name}:`, error);
      
      // Check if it's a network error
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new Error(`Network error: Could not connect to Firebase. Please check your internet connection.`);
      }
      
      throw new Error(`Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Save sync metadata
  try {
    const dataPath = 'data';
    const commonRegions = ['asia-southeast1', 'us-central1', 'europe-west1', 'asia-east1'];
    const metadataUrls = [
      ...commonRegions.map(region => `https://${config.projectId}-default-rtdb.${region}.firebasedatabase.app/${dataPath}/_metadata.json?auth=${config.apiKey}`),
      `https://${config.projectId}.firebaseio.com/${dataPath}/_metadata.json?auth=${config.apiKey}`,
    ];
    
    for (const url of metadataUrls) {
      try {
        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            lastSync: timestamp,
            filesCount: dataFiles.length,
          }),
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
            body: JSON.stringify({
              lastSync: timestamp,
              filesCount: dataFiles.length,
            }),
          });
          break;
        } catch {
          continue;
        }
      }
    }
  } catch (error) {
    console.warn('Could not save metadata, but files were uploaded successfully');
  }
}

/**
 * Download data from Firebase Realtime Database
 */
export async function downloadFromCloud(config: CloudConfig, onProgress?: (percent: number) => void): Promise<{ [key: string]: string }> {
  if (!config.apiKey || !config.projectId) {
    throw new Error('Cloud configuration is incomplete');
  }

  // Use a fixed path for personal cloud sync (not per-user, so all devices can access the same data)
  // Also check old user-based path for backward compatibility
  const dataPath = 'data';
  const userId = getUserId(); // For backward compatibility with old data
  console.log(`Downloading from path: ${dataPath} (also checking old path: users/${userId}), projectId: ${config.projectId}`);
  
  const files = ['notes', 'folders', 'flows', 'flowCategories', 'theme', 'cloudConfig']; // Without .json extension
  const downloadedFiles: { [key: string]: string } = {};
  
  let downloadedCount = 0;

  for (const dbName of files) {
    try {
      // Use Firebase Realtime Database REST API
      // Try different URL formats with common regions
      // First try new fixed path, then old user-based path for backward compatibility
      const commonRegions = ['asia-southeast1', 'us-central1', 'europe-west1', 'asia-east1'];
      const downloadUrls = [
        // New fixed path (preferred)
        ...commonRegions.map(region => `https://${config.projectId}-default-rtdb.${region}.firebasedatabase.app/${dataPath}/${dbName}.json?auth=${config.apiKey}`),
        `https://${config.projectId}.firebaseio.com/${dataPath}/${dbName}.json?auth=${config.apiKey}`,
        // Old user-based path (backward compatibility)
        ...commonRegions.map(region => `https://${config.projectId}-default-rtdb.${region}.firebasedatabase.app/users/${userId}/${dbName}.json?auth=${config.apiKey}`),
        `https://${config.projectId}.firebaseio.com/users/${userId}/${dbName}.json?auth=${config.apiKey}`,
      ];
      
      let response: Response | null = null;
      let successfulUrl: string | null = null;
      
      // Try each URL format
      let downloadedData: any = null;
      for (const url of downloadUrls) {
        try {
          console.log(`Trying to download ${dbName} from: ${url.replace(config.apiKey, 'API_KEY_HIDDEN')}`);
          response = await fetch(url);
          console.log(`Response for ${dbName}: status=${response.status}, ok=${response.ok}`);
          
          if (response.ok) {
            const data = await response.json();
            // Only consider it successful if we got actual data (not null)
            if (data !== null) {
              successfulUrl = url;
              downloadedData = data;
              break; // Success
            }
          } else if (response.status === 401 || response.status === 403) {
            // Try without auth
            const publicUrl = url.replace('?auth=' + config.apiKey, '');
            console.log(`Trying without auth: ${publicUrl}`);
            response = await fetch(publicUrl);
            console.log(`Public response for ${dbName}: status=${response.status}, ok=${response.ok}`);
            if (response.ok) {
              const data = await response.json();
              if (data !== null) {
                successfulUrl = publicUrl;
                downloadedData = data;
                break; // Success with public access
              }
            }
          }
        } catch (err) {
          console.log(`Error fetching ${url}:`, err);
          continue; // Try next URL
        }
      }
      
      if (successfulUrl && downloadedData !== null) {
        console.log(`Successfully connected to ${dbName} at: ${successfulUrl.replace(config.apiKey, 'API_KEY_HIDDEN')}`);
        
        const data = downloadedData;
        
        // Debug: Log the actual data structure received
        console.log(`Downloaded ${dbName}:`, {
          type: typeof data,
          hasContent: data?.content !== undefined,
          keys: data && typeof data === 'object' ? Object.keys(data) : 'N/A',
          sample: data && typeof data === 'object' ? JSON.stringify(data).substring(0, 200) : data
        });
        
        // Extract content from Realtime Database structure
        // Data might be stored as { content: ..., fileName: ..., lastUpdated: ... }
        // or directly as the content itself
        let fileContent: string | null = null;
        
        if (data && typeof data === 'object' && data.content !== undefined) {
          // Wrapped structure: { content: ..., fileName: ..., lastUpdated: ... }
          fileContent = typeof data.content === 'string' 
            ? data.content 
            : JSON.stringify(data.content);
        } else if (data !== null && data !== undefined) {
          // Direct content (legacy format or direct storage)
          fileContent = typeof data === 'string' 
            ? data 
            : JSON.stringify(data);
        }
        
        if (fileContent !== null) {
          const fileName = `${dbName}.json`;
          downloadedFiles[fileName] = fileContent;
          
          downloadedCount++;
          if (onProgress) {
            onProgress(Math.round((downloadedCount / files.length) * 100));
          }
          console.log(`Successfully extracted content for ${dbName}`);
        } else {
          console.warn(`File ${dbName} downloaded but content could not be extracted. Data structure:`, typeof data, data);
        }
      } else if (response?.status === 404) {
        // File doesn't exist in cloud, skip
        console.log(`File ${dbName} not found in Realtime Database (404)`);
      } else if (!successfulUrl) {
        // No successful URL found
        console.log(`File ${dbName} not found in Realtime Database (tried all URL formats)`);
      } else {
        console.warn(`Could not download ${dbName}: ${response?.status || 'network error'}`);
      }
    } catch (error) {
      console.error(`Error downloading ${dbName}:`, error);
      
      // Check if it's a network error
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new Error(`Network error: Could not connect to Firebase. Please check your internet connection.`);
      }
      // Continue with other files
    }
  }

  // Log summary of what was downloaded
  console.log(`Download complete. Files downloaded: ${Object.keys(downloadedFiles).length}`, Object.keys(downloadedFiles));
  
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
      } else if (fileName === 'folders.json') {
        localStorage.setItem('pinn.folders', content);
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

  for (const [fileName, content] of Object.entries(data)) {
    try {
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
    } catch (error) {
      console.error(`Error saving ${fileName}:`, error);
      throw error;
    }
  }
}

/**
 * Get or create a unique user ID for cloud storage
 */
function getUserId(): string {
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
      ...commonRegions.map(region => `https://${config.projectId}-default-rtdb.${region}.firebasedatabase.app/${dataPath}/_metadata.json?auth=${config.apiKey}`),
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
    console.error('Error validating cloud config:', error);
    return false;
  }
}

