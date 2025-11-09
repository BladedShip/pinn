import { useState, useEffect } from 'react';
import { X, Key, Info, Folder, FolderOpen, AlertCircle, Database, Palette, Cloud, Upload, Download, Check, BookOpen, ChevronDown, ChevronUp, AlertTriangle, Trash2 } from 'lucide-react';
import JSZip from 'jszip';
import { getGeminiApiKey, saveGeminiApiKey, deleteGeminiApiKey } from '../lib/geminiStorage';
import { getFolderPath, requestDirectoryAccess, setDirectoryHandle, clearDirectoryHandle, isFileSystemSupported, isFolderConfigured, hasDirectoryAccess, restoreDirectoryAccess } from '../lib/fileSystemStorage';
import { refreshStorage } from '../lib/storage';
import { refreshFlowStorage } from '../lib/flowStorage';
import { getTheme, saveTheme, applyTheme, Theme } from '../lib/themeStorage';
import { getCloudConfig, saveCloudConfig, clearCloudConfig, uploadToCloud, downloadFromCloud, saveDownloadedData, validateCloudConfig, CloudConfig } from '../lib/cloudSync';
import Toast from './Toast';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onFolderChange?: () => void;
}

type SettingsCategory = 'storage' | 'api' | 'appearance' | 'cloud';

