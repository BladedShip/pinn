import { useState, useEffect } from 'react';
import { X, Key, Info, Folder, FolderOpen, AlertCircle, Database } from 'lucide-react';
import { getGeminiApiKey, saveGeminiApiKey } from '../lib/geminiStorage';
import { getFolderPath, requestDirectoryAccess, setDirectoryHandle, clearDirectoryHandle, isFileSystemSupported, isFolderConfigured } from '../lib/fileSystemStorage';
import { refreshStorage } from '../lib/storage';
import { refreshFlowStorage } from '../lib/flowStorage';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onFolderChange?: () => void;
}

type SettingsCategory = 'storage' | 'api';

export default function SettingsDialog({ isOpen, onClose, onFolderChange }: SettingsDialogProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('storage');
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [isChangingFolder, setIsChangingFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const storedKey = getGeminiApiKey();
      setApiKey(storedKey || '');
      setFolderPath(getFolderPath());
      setFolderError(null);
    }
  }, [isOpen]);

  const handleSave = () => {
    setIsSaving(true);
    try {
      if (apiKey.trim()) {
        saveGeminiApiKey(apiKey.trim());
      }
      setTimeout(() => {
        setIsSaving(false);
        onClose();
      }, 200);
    } catch (error) {
      console.error('Error saving API key:', error);
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
      const handle = await requestDirectoryAccess();
      if (handle) {
        await setDirectoryHandle(handle, handle.name);
        setFolderPath(handle.name);
        
        // Refresh storage to load data from new location
        await refreshStorage();
        await refreshFlowStorage();
        
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
      if (onFolderChange) {
        onFolderChange();
      }
    }
  };

  if (!isOpen) return null;

  const categories = [
    { id: 'storage' as SettingsCategory, label: 'Storage', icon: Database, description: 'Manage data storage' },
    { id: 'api' as SettingsCategory, label: 'API Keys', icon: Key, description: 'Configure API settings' },
  ];

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-[#2c3440] rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] border border-gray-700 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-200">Settings</h2>
              <p className="text-xs text-gray-400 mt-0.5">Configure your application preferences</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white hover:bg-[#3a4450] rounded-lg p-1.5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar - Categories */}
          <div className="w-56 border-r border-gray-700 bg-[#252b36] flex-shrink-0 flex flex-col">
            <div className="px-3 py-4 space-y-1">
              {categories.map((category) => {
                const Icon = category.icon;
                const isActive = activeCategory === category.id;
                return (
                  <button
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                      isActive
                        ? 'bg-[#3a4450] text-gray-200 border border-gray-600'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-[#2c3440]'
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0 text-gray-400" />
                    <div className="flex flex-col items-start flex-1 min-w-0">
                      <span className="text-sm font-medium">{category.label}</span>
                      <span className="text-xs opacity-75 truncate w-full">{category.description}</span>
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
                    <h3 className="text-lg font-semibold text-gray-200 mb-1">
                      Storage Folder
                    </h3>
                    <p className="text-sm text-gray-400 mb-6">
                      Choose where to store your notes, folders, and flows. Files can be accessed directly from your file system.
                    </p>
                    
                    {isFolderConfigured() && folderPath ? (
                      <div className="space-y-4">
                        <div className="bg-[#1f2833] border border-gray-700 rounded-lg px-4 py-4 flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 bg-[#3a4450] rounded-lg flex items-center justify-center flex-shrink-0">
                              <FolderOpen className="w-5 h-5 text-gray-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-gray-400 mb-0.5">Current folder</p>
                              <p className="text-sm text-gray-200 truncate font-medium" title={folderPath}>
                                {folderPath}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-3 justify-end">
                          <button
                            onClick={handleChangeFolder}
                            disabled={isChangingFolder}
                            className="px-4 py-2.5 text-sm font-medium bg-[#3a4450] hover:bg-[#424d5a] text-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                        <div className="flex items-start gap-3 p-4 bg-[#1f2833] border border-gray-700/50 rounded-lg">
                          <Info className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div className="text-sm text-gray-400 leading-relaxed">
                            <p className="font-medium text-gray-300 mb-1">Local File Storage</p>
                            <p className="text-xs text-gray-400">
                              All your notes, folders, and flows are stored in this folder as files. You can access, backup, and manage them directly from your file system.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="bg-[#1f2833] border border-gray-700 rounded-lg px-4 py-4 text-gray-400">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-700/50 rounded-lg flex items-center justify-center flex-shrink-0">
                              <Folder className="w-5 h-5 text-gray-500" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-300 mb-0.5">No folder selected</p>
                              <p className="text-xs text-gray-400">Currently using browser storage (localStorage)</p>
                            </div>
                          </div>
                        </div>
                        {isFileSystemSupported() ? (
                          <button
                            onClick={handleChangeFolder}
                            disabled={isChangingFolder}
                            className="px-4 py-3 text-sm font-medium bg-[#3a4450] hover:bg-[#424d5a] text-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                          <div className="bg-[#1f2833] border border-gray-700/50 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                              <AlertCircle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-sm font-medium text-gray-300 mb-1">Browser Not Supported</p>
                                <p className="text-xs text-gray-400">
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

              {/* API Keys Category */}
              {activeCategory === 'api' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-200 mb-1">
                      API Configuration
                    </h3>
                    <p className="text-sm text-gray-400 mb-6">
                      Manage your API keys and authentication settings. All keys are stored locally and never shared.
                    </p>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="flex text-sm font-medium text-gray-300 mb-2 items-center gap-2">
                          <Key className="w-4 h-4" />
                          Gemini API Key
                        </label>
                        <input
                          type="password"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder="Enter your Gemini API key..."
                          className="w-full bg-[#1f2833] border border-gray-700 rounded-lg px-4 py-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent transition-all font-mono text-sm"
                          autoFocus={activeCategory === 'api'}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSave();
                            }
                          }}
                        />
                      </div>
                      
                      <div className="flex items-start gap-3 p-4 bg-[#1f2833] border border-gray-700/50 rounded-lg">
                        <Info className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-gray-400 leading-relaxed">
                          <p className="font-medium text-gray-300 mb-2">Security & Privacy</p>
                          <p className="text-xs mb-2">
                            Your API key is stored locally in your browser and never transmitted to any third-party servers except Google's Gemini API when making requests.
                          </p>
                          <p className="text-xs">
                            Get your free API key from{' '}
                            <a 
                              href="https://makersuite.google.com/app/apikey" 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-gray-300 hover:text-white hover:underline font-medium"
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
        <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3 flex-shrink-0 bg-[#252b36]">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-[#3a4450] rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2.5 text-sm font-medium bg-[#6366F1] hover:bg-[#5b5bf5] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#6366F1]"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

