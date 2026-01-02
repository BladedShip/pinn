import { useState, useEffect } from 'react';
import { X, Search, FileText } from 'lucide-react';
import { getNotes, Note } from '../lib/storage';
import { logger } from '../utils/logger';

interface NoteReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectNote: (noteId: string, noteTitle: string) => void;
  currentNoteId?: string | null;
}

export default function NoteReferenceModal({
  isOpen,
  onClose,
  onSelectNote,
  currentNoteId,
}: NoteReferenceModalProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredNotes, setFilteredNotes] = useState<Note[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadNotes();
      setSearchQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    filterNotes();
  }, [notes, searchQuery]);

  const loadNotes = () => {
    try {
      const allNotes = getNotes();
      // Filter out the current note from the list
      const availableNotes = allNotes.filter((note) => note.id !== currentNoteId);
      setNotes(availableNotes);
    } catch (error) {
      logger.error('Error loading notes:', error);
      setNotes([]);
    }
  };

  const filterNotes = () => {
    if (!searchQuery.trim()) {
      setFilteredNotes(notes);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = notes.filter(
      (note) =>
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query)
    );
    setFilteredNotes(filtered);
  };

  const handleSelectNote = (noteId: string, noteTitle: string) => {
    onSelectNote(noteId, noteTitle);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-theme-bg-primary rounded-xl shadow-2xl w-full max-w-2xl border border-theme-border overflow-hidden">
        <div className="px-6 py-5 border-b border-theme-border">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-light text-theme-text-primary">Reference a Note</h2>
            <button
              onClick={onClose}
              className="text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded-lg p-1.5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-theme-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-theme-bg-secondary border border-theme-border rounded-lg pl-10 pr-3 py-2 text-sm text-theme-text-primary placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors"
              autoFocus
            />
          </div>
        </div>

        <div 
          className="px-6 py-4 max-h-96 overflow-y-auto note-reference-modal-scroll"
          style={{ 
            scrollbarWidth: 'none', /* Firefox */
            msOverflowStyle: 'none', /* IE and Edge */
          }}
        >
          {filteredNotes.length > 0 ? (
            <div className="space-y-2">
              {filteredNotes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => handleSelectNote(note.id, note.title)}
                  className="w-full text-left px-4 py-3 bg-theme-bg-secondary hover:bg-theme-bg-tertiary rounded-lg transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-theme-accent mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-theme-text-primary group-hover:text-white transition-colors font-medium truncate">
                        {note.title || 'Untitled'}
                      </h3>
                      {note.folder && (
                        <p className="text-xs text-gray-500 mt-1">
                          {note.folder}
                        </p>
                      )}
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                        {note.content.substring(0, 150) || 'No content'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-theme-text-secondary">
                {searchQuery ? 'No notes found matching your search' : 'No notes available'}
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-theme-border bg-theme-bg-secondary">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-primary rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
      <style>{`
        .note-reference-modal-scroll::-webkit-scrollbar {
          display: none; /* Chrome, Safari, Opera */
        }
      `}</style>
    </div>
  );
}