export default function SettingsDialog({ isOpen, onClose, onFolderChange }: SettingsDialogProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('storage');
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [isChangingFolder, setIsChangingFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [isRestoringAccess, setIsRestoringAccess] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<Theme>('default');
  
  // Cloud sync states
  const [cloudConfig, setCloudConfig] = useState<CloudConfig>({
    apiKey: '',
    projectId: '',
    enabled: false,
  });
  const [isCloudConfigured, setIsCloudConfigured] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showDocsDialog, setShowDocsDialog] = useState(false);
  const [expandedTroubleshooting, setExpandedTroubleshooting] = useState<string | null>(null);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const loadData = async () => {
        const storedKey = await getGeminiApiKey();
        setApiKey(storedKey || '');
        setFolderPath(getFolderPath());
        setFolderError(null);
        setSelectedTheme(getTheme());
        
        // Load cloud config
        await loadCloudConfig();
      };
      loadData();
    }
  }, [isOpen]);

  const loadCloudConfig = async () => {
    try {
      const config = await getCloudConfig();
      if (config) {
        setCloudConfig(config);
        setIsCloudConfigured(config.enabled);
      } else {
        // Reset to default if no config found in the folder
        setCloudConfig({
          apiKey: '',
          projectId: '',
          enabled: false,
        });
        setIsCloudConfigured(false);
      }
    } catch (error) {
      console.error('Error loading cloud config:', error);
      // Reset to default on error
      setCloudConfig({
        apiKey: '',
        projectId: '',
        enabled: false,
      });
      setIsCloudConfigured(false);
    }
  };

  const handleRestoreAccess = async () => {
    setIsRestoringAccess(true);
    setFolderError(null);
    try {
      const success = await restoreDirectoryAccess();
      if (success) {
        // Refresh storage to load from file system
        await refreshStorage();
        await refreshFlowStorage();
        
        // Trigger storage refresh event so all components reload their data
        window.dispatchEvent(new CustomEvent('storage-refresh'));
        
        if (onFolderChange) {
          onFolderChange();
        }
      } else {
        setFolderError('Failed to restore access. Please try selecting the folder again.');
      }
    } catch (error: any) {
      console.error('Error restoring access:', error);
      setFolderError(error.message || 'Failed to restore access. Please try again.');
    } finally {
      setIsRestoringAccess(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (apiKey.trim()) {
        await saveGeminiApiKey(apiKey.trim());
      }
      // Save theme
      await saveTheme(selectedTheme);
      applyTheme(selectedTheme);
      
      // Save cloud config
      if (cloudConfig.apiKey && cloudConfig.projectId) {
        await saveCloudConfig(cloudConfig);
      }
      
      setTimeout(() => {
        setIsSaving(false);
        onClose();
      }, 200);
    } catch (error) {
      console.error('Error saving settings:', error);
      setIsSaving(false);
    }
  };

  const handleDeleteGeminiApiKey = async () => {
    if (!apiKey || !apiKey.trim()) {
      setToast({ message: 'No API key to remove', type: 'error' });
      return;
    }

    if (window.confirm('Are you sure you want to remove your Gemini API key? You will need to enter it again to use AI features.')) {
      try {
        await deleteGeminiApiKey();
        setApiKey('');
        setToast({ message: 'Gemini API key removed successfully', type: 'success' });
      } catch (error) {
        console.error('Error deleting Gemini API key:', error);
        setToast({ message: 'Error removing API key', type: 'error' });
      }
    }
  };

  const handleChangeFolder = async () => {
    if (!isFileSystemSupported()) {
      setFolderError('File System Access API is not supported in this browser.');
      return;
    }

    setIsChangingFolder(true);
    setFolderError(null);

    try {
      // If folder is already configured, try to restore it first (allowReuse = true)
      // This will attempt to restore the existing handle if permission can be re-granted
      // Otherwise, it will prompt for a new folder selection
      const handle = await requestDirectoryAccess('Pinn', true);
      if (handle) {
        await setDirectoryHandle(handle, handle.name);
        setFolderPath(handle.name);
        
        // Refresh storage to load data from new location
        await refreshStorage();
        await refreshFlowStorage();
        
        // Reload cloud config and Gemini API key from the new folder
        // This ensures they're folder-specific and not persisted from the old folder
        await loadCloudConfig();
        const newApiKey = await getGeminiApiKey();
        setApiKey(newApiKey || '');
        
        // Trigger storage refresh event so all components reload their data
        window.dispatchEvent(new CustomEvent('storage-refresh'));
        
        if (onFolderChange) {
          onFolderChange();
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error changing folder:', error);
        setFolderError(error.message || 'Failed to change folder. Please try again.');
      }
    } finally {
      setIsChangingFolder(false);
    }
  };

  const handleRemoveFolder = async () => {
    if (window.confirm('Are you sure you want to remove the folder selection? You will need to select a folder again to use file system storage.')) {
      await clearDirectoryHandle();
      setFolderPath(null);
      
      // Refresh storage to fall back to localStorage
      await refreshStorage();
      await refreshFlowStorage();
      
      // Reload cloud config and Gemini API key from localStorage (fallback)
      await loadCloudConfig();
      const newApiKey = await getGeminiApiKey();
      setApiKey(newApiKey || '');
      
      // Trigger storage refresh event so all components reload their data
      window.dispatchEvent(new CustomEvent('storage-refresh'));
      
      if (onFolderChange) {
        onFolderChange();
      }
    }
  };

  if (!isOpen) return null;

  const handleSyncToCloud = async () => {
    if (!cloudConfig.enabled || !cloudConfig.apiKey || !cloudConfig.projectId) {
      setToast({ message: 'Please configure cloud sync first', type: 'error' });
      return;
    }

    setIsSyncing(true);
    setSyncProgress(0);

    try {
      await uploadToCloud(cloudConfig, (progress) => {
        setSyncProgress(progress);
      });
      
      setToast({ message: 'Successfully synced to cloud!', type: 'success' });
    } catch (error) {
      console.error('Error syncing to cloud:', error);
      setToast({ 
        message: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        type: 'error' 
      });
    } finally {
      setIsSyncing(false);
      setSyncProgress(0);
    }
  };

  const handleDownloadFromCloud = () => {
    if (!cloudConfig.enabled || !cloudConfig.apiKey || !cloudConfig.projectId) {
      setToast({ message: 'Please configure cloud sync first', type: 'error' });
      return;
    }

    // Show confirmation dialog
    setShowDownloadDialog(true);
  };

  const handleDownloadReplace = async () => {
    setShowDownloadDialog(false);
    setIsDownloading(true);
    setDownloadProgress(0);

    try {
      const data = await downloadFromCloud(cloudConfig, (progress) => {
        setDownloadProgress(progress);
      });
      
      await saveDownloadedData(data);
      
      // Refresh storage to load the new data
      await refreshStorage();
      await refreshFlowStorage();
      
      // Trigger storage refresh event so all components reload their data
      window.dispatchEvent(new CustomEvent('storage-refresh'));
      
      if (onFolderChange) {
        onFolderChange();
      }
      
      setToast({ message: 'Successfully downloaded and replaced all content!', type: 'success' });
    } catch (error) {
      console.error('Error downloading from cloud:', error);
      setToast({ 
        message: `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        type: 'error' 
      });
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const handleDownloadToFolder = async () => {
    setShowDownloadDialog(false);
    
    setIsDownloading(true);
    setDownloadProgress(0);

    try {
      // Download data from cloud
      const data = await downloadFromCloud(cloudConfig, (progress) => {
        setDownloadProgress(Math.round(progress * 0.5)); // First 50% is downloading
      });

      // Create a ZIP file containing all the JSON files
      setDownloadProgress(60);
      const zip = new JSZip();
      
      for (const [fileName, content] of Object.entries(data)) {
        zip.file(fileName, content);
      }

      // Generate ZIP file
      setDownloadProgress(80);
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      // Create download link
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pinn-cloud-backup-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      setTimeout(() => URL.revokeObjectURL(url), 100);
      setDownloadProgress(100);

      setToast({ 
        message: `Successfully downloaded backup ZIP file. Extract it to a folder and select that folder in Storage settings to use the data.`, 
        type: 'success' 
      });
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error downloading to folder:', error);
        setToast({ 
          message: `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 
          type: 'error' 
        });
      }
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const handleTestCloudConfig = async () => {
    if (!cloudConfig.apiKey || !cloudConfig.projectId) {
      setToast({ message: 'Please fill in all fields', type: 'error' });
      return;
    }

    try {
      const isValid = await validateCloudConfig(cloudConfig);
      if (isValid) {
        setToast({ message: 'Cloud configuration is valid!', type: 'success' });
      } else {
        setToast({ message: 'Could not validate cloud configuration', type: 'error' });
      }
    } catch (error) {
      setToast({ message: 'Error validating configuration', type: 'error' });
    }
  };

  const handleDisableCloud = async () => {
    if (window.confirm('Are you sure you want to disable cloud sync? Your configuration will be removed.')) {
      try {
        await clearCloudConfig();
        setCloudConfig({
          apiKey: '',
          projectId: '',
          enabled: false,
        });
        setIsCloudConfigured(false);
        setToast({ message: 'Cloud sync disabled', type: 'success' });
      } catch (error) {
        setToast({ message: 'Error disabling cloud sync', type: 'error' });
      }
    }
  };

  const categories = [
    { id: 'storage' as SettingsCategory, label: 'Storage', icon: Database, description: 'Manage data storage' },
    { id: 'cloud' as SettingsCategory, label: 'Cloud Sync', icon: Cloud, description: 'Sync to cloud storage' },
    { id: 'appearance' as SettingsCategory, label: 'Appearance', icon: Palette, description: 'Customize theme' },
    { id: 'api' as SettingsCategory, label: 'API Keys', icon: Key, description: 'Configure API settings' },
  ];

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-theme-bg-primary rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] border border-theme-border overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-theme-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-theme-text-primary">Settings</h2>
              <p className="text-xs text-theme-text-secondary mt-0.5">Configure your application preferences</p>
            </div>
            <button
              onClick={onClose}
              className="text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded-lg p-1.5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar - Categories */}
          <div className="w-56 border-r border-theme-border bg-theme-bg-darker flex-shrink-0 flex flex-col">
            <div className="px-3 py-4 space-y-1">
              {categories.map((category) => {
                const Icon = category.icon;
                const isActive = activeCategory === category.id;
                return (
                  <button
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className={`w-full flex items-start gap-3 px-4 py-3 rounded-lg transition-all focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 select-none ${
                      isActive
                        ? 'bg-theme-bg-secondary text-theme-text-primary'
                        : 'text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-primary'
                    }`}
                    style={{ outline: 'none', boxShadow: 'none' }}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0 text-theme-text-secondary mt-0.5" />
                    <div className="flex flex-col flex-1 min-w-0 gap-1">
                      <span className="text-sm font-medium text-left block">{category.label}</span>
                      <span className="text-xs text-theme-text-tertiary text-left block leading-tight">{category.description}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-hidden">
            <div className="p-6 h-full overflow-y-auto">
              {/* Storage Category */}
              {activeCategory === 'storage' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-theme-text-primary mb-1">
                      Storage Folder
                    </h3>
                    <p className="text-sm text-theme-text-secondary mb-6">
                      Choose where to store your notes, folders, and flows. Files can be accessed directly from your file system.
                    </p>
                    
                    {isFolderConfigured() && folderPath ? (
                      <div className="space-y-4">
                        <div className="bg-theme-bg-darkest border border-theme-border rounded-lg px-4 py-4 flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 bg-theme-bg-secondary rounded-lg flex items-center justify-center flex-shrink-0">
                              <FolderOpen className="w-5 h-5 text-theme-text-secondary" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-theme-text-secondary mb-0.5">Current folder</p>
                              <p className="text-sm text-theme-text-primary truncate font-medium" title={folderPath}>
                                {folderPath}
                              </p>
                              {!hasDirectoryAccess() && (
                                <p className="text-xs text-yellow-400 mt-1 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  Access needs to be restored
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        {!hasDirectoryAccess() && (
                          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                              <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-yellow-400 mb-1">Folder Access Required</p>
                                <p className="text-xs text-yellow-400/90 mb-3">
                                  Your folder is configured, but permission needs to be re-granted. Click the button below to restore access.
                                </p>
                                <button
                                  onClick={handleRestoreAccess}
                                  disabled={isRestoringAccess}
                                  className="px-4 py-2 text-sm font-medium bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                  {isRestoringAccess ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-300"></div>
                                      <span>Restoring...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Folder className="w-4 h-4" />
                                      <span>Restore Access</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="flex gap-3 justify-end">
                          <button
                            onClick={handleChangeFolder}
                            disabled={isChangingFolder}
                            className="px-4 py-2.5 text-sm font-medium bg-theme-bg-secondary hover:bg-theme-bg-tertiary text-theme-text-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {isChangingFolder ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-300"></div>
                                <span>Changing...</span>
                              </>
                            ) : (
                              <>
                                <Folder className="w-4 h-4" />
                                <span>Change Folder</span>
                              </>
                            )}
                          </button>
                          <button
                            onClick={handleRemoveFolder}
                            className="px-4 py-2.5 text-sm font-medium bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors flex items-center gap-2"
                          >
                            Remove
                          </button>
                        </div>
                        {folderError && (
                          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-red-400 mb-1">Error</p>
                              <p className="text-xs text-red-400/90">{folderError}</p>
                            </div>
                          </div>
                        )}
                        <div className="flex items-start gap-3 p-4 bg-theme-bg-darkest border border-theme-border-light rounded-lg">
                          <Info className="w-5 h-5 text-theme-text-secondary mt-0.5 flex-shrink-0" />
                          <div className="text-sm text-theme-text-secondary leading-relaxed">
                            <p className="font-medium text-theme-text-primary mb-1">Local File Storage</p>
                            <p className="text-xs text-theme-text-secondary">
                              All your notes, folders, and flows are stored in this folder as files. You can access, backup, and manage them directly from your file system.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="bg-theme-bg-darkest border border-theme-border rounded-lg px-4 py-4 text-theme-text-secondary">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-theme-border-light rounded-lg flex items-center justify-center flex-shrink-0">
                              <Folder className="w-5 h-5 text-theme-text-tertiary" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-theme-text-primary mb-0.5">No folder selected</p>
                              <p className="text-xs text-theme-text-secondary">Currently using browser storage (localStorage)</p>
                            </div>
                          </div>
                        </div>
                        {isFileSystemSupported() ? (
                          <button
                            onClick={handleChangeFolder}
                            disabled={isChangingFolder}
                            className="px-4 py-3 text-sm font-medium bg-theme-bg-secondary hover:bg-theme-bg-tertiary text-theme-text-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {isChangingFolder ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                <span>Selecting...</span>
                              </>
                            ) : (
                              <>
                                <Folder className="w-4 h-4" />
                                <span>Select Storage Folder</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <div className="bg-theme-bg-darkest border border-theme-border-light rounded-lg p-4">
                            <div className="flex items-start gap-3">
                              <AlertCircle className="w-5 h-5 text-theme-text-secondary flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-sm font-medium text-theme-text-primary mb-1">Browser Not Supported</p>
                                <p className="text-xs text-theme-text-secondary">
                                  File System Access API is not supported in this browser. Please use Chrome, Edge, or Opera for file system storage.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Appearance Category */}
              {activeCategory === 'appearance' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-theme-text-primary mb-1">
                      Theme
                    </h3>
                    <p className="text-sm text-theme-text-secondary mb-6">
                      Choose your preferred color scheme. Your selection will be saved and remembered.
                    </p>
                    
                    <div className="space-y-3">
                      {/* Default Theme */}
                      <button
                        onClick={() => setSelectedTheme('default')}
                        className={`w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-all focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ${
                          selectedTheme === 'default'
                            ? 'border-theme-accent bg-theme-accent/10'
                            : 'border-theme-border bg-theme-bg-darkest hover:border-theme-border'
                        }`}
                      >
                        <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-700">
                          <div className="h-full flex flex-col">
                            <div className="h-1/3 bg-[#2c3440]"></div>
                            <div className="h-1/3 bg-[#3a4450]"></div>
                            <div className="h-1/3 bg-[#424d5a]"></div>
                          </div>
                        </div>
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <p className="text-base font-medium text-theme-text-primary">Default</p>
                            {selectedTheme === 'default' && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-theme-accent text-white rounded">Active</span>
                            )}
                          </div>
                          <p className="text-sm text-theme-text-secondary mt-0.5">The original Pinn theme with balanced colors</p>
                        </div>
                      </button>

                      {/* Darker Theme */}
                      <button
                        onClick={() => setSelectedTheme('darker')}
                        className={`w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-all focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ${
                          selectedTheme === 'darker'
                            ? 'border-theme-accent bg-theme-accent/10'
                            : 'border-theme-border bg-theme-bg-darkest hover:border-theme-border'
                        }`}
                      >
                        <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-700">
                          <div className="h-full flex flex-col">
                            <div className="h-1/3 bg-[#0f1419]"></div>
                            <div className="h-1/3 bg-[#1a1f26]"></div>
                            <div className="h-1/3 bg-[#252930]"></div>
                          </div>
                        </div>
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <p className="text-base font-medium text-theme-text-primary">Darker</p>
                            {selectedTheme === 'darker' && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-theme-accent text-white rounded">Active</span>
                            )}
                          </div>
                          <p className="text-sm text-theme-text-secondary mt-0.5">A deeper, more immersive dark theme</p>
                        </div>
                      </button>
                    </div>

                    <div className="flex items-start gap-3 p-4 bg-theme-bg-darkest border border-theme-border-light rounded-lg mt-6">
                      <Info className="w-5 h-5 text-theme-text-secondary mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-theme-text-secondary leading-relaxed">
                        <p className="font-medium text-theme-text-primary mb-1">Theme Persistence</p>
                        <p className="text-xs text-theme-text-secondary">
                          Your theme preference is saved locally and will persist across sessions. If you have a storage folder configured, the theme is also saved to a file.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Cloud Sync Category */}
              {activeCategory === 'cloud' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-theme-text-primary mb-1">
                      Cloud Sync
                    </h3>
                    <p className="text-sm text-theme-text-secondary mb-6">
                      Sync your notes and flows to Firebase Realtime Database for backup and cross-device access. Free tier included!
                    </p>

                    {!isCloudConfigured ? (
                      <div className="space-y-4">
                        <div className="bg-theme-bg-darkest border border-theme-border rounded-lg p-6 space-y-4">
                          <h4 className="text-base font-medium text-theme-text-primary mb-4">Firebase Realtime Database Configuration</h4>
                          
                          <div>
                            <label className="block text-sm font-medium text-theme-text-primary mb-2">
                              API Key
                            </label>
                            <input
                              type="password"
                              value={cloudConfig.apiKey}
                              onChange={(e) => setCloudConfig({ ...cloudConfig, apiKey: e.target.value })}
                              placeholder="Enter your Firebase API key..."
                              className="w-full bg-theme-bg-darker border border-theme-border rounded-lg px-4 py-2.5 text-theme-text-primary placeholder-theme-text-tertiary focus:outline-none focus:ring-2 focus:ring-theme-border focus:border-transparent transition-all text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-theme-text-primary mb-2">
                              Project ID
                            </label>
                            <input
                              type="text"
                              value={cloudConfig.projectId}
                              onChange={(e) => setCloudConfig({ ...cloudConfig, projectId: e.target.value })}
                              placeholder="your-project-id"
                              className="w-full bg-theme-bg-darker border border-theme-border rounded-lg px-4 py-2.5 text-theme-text-primary placeholder-theme-text-tertiary focus:outline-none focus:ring-2 focus:ring-theme-border focus:border-transparent transition-all text-sm"
                            />
                          </div>

                          <div className="flex gap-3 pt-2">
                            <button
                              onClick={handleTestCloudConfig}
                              className="px-4 py-2.5 text-sm font-medium bg-theme-bg-secondary hover:bg-theme-bg-tertiary text-theme-text-primary rounded-lg transition-colors flex items-center gap-2"
                            >
                              <Check className="w-4 h-4" />
                              Test Configuration
                            </button>
                            <button
                              onClick={() => {
                                if (cloudConfig.apiKey && cloudConfig.projectId) {
                                  setCloudConfig({ ...cloudConfig, enabled: true });
                                  setIsCloudConfigured(true);
                                  saveCloudConfig({ ...cloudConfig, enabled: true });
                                  setToast({ message: 'Cloud sync enabled!', type: 'success' });
                                } else {
                                  setToast({ message: 'Please fill in all fields', type: 'error' });
                                }
                              }}
                              className="px-4 py-2.5 text-sm font-medium bg-theme-accent hover:bg-theme-accent-hover text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                              <Cloud className="w-4 h-4" />
                              Enable Cloud Sync
                            </button>
                          </div>
                        </div>

                        <button
                          onClick={() => setShowDocsDialog(true)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-lg transition-colors"
                        >
                          <BookOpen className="w-4 h-4" />
                          <span>View Setup Documentation</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="bg-theme-bg-darkest border border-theme-border rounded-lg p-4">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                              <Cloud className="w-5 h-5 text-green-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-theme-text-primary">Cloud Sync Enabled</p>
                              <p className="text-xs text-theme-text-secondary">Connected to Realtime Database</p>
                            </div>
                          </div>

                          <div className="space-y-2 text-xs text-theme-text-secondary">
                            <p><span className="font-medium">Project ID:</span> {cloudConfig.projectId}</p>
                            <p><span className="font-medium">Database:</span> Realtime Database</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={handleSyncToCloud}
                            disabled={isSyncing}
                            className="px-4 py-3 text-sm font-medium bg-theme-accent hover:bg-theme-accent-hover text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {isSyncing ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                <span>Syncing... {syncProgress}%</span>
                              </>
                            ) : (
                              <>
                                <Upload className="w-4 h-4" />
                                <span>Sync to Cloud</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={handleDownloadFromCloud}
                            disabled={isDownloading}
                            className="px-4 py-3 text-sm font-medium bg-theme-bg-secondary hover:bg-theme-bg-tertiary text-theme-text-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {isDownloading ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-300"></div>
                                <span>Downloading... {downloadProgress}%</span>
                              </>
                            ) : (
                              <>
                                <Download className="w-4 h-4" />
                                <span>Download from Cloud</span>
                              </>
                            )}
                          </button>
                        </div>

                        <button
                          onClick={handleDisableCloud}
                          className="w-full px-4 py-2.5 text-sm font-medium bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
                        >
                          Disable Cloud Sync
                        </button>

                        <div className="flex items-start gap-3 p-4 bg-theme-bg-darkest border border-theme-border-light rounded-lg">
                          <Info className="w-5 h-5 text-theme-text-secondary mt-0.5 flex-shrink-0" />
                          <div className="text-sm text-theme-text-secondary leading-relaxed">
                            <p className="font-medium text-theme-text-primary mb-1">How it works</p>
                            <ul className="text-xs space-y-1 list-disc list-inside">
                              <li><strong>Sync to Cloud:</strong> Uploads all your notes, flows, and settings to Realtime Database</li>
                              <li><strong>Download from Cloud:</strong> Downloads your data from Realtime Database and saves it locally</li>
                              <li>Your data is stored in your own Firebase project - you have full control</li>
                              <li>Uses Realtime Database's free tier - no billing required!</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* API Keys Category */}
              {activeCategory === 'api' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-theme-text-primary mb-1">
                      API Configuration
                    </h3>
                    <p className="text-sm text-theme-text-secondary mb-6">
                      Manage your API keys and authentication settings. All keys are stored locally and never shared.
                    </p>
                    
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="flex text-sm font-medium text-theme-text-primary items-center gap-2">
                            <Key className="w-4 h-4" />
                            Gemini API Key
                          </label>
                          {apiKey && apiKey.trim() && (
                            <button
                              onClick={handleDeleteGeminiApiKey}
                              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1.5 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Remove
                            </button>
                          )}
                        </div>
                        <input
                          type="password"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder="Enter your Gemini API key..."
                          className="w-full bg-theme-bg-darkest border border-theme-border rounded-lg px-4 py-3 text-theme-text-primary placeholder-theme-text-tertiary focus:outline-none focus:ring-2 focus:ring-theme-border focus:border-transparent transition-all font-mono text-sm"
                          autoFocus={activeCategory === 'api'}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSave();
                            }
                          }}
                        />
                        {apiKey && apiKey.trim() && (
                          <p className="text-xs text-theme-text-tertiary mt-1.5">
                            API key is configured. Click "Remove" to delete it.
                          </p>
                        )}
                      </div>
                      
                      <div className="flex items-start gap-3 p-4 bg-theme-bg-darkest border border-theme-border-light rounded-lg">
                        <Info className="w-5 h-5 text-theme-text-secondary mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-theme-text-secondary leading-relaxed">
                          <p className="font-medium text-theme-text-primary mb-2">Security & Privacy</p>
                          <p className="text-xs mb-2">
                            Your API key is stored locally in your browser and never transmitted to any third-party servers except Google's Gemini API when making requests.
                          </p>
                          <p className="text-xs">
                            Get your free API key from{' '}
                            <a 
                              href="https://makersuite.google.com/app/apikey" 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-theme-text-primary hover:text-white hover:underline font-medium"
                            >
                              Google AI Studio
                            </a>
                            .
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer - Action Buttons */}
        <div className="px-6 py-4 border-t border-theme-border flex justify-end gap-3 flex-shrink-0 bg-theme-bg-darker">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2.5 text-sm font-medium bg-theme-accent hover:bg-theme-accent-hover text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-theme-accent"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      <Toast
        isOpen={toast !== null}
        message={toast?.message || ''}
        type={toast?.type || 'success'}
        onClose={() => setToast(null)}
      />

      {/* Download Confirmation Dialog */}
      {showDownloadDialog && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
          onClick={() => setShowDownloadDialog(false)}
        >
          <div 
            className="bg-theme-bg-primary rounded-xl shadow-2xl w-full max-w-md border border-theme-border overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-theme-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-theme-text-primary">Download from Cloud</h2>
                  <p className="text-xs text-theme-text-secondary mt-0.5">Choose how you want to download your data</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-sm text-theme-text-secondary">
                How would you like to download your data from the cloud?
              </p>

              <div className="space-y-3">
                <button
                  onClick={handleDownloadReplace}
                  className="w-full p-4 bg-theme-bg-darkest border-2 border-theme-border hover:border-red-500/50 rounded-lg transition-all text-left group"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-red-500/30 transition-colors">
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-theme-text-primary mb-1">Replace All Content</div>
                      <div className="text-xs text-theme-text-secondary">
                        Downloads and immediately replaces all your current notes, flows, and settings. This action cannot be undone.
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={handleDownloadToFolder}
                  className="w-full p-4 bg-theme-bg-darkest border-2 border-theme-border hover:border-blue-500/50 rounded-lg transition-all text-left group"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/30 transition-colors">
                      <Folder className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-theme-text-primary mb-1">Download as ZIP</div>
                      <div className="text-xs text-theme-text-secondary">
                        Downloads all files as a ZIP archive. Extract it to a folder and select that folder in Storage settings to use the data.
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-theme-border flex justify-end bg-theme-bg-darker">
              <button
                onClick={() => setShowDownloadDialog(false)}
                className="px-4 py-2 text-sm font-medium text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Documentation Dialog */}
      {showDocsDialog && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
          onClick={() => setShowDocsDialog(false)}
        >
          <div 
            className="bg-theme-bg-primary rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] border border-theme-border overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-8 py-5 border-b border-theme-border flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-theme-text-primary">Setup Documentation</h2>
                  <p className="text-sm text-theme-text-secondary mt-1">Firebase Realtime Database Setup Guide</p>
                </div>
                <button
                  onClick={() => setShowDocsDialog(false)}
                  className="text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded-lg p-1.5 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <div 
                className="flex-1 overflow-y-auto p-8"
                style={{ 
                  scrollbarWidth: 'none', 
                  msOverflowStyle: 'none',
                  WebkitOverflowScrolling: 'touch'
                }}
              >
                <style>{`
                  div[style*="scrollbarWidth"]::-webkit-scrollbar {
                    display: none;
                    width: 0;
                    height: 0;
                  }
                `}</style>
                <div className="space-y-8 text-theme-text-secondary">
                  <div>
                    <h3 className="text-xl font-semibold text-theme-text-primary mb-4">Quick Setup (5 minutes)</h3>
                    
                    <div className="space-y-6">
                      <div className="bg-theme-bg-darkest border border-theme-border rounded-lg p-5">
                        <h4 className="text-base font-semibold text-theme-text-primary mb-3 flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-theme-accent text-white flex items-center justify-center text-xs font-bold">1</span>
                          Create Firebase Project
                        </h4>
                        <ol className="text-sm space-y-2 list-decimal list-inside ml-8">
                          <li>Go to <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline font-medium">Firebase Console</a></li>
                          <li>Click <strong>"Add project"</strong> (or select existing)</li>
                          <li>Enter project name (e.g., "Pinn Notes")</li>
                          <li>Disable Google Analytics (optional)</li>
                          <li>Click <strong>"Create project"</strong></li>
                        </ol>
                      </div>

                      <div className="bg-theme-bg-darkest border border-theme-border rounded-lg p-5">
                        <h4 className="text-base font-semibold text-theme-text-primary mb-3 flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-theme-accent text-white flex items-center justify-center text-xs font-bold">2</span>
                          Enable Realtime Database
                        </h4>
                        <ol className="text-sm space-y-2 list-decimal list-inside ml-8">
                          <li>In the left sidebar, click <strong>"Realtime Database"</strong></li>
                          <li>Click <strong>"Create database"</strong></li>
                          <li>Choose a location (select closest to you)</li>
                          <li>Click <strong>"Enable"</strong></li>
                          <li>Choose <strong>"Start in test mode"</strong> (allows read/write for 30 days)</li>
                          <li>Click <strong>"Enable"</strong></li>
                        </ol>
                      </div>

                      <div className="bg-theme-bg-darkest border border-theme-border rounded-lg p-5">
                        <h4 className="text-base font-semibold text-theme-text-primary mb-3 flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-theme-accent text-white flex items-center justify-center text-xs font-bold">3</span>
                          Get Your Credentials
                        </h4>
                        <ol className="text-sm space-y-2 list-decimal list-inside ml-8">
                          <li>Click the <strong>gear icon</strong> ⚙️ next to "Project Overview"</li>
                          <li>Select <strong>"Project settings"</strong></li>
                          <li>Under the <strong>"General"</strong> tab:
                            <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                              <li>Copy your <strong>Project ID</strong> (e.g., <code className="text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded">pinn-notes-12345</code>)</li>
                              <li>Scroll down to "Your apps" section</li>
                              <li>If no web app exists, click the <code className="text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded">&lt;/&gt;</code> (Web) icon</li>
                              <li>Copy the <strong>Web API Key</strong> (looks like: <code className="text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded">AIzaSyXXX...</code>)</li>
                            </ul>
                          </li>
                        </ol>
                      </div>

                      <div className="bg-theme-bg-darkest border border-theme-border rounded-lg p-5">
                        <h4 className="text-base font-semibold text-theme-text-primary mb-3 flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-theme-accent text-white flex items-center justify-center text-xs font-bold">4</span>
                          Configure Database Rules (Optional)
                        </h4>
                        <p className="text-sm mb-3 text-theme-text-secondary">The test mode works for 30 days. For permanent access:</p>
                        <ol className="text-sm space-y-2 list-decimal list-inside ml-8">
                          <li>Go to <strong>Realtime Database</strong> → <strong>Rules</strong> tab</li>
                          <li>Replace with:
                            <pre className="mt-3 p-4 bg-theme-bg-darker border border-theme-border rounded-lg text-xs overflow-x-auto font-mono">
{`{
  "rules": {
    "users": {
      "$userId": {
        ".read": true,
        ".write": true
      }
    }
  }
}`}
                            </pre>
                          </li>
                          <li>Click <strong>"Publish"</strong></li>
                        </ol>
                        <p className="text-xs mt-3 text-yellow-400 flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span>Note: This allows anyone to read/write. For better security, implement Firebase Authentication.</span>
                        </p>
                      </div>

                      <div className="bg-theme-bg-darkest border border-theme-border rounded-lg p-5">
                        <h4 className="text-base font-semibold text-theme-text-primary mb-3 flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-theme-accent text-white flex items-center justify-center text-xs font-bold">5</span>
                          Configure in Pinn
                        </h4>
                        <ol className="text-sm space-y-2 list-decimal list-inside ml-8">
                          <li>Enter your <strong>API Key</strong> in the field above</li>
                          <li>Enter your <strong>Project ID</strong> in the field above</li>
                          <li>Click <strong>"Test Configuration"</strong> to verify</li>
                          <li>Click <strong>"Enable Cloud Sync"</strong></li>
                        </ol>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-xl p-6">
                    <h3 className="text-xl font-semibold text-theme-text-primary mb-4">Free Tier Limits</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-theme-bg-darkest/50 rounded-lg p-4 border border-theme-border">
                        <div className="text-2xl font-bold text-blue-400 mb-1">1 GB</div>
                        <div className="text-xs text-theme-text-secondary">Storage</div>
                        <div className="text-xs text-theme-text-tertiary mt-1">~1 million notes</div>
                      </div>
                      <div className="bg-theme-bg-darkest/50 rounded-lg p-4 border border-theme-border">
                        <div className="text-2xl font-bold text-purple-400 mb-1">10 GB</div>
                        <div className="text-xs text-theme-text-secondary">Transfer/month</div>
                        <div className="text-xs text-theme-text-tertiary mt-1">~3,000 syncs</div>
                      </div>
                      <div className="bg-theme-bg-darkest/50 rounded-lg p-4 border border-theme-border">
                        <div className="text-2xl font-bold text-green-400 mb-1">100</div>
                        <div className="text-xs text-theme-text-secondary">Concurrent</div>
                        <div className="text-xs text-theme-text-tertiary mt-1">Connections</div>
                      </div>
                    </div>
                    <p className="text-sm text-theme-text-secondary mt-4 text-center">Perfect for personal use - no billing required!</p>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold text-theme-text-primary mb-4">Troubleshooting</h3>
                    <div className="space-y-2">
                      <div className="bg-theme-bg-darkest border border-theme-border rounded-lg overflow-hidden">
                        <button
                          onClick={() => setExpandedTroubleshooting(expandedTroubleshooting === '404' ? null : '404')}
                          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-theme-bg-darker transition-colors"
                        >
                          <span className="font-medium text-theme-text-primary">"404 Not Found" error</span>
                          {expandedTroubleshooting === '404' ? (
                            <ChevronUp className="w-5 h-5 text-theme-text-secondary" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-theme-text-secondary" />
                          )}
                        </button>
                        {expandedTroubleshooting === '404' && (
                          <div className="px-5 pb-4 pt-2 border-t border-theme-border">
                            <ul className="text-sm space-y-2 list-disc list-inside ml-2 text-theme-text-secondary">
                              <li>Verify Realtime Database is enabled in Firebase Console</li>
                              <li>Check that your Project ID matches exactly (case-sensitive)</li>
                              <li>Make sure the database URL is accessible</li>
                            </ul>
                          </div>
                        )}
                      </div>

                      <div className="bg-theme-bg-darkest border border-theme-border rounded-lg overflow-hidden">
                        <button
                          onClick={() => setExpandedTroubleshooting(expandedTroubleshooting === 'permission' ? null : 'permission')}
                          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-theme-bg-darker transition-colors"
                        >
                          <span className="font-medium text-theme-text-primary">"Permission denied" error</span>
                          {expandedTroubleshooting === 'permission' ? (
                            <ChevronUp className="w-5 h-5 text-theme-text-secondary" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-theme-text-secondary" />
                          )}
                        </button>
                        {expandedTroubleshooting === 'permission' && (
                          <div className="px-5 pb-4 pt-2 border-t border-theme-border">
                            <p className="text-sm text-theme-text-secondary">Update Realtime Database rules (see Step 4 above)</p>
                          </div>
                        )}
                      </div>

                      <div className="bg-theme-bg-darkest border border-theme-border rounded-lg overflow-hidden">
                        <button
                          onClick={() => setExpandedTroubleshooting(expandedTroubleshooting === 'auth' ? null : 'auth')}
                          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-theme-bg-darker transition-colors"
                        >
                          <span className="font-medium text-theme-text-primary">"Authentication failed" error</span>
                          {expandedTroubleshooting === 'auth' ? (
                            <ChevronUp className="w-5 h-5 text-theme-text-secondary" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-theme-text-secondary" />
                          )}
                        </button>
                        {expandedTroubleshooting === 'auth' && (
                          <div className="px-5 pb-4 pt-2 border-t border-theme-border">
                            <ul className="text-sm space-y-2 list-disc list-inside ml-2 text-theme-text-secondary">
                              <li>Double-check your API key in Firebase Console → Project Settings</li>
                              <li>Make sure Realtime Database is enabled (not just Firestore)</li>
                              <li>Verify you're using the Web API Key, not a service account key</li>
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-5 border-t border-theme-border flex justify-end flex-shrink-0 bg-theme-bg-darker">
              <button
                onClick={() => setShowDocsDialog(false)}
                className="px-6 py-2.5 text-sm font-medium bg-theme-accent hover:bg-theme-accent-hover text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

