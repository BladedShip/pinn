import { useState, useEffect } from 'react';
import HomePage from './components/HomePage';
import EditorPage from './components/EditorPage';
import FlowsPage from './components/FlowsPage';
import FlowPage from './components/FlowPage';
import NotesPage from './components/NotesPage';
import OnboardingDialog from './components/OnboardingDialog';
import { FileText, Folder, X, AlertCircle } from 'lucide-react';
import { isFolderConfigured, initializeDirectoryHandle, hasDirectoryAccess, hasValidDirectoryAccess, restoreDirectoryAccess, getFolderPath } from './lib/fileSystemStorage';
import { initStorage, refreshStorage } from './lib/storage';
import { initFlowStorage, refreshFlowStorage } from './lib/flowStorage';

function App() {
  const [currentView, setCurrentView] = useState<'home' | 'editor' | 'flows' | 'flow' | 'notes'>('home');
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [currentFlowId, setCurrentFlowId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [needsPermissionRestore, setNeedsPermissionRestore] = useState(false);
  const [isRestoringPermission, setIsRestoringPermission] = useState(false);

  // Detect mobile devices
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                             window.innerWidth < 768;
      setIsMobile(isMobileDevice);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initialize storage and check for onboarding
  useEffect(() => {
    const initialize = async () => {
      try {
        console.log('App initialization started');
        
        // Check if folder is configured FIRST (before trying to restore handle)
        // This ensures we don't show onboarding if folder was previously configured
        const folderConfigured = isFolderConfigured();
        console.log('Folder configured check:', folderConfigured);
        
        // First, restore directory handle from IndexedDB if configured
        await initializeDirectoryHandle();
        const handleAvailable = hasDirectoryAccess();
        console.log('Directory handle initialization completed, handle available:', handleAvailable);
        
        // Give a tiny delay to ensure handle is fully set
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Check if we have valid access (handle exists AND permission is granted)
        const hasValidAccess = handleAvailable ? await hasValidDirectoryAccess() : false;
        console.log('Valid directory access check:', hasValidAccess);
        
        // Initialize storage (will use file system or localStorage)
        // Storage will use file system if folder is configured (even if handle needs re-granting)
        await initStorage();
        await initFlowStorage();
        console.log('Storage initialization completed');
        
        // Only show onboarding if folder was never configured
        // If folder is configured but handle is missing, we'll let the user use the app
        // and they can re-grant permission when needed
        if (!folderConfigured) {
          console.log('No folder configured, showing onboarding');
          setShowOnboarding(true);
        } else {
          console.log('Folder is configured, proceeding with app');
          // Check if we need to show permission restore banner
          // Show banner if folder is configured but we don't have valid access
          if (!hasValidAccess) {
            console.log('Folder configured but no valid access, showing restore banner');
            setNeedsPermissionRestore(true);
          }
        }
      } catch (error) {
        console.error('Error initializing app:', error);
      } finally {
        setIsInitializing(false);
      }
    };

    initialize();
  }, []);

  const handleOnboardingComplete = async () => {
    // Refresh storage to ensure it uses the file system
    await refreshStorage();
    await refreshFlowStorage();
    setShowOnboarding(false);
  };

  // Check if folder was removed or access needs restoration (will trigger onboarding or banner)
  useEffect(() => {
    if (!isInitializing && !showOnboarding) {
      const checkAccess = async () => {
        const folderConfigured = isFolderConfigured();
        const hasAccess = hasDirectoryAccess();
        
        if (!folderConfigured && !isMobile) {
          // Folder was removed, show onboarding
          setShowOnboarding(true);
        } else if (folderConfigured && !isMobile) {
          // Check if we have valid access (not just handle existence)
          const hasValidAccess = hasAccess ? await hasValidDirectoryAccess() : false;
          if (!hasValidAccess) {
            // Folder configured but access missing, show restore banner
            setNeedsPermissionRestore(true);
          } else {
            // Valid access is available, hide restore banner
            setNeedsPermissionRestore(false);
          }
        }
      };
      
      checkAccess();
    }
  }, [isInitializing, showOnboarding, isMobile]);

  const handleRestorePermission = async () => {
    setIsRestoringPermission(true);
    try {
      console.log('Attempting to restore directory access...');
      const success = await restoreDirectoryAccess();
      console.log('Restore result:', success);
      if (success) {
        // Refresh storage to load from file system
        await refreshStorage();
        await refreshFlowStorage();
        setNeedsPermissionRestore(false);
        
        // Trigger a storage refresh event so all components reload their data
        window.dispatchEvent(new CustomEvent('storage-refresh'));
      } else {
        // User cancelled the folder selection
        console.log('User cancelled folder selection');
      }
    } catch (error: any) {
      console.error('Error restoring permission:', error);
      // If there's an error, user can try again or go to settings
      // Don't show error message - just let them try again
    } finally {
      setIsRestoringPermission(false);
    }
  };

  const navigateToHome = () => {
    setCurrentView('home');
    setCurrentNoteId(null);
    setCurrentFlowId(null);
  };

  const navigateToEditor = (noteId?: string) => {
    setCurrentNoteId(noteId || null);
    setCurrentView('editor');
    setCurrentFlowId(null);
  };

  const navigateToFlows = () => {
    setCurrentView('flows');
    setCurrentNoteId(null);
    setCurrentFlowId(null);
  };

  const navigateToNotes = () => {
    setCurrentView('notes');
    setCurrentNoteId(null);
    setCurrentFlowId(null);
  };

  const navigateToFlow = (flowId?: string) => {
    setCurrentFlowId(flowId || null);
    setCurrentView('flow');
    setCurrentNoteId(null);
  };

  // Show loading state while initializing
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-[#2c3440] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  // Mobile Warning Overlay - blocks all access on mobile
  if (isMobile) {
    return (
      <div className="min-h-screen bg-[#2c3440] flex items-center justify-center px-4 py-8">
        <div className="bg-[#2c3440] rounded-xl shadow-2xl max-w-sm w-full p-6 sm:p-8 border border-gray-700/80 text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#6366F1]/10 flex items-center justify-center mx-auto mb-5 sm:mb-6 border border-[#6366F1]/20">
            <FileText className="w-7 h-7 sm:w-8 sm:h-8 text-[#6366F1]" />
          </div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-200 mb-3 sm:mb-4 leading-tight">
            Desktop Experience Required
          </h2>
          <p className="text-sm sm:text-base text-gray-400 mb-4 sm:mb-6 leading-relaxed px-1">
            This application is optimized for desktop use. Please access it from a desktop or laptop for the best experience.
          </p>
          <div className="space-y-2 sm:space-y-2.5 pt-3 border-t border-gray-700/50">
            <div className="flex items-start gap-2 text-left">
              <span className="text-[#6366F1] mt-0.5 flex-shrink-0">•</span>
              <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
                Keyboard shortcuts for navigation
              </p>
            </div>
            <div className="flex items-start gap-2 text-left">
              <span className="text-[#6366F1] mt-0.5 flex-shrink-0">•</span>
              <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
                Precise mouse interactions
              </p>
            </div>
            <div className="flex items-start gap-2 text-left">
              <span className="text-[#6366F1] mt-0.5 flex-shrink-0">•</span>
              <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
                Larger screen for optimal viewing
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const folderPath = getFolderPath();

  return (
    <div className="min-h-screen bg-[#2c3440] text-gray-300">
      {showOnboarding ? (
        <OnboardingDialog onComplete={handleOnboardingComplete} />
      ) : (
        <>
          {/* Permission Restore Banner */}
          {needsPermissionRestore && (
            <div className="fixed top-0 left-0 right-0 z-50 bg-[#6366F1]/10 border-b border-[#6366F1]/30 backdrop-blur-sm">
              <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0 w-10 h-10 bg-[#6366F1]/20 rounded-lg flex items-center justify-center">
                    <Folder className="w-5 h-5 text-[#6366F1]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-200">
                      Folder access needs to be restored
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {folderPath ? `Your folder "${folderPath}" is configured. Click to restore access (you may need to select the same folder again).` : 'Your folder is configured. Click to restore access (you may need to select the same folder again).'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button
                    onClick={handleRestorePermission}
                    disabled={isRestoringPermission}
                    className="px-4 py-2 text-sm font-medium bg-[#6366F1] hover:bg-[#5b5bf5] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#6366F1] flex items-center gap-2"
                  >
                    {isRestoringPermission ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Restoring...</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4" />
                        <span>Restore Access</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setNeedsPermissionRestore(false)}
                    className="text-gray-400 hover:text-white hover:bg-[#3a4450] rounded-lg p-1.5 transition-colors flex-shrink-0"
                    title="Dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Main Content - adjust padding if banner is visible */}
          <div className={needsPermissionRestore ? 'pt-16' : ''}>
            {currentView === 'home' ? (
              <HomePage onNavigateToEditor={navigateToEditor} onNavigateToFlows={navigateToFlows} onNavigateToFlow={navigateToFlow} onNavigateToNotes={navigateToNotes} />
            ) : currentView === 'editor' ? (
              <EditorPage noteId={currentNoteId} onNavigateToHome={navigateToHome} onNavigateToFlows={navigateToFlows} onNavigateToNotes={navigateToNotes} />
            ) : currentView === 'flows' ? (
              <FlowsPage onNavigateToFlow={navigateToFlow} onNavigateToHome={navigateToHome} onNavigateToNotes={navigateToNotes} />
            ) : currentView === 'notes' ? (
              <NotesPage onNavigateToEditor={navigateToEditor} onNavigateToHome={navigateToHome} onNavigateToFlows={navigateToFlows} />
            ) : (
              <FlowPage flowId={currentFlowId} onNavigateToHome={navigateToHome} onNavigateToEditor={navigateToEditor} onNavigateToFlows={navigateToFlows} onNavigateToNotes={navigateToNotes} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default App;
