import { useState, useEffect } from 'react';
import { X, Key, Info, Folder, FolderOpen, AlertCircle, Database, Palette } from 'lucide-react';
import { getGeminiApiKey, saveGeminiApiKey } from '../lib/geminiStorage';
import { getFolderPath, requestDirectoryAccess, setDirectoryHandle, clearDirectoryHandle, isFileSystemSupported, isFolderConfigured, hasDirectoryAccess, restoreDirectoryAccess } from '../lib/fileSystemStorage';
import { refreshStorage } from '../lib/storage';
import { refreshFlowStorage } from '../lib/flowStorage';
import { getTheme, saveTheme, applyTheme, Theme } from '../lib/themeStorage';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onFolderChange?: () => void;
}

type SettingsCategory = 'storage' | 'api' | 'appearance';

export default function SettingsDialog({ isOpen, onClose, onFolderChange }: SettingsDialogProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('storage');
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [isChangingFolder, setIsChangingFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [isRestoringAccess, setIsRestoringAccess] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<Theme>('default');

  useEffect(() => {
    if (isOpen) {
      const storedKey = getGeminiApiKey();
      setApiKey(storedKey || '');
      setFolderPath(getFolderPath());
      setFolderError(null);
      setSelectedTheme(getTheme());
    }
  }, [isOpen]);

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
        saveGeminiApiKey(apiKey.trim());
      }
      // Save theme
      await saveTheme(selectedTheme);
      applyTheme(selectedTheme);
      
      setTimeout(() => {
        setIsSaving(false);
        onClose();
      }, 200);
    } catch (error) {
      console.error('Error saving settings:', error);
      setIsSaving(false);
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
      
      // Trigger storage refresh event so all components reload their data
      window.dispatchEvent(new CustomEvent('storage-refresh'));
      
      if (onFolderChange) {
        onFolderChange();
      }
    }
  };

  if (!isOpen) return null;

  const categories = [
    { id: 'storage' as SettingsCategory, label: 'Storage', icon: Database, description: 'Manage data storage' },
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
          <div className="flex-1 overflow-y-auto">
            <div className="p-6">
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
                        <label className="flex text-sm font-medium text-theme-text-primary mb-2 items-center gap-2">
                          <Key className="w-4 h-4" />
                          Gemini API Key
                        </label>
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
    </div>
  );
}

