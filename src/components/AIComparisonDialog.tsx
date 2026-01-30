import { useState, useEffect } from 'react';
import { X, Check, XCircle, Edit2 } from 'lucide-react';

interface AIComparisonDialogProps {
  isOpen: boolean;
  oldText: string;
  newText: string;
  onAccept: (editedText?: string) => void;
  onReject: () => void;
}

export default function AIComparisonDialog({
  isOpen,
  oldText,
  newText,
  onAccept,
  onReject,
}: AIComparisonDialogProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(newText);

  useEffect(() => {
    if (isOpen) {
      setIsEditing(false);
      setEditedText(newText);
    }
  }, [isOpen, newText]);

  const handleAccept = () => {
    onAccept(isEditing ? editedText : undefined);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onReject}
    >
      <div
        className="bg-theme-bg-primary rounded-xl shadow-2xl w-full max-w-4xl border border-theme-border overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-theme-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-theme-accent/20 rounded-lg flex items-center justify-center">
                <Check className="w-6 h-6 text-theme-accent" />
              </div>
              <h2 className="text-xl font-semibold text-theme-text-primary">Review AI Changes</h2>
            </div>
            <button
              onClick={onReject}
              className="text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded-lg p-1.5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="grid grid-cols-2 gap-4 mb-6">
            {/* Old Text */}
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <label className="text-sm font-medium text-theme-text-secondary uppercase tracking-wide">
                  Original Text
                </label>
              </div>
              <div className="flex-1 bg-theme-bg-darkest border border-red-500/30 rounded-lg p-4 max-h-64 overflow-y-auto comparison-scroll">
                <pre
                  className="text-sm text-theme-text-primary whitespace-pre-wrap font-mono leading-relaxed"
                  style={{ margin: 0 }}
                >
                  {oldText}
                </pre>
              </div>
            </div>

            {/* New Text / Edit Mode */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <label className="text-sm font-medium text-theme-text-secondary uppercase tracking-wide">
                    {isEditing ? 'Edit Generated Text' : 'AI Generated'}
                  </label>
                </div>
                {!isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-theme-text-secondary hover:text-theme-accent hover:bg-theme-bg-secondary rounded-lg transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                )}
              </div>
              {isEditing ? (
                <textarea
                  value={editedText}
                  onChange={e => setEditedText(e.target.value)}
                  className="flex-1 bg-theme-bg-darkest border border-green-500/30 rounded-lg p-4 max-h-64 text-sm text-theme-text-primary font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-[#6366F1] focus:border-transparent comparison-scroll"
                  autoFocus
                />
              ) : (
                <div className="flex-1 bg-theme-bg-darkest border border-green-500/30 rounded-lg p-4 max-h-64 overflow-y-auto comparison-scroll">
                  <pre
                    className="text-sm text-theme-text-primary whitespace-pre-wrap font-mono leading-relaxed"
                    style={{ margin: 0 }}
                  >
                    {editedText}
                  </pre>
                </div>
              )}
              {isEditing && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => {
                      setEditedText(newText);
                      setIsEditing(false);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary rounded transition-colors"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 text-xs font-medium text-theme-accent hover:bg-theme-accent/20 rounded transition-colors"
                  >
                    Done Editing
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-theme-border">
            <button
              onClick={onReject}
              className="px-5 py-2.5 text-sm font-medium text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary rounded-lg transition-colors flex items-center gap-2"
            >
              <XCircle className="w-4 h-4" />
              Keep Original
            </button>
            <button
              onClick={handleAccept}
              disabled={isEditing && !editedText.trim()}
              className="px-5 py-2.5 text-sm font-medium bg-theme-accent hover:bg-theme-accent-hover text-white rounded-lg transition-all shadow-lg hover:shadow-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-theme-accent"
            >
              <Check className="w-4 h-4" />
              {isEditing ? 'Accept Edited' : 'Accept Changes'}
            </button>
          </div>
        </div>
      </div>
      <style>{`
        .comparison-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .comparison-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
