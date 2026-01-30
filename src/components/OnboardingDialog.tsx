import { useState } from 'react';
import { Folder, Info, AlertCircle, ShieldCheck, HardDrive, Book, ArrowRight } from 'lucide-react';
import {
  requestDirectoryAccess,
  setDirectoryHandle,
  isFileSystemSupported,
} from '../lib/fileSystemStorage';
import { logger } from '../utils/logger';

interface OnboardingDialogProps {
  onComplete: () => void;
}

export default function OnboardingDialog({ onComplete }: OnboardingDialogProps) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectFolder = async () => {
    if (!isFileSystemSupported()) {
      setError(
        'Your browser does not support the File System Access API. Please use Chrome, Edge, or Opera.'
      );
      return;
    }

    setIsSelecting(true);
    setError(null);

    try {
      const handle = await requestDirectoryAccess('Pinn');

      if (!handle) {
        // User cancelled
        setIsSelecting(false);
        return;
      }

      // Set the directory handle (async now)
      await setDirectoryHandle(handle, handle.name);

      // Wait a moment to show success message
      setTimeout(() => {
        onComplete();
      }, 500);
    } catch (err: any) {
      logger.error('Error selecting folder:', err);
      setError(err.message || 'Failed to select folder. Please try again.');
      setIsSelecting(false);
    }
  };

  if (!isFileSystemSupported()) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-theme-bg-primary rounded-xl shadow-2xl w-full max-w-2xl border border-theme-border overflow-hidden">
          <div className="px-6 py-5 border-b border-theme-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <h2 className="text-xl font-semibold text-theme-text-primary">
                Browser Not Supported
              </h2>
            </div>
          </div>
          <div className="px-6 py-6">
            <p className="text-theme-text-primary mb-4">
              The File System Access API is required for this feature. Please use one of the
              following browsers:
            </p>
            <ul className="list-disc list-inside space-y-2 text-theme-text-secondary mb-6">
              <li>Google Chrome (recommended)</li>
              <li>Microsoft Edge</li>
              <li>Opera</li>
            </ul>
            <p className="text-sm text-gray-500">
              Note: This feature is not available in Firefox or Safari. You can continue using
              browser storage by closing this dialog, but file system storage won't be available.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-theme-bg-primary rounded-xl shadow-2xl w-full max-w-3xl border border-theme-border overflow-hidden">
        <div className="px-6 py-5 border-b border-theme-border">
          <div>
            <span className="inline-flex items-center rounded-md bg-theme-bg-secondary border border-theme-border px-2 py-0.5 text-[11px] text-theme-text-primary mb-2">
              Welcome to Pinn.
            </span>
            <h2 className="text-xl font-semibold text-theme-text-primary">
              Choose your workspace folder
            </h2>
            <p className="text-sm text-theme-text-secondary mt-1">
              All adds, edits, and deletes will happen inside this folder.
            </p>
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-theme-bg-secondary border border-theme-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2 text-theme-text-primary">
                <HardDrive className="w-4 h-4 text-theme-accent" />
                <span className="text-sm font-medium">Local-first</span>
              </div>
              <p className="text-xs text-theme-text-secondary leading-relaxed">
                Notes and flows are saved as files in your folder. No cloud, fully offline.
              </p>
            </div>
            <div className="bg-theme-bg-secondary border border-theme-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2 text-theme-text-primary">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium">Private by design</span>
              </div>
              <p className="text-xs text-theme-text-secondary leading-relaxed">
                Data never leaves your device. You control the files and where they live.
              </p>
            </div>
            <div className="bg-theme-bg-secondary border border-theme-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2 text-theme-text-primary">
                <Book className="w-4 h-4 text-[#e8935f]" />
                <span className="text-sm font-medium">Simple files</span>
              </div>
              <p className="text-xs text-theme-text-secondary leading-relaxed">
                We use readable JSON/Markdown. You can back up or version them easily.
              </p>
            </div>
          </div>

          <div className="bg-theme-bg-darkest border border-theme-border rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-theme-accent flex-shrink-0 mt-0.5" />
              <div className="text-sm text-theme-text-primary leading-relaxed">
                <p className="mb-2">
                  When you press Select Folder, your browser will show a permission dialog asking
                  you to allow this site to edit files in the folder you pick.
                </p>
                <div className="mt-3 rounded-lg border border-theme-border bg-theme-bg-primary px-3 py-2 text-xs text-theme-text-secondary">
                  <div className="flex items-center">
                    <span className="opacity-80">Example prompt:</span>
                    <div className="ml-2 inline-flex items-center gap-2 rounded-md bg-theme-bg-secondary px-3 py-1.5 border border-theme-border">
                      <span className="text-theme-text-primary">
                        Allow this site to edit files?
                      </span>
                      <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-sky-500/20 text-sky-300 px-2 py-0.5 text-[11px]">
                        <span>Allow</span>
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-theme-border">
            <div className="text-xs text-gray-500">
              Recommended location:{' '}
              <span className="text-theme-text-secondary">Documents/Pinn</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSelectFolder}
                disabled={isSelecting}
                className="px-5 py-2.5 text-sm font-medium bg-theme-accent hover:bg-theme-accent-hover text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-theme-accent shadow-lg hover:shadow-xl flex items-center gap-2"
              >
                {isSelecting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Selecting…</span>
                  </>
                ) : (
                  <>
                    <Folder className="w-4 h-4" />
                    <span>Select Folder</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
