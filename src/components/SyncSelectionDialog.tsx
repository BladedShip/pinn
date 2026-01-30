import { useState, useEffect } from 'react';
import { X, Check, Search, FileText, GitBranch, Folder } from 'lucide-react';
import { getNotes, Note } from '../lib/storage';
import { getFlows, Flow } from '../lib/flowStorage';

interface SyncSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedNotes: string[], selectedFlows: string[]) => void;
}

export default function SyncSelectionDialog({
  isOpen,
  onClose,
  onConfirm,
}: SyncSelectionDialogProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [selectedFlows, setSelectedFlows] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'notes' | 'flows'>('notes');

  useEffect(() => {
    if (isOpen) {
      // Load notes and flows when dialog opens
      const allNotes = getNotes();
      const allFlows = getFlows();
      setNotes(allNotes);
      setFlows(allFlows);

      // Select all by default
      setSelectedNotes(new Set(allNotes.map(n => n.id)));
      setSelectedFlows(new Set(allFlows.map(f => f.id)));
    } else {
      // Reset when closed
      setSearchQuery('');
      setSelectedNotes(new Set());
      setSelectedFlows(new Set());
    }
  }, [isOpen]);

  const filteredNotes = notes.filter(
    note =>
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFlows = flows.filter(flow =>
    flow.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleNote = (noteId: string) => {
    const newSet = new Set(selectedNotes);
    if (newSet.has(noteId)) {
      newSet.delete(noteId);
    } else {
      newSet.add(noteId);
    }
    setSelectedNotes(newSet);
  };

  const toggleFlow = (flowId: string) => {
    const newSet = new Set(selectedFlows);
    if (newSet.has(flowId)) {
      newSet.delete(flowId);
    } else {
      newSet.add(flowId);
    }
    setSelectedFlows(newSet);
  };

  const selectAll = () => {
    if (activeTab === 'notes') {
      setSelectedNotes(new Set(filteredNotes.map(n => n.id)));
    } else {
      setSelectedFlows(new Set(filteredFlows.map(f => f.id)));
    }
  };

  const deselectAll = () => {
    if (activeTab === 'notes') {
      setSelectedNotes(new Set());
    } else {
      setSelectedFlows(new Set());
    }
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selectedNotes), Array.from(selectedFlows));
    onClose();
  };

  if (!isOpen) return null;

  const currentSelectedCount = activeTab === 'notes' ? selectedNotes.size : selectedFlows.size;
  const currentTotalCount = activeTab === 'notes' ? filteredNotes.length : filteredFlows.length;
  const allSelected = currentTotalCount > 0 && currentSelectedCount === currentTotalCount;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div
        className="bg-theme-bg-primary rounded-xl shadow-2xl w-full max-w-3xl h-[85vh] border border-theme-border overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-theme-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-theme-text-primary">
                Select Items to Sync
              </h2>
              <p className="text-xs text-theme-text-secondary mt-0.5">
                Choose which notes and flows to sync to the cloud
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded-lg p-1.5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 py-3 border-b border-theme-border flex gap-2 flex-shrink-0">
          <button
            onClick={() => setActiveTab('notes')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
              activeTab === 'notes'
                ? 'bg-theme-accent text-white'
                : 'bg-theme-bg-secondary text-theme-text-secondary hover:text-theme-text-primary'
            }`}
          >
            <FileText className="w-4 h-4" />
            Notes ({notes.length})
          </button>
          <button
            onClick={() => setActiveTab('flows')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
              activeTab === 'flows'
                ? 'bg-theme-accent text-white'
                : 'bg-theme-bg-secondary text-theme-text-secondary hover:text-theme-text-primary'
            }`}
          >
            <GitBranch className="w-4 h-4" />
            Flows ({flows.length})
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-theme-border flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-theme-text-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeTab}...`}
              className="w-full bg-theme-bg-darker border border-theme-border rounded-lg pl-10 pr-4 py-2 text-theme-text-primary placeholder-theme-text-tertiary focus:outline-none focus:ring-2 focus:ring-theme-border focus:border-transparent transition-all text-sm"
            />
          </div>
        </div>

        {/* Selection Controls */}
        <div className="px-6 py-3 border-b border-theme-border flex items-center justify-between flex-shrink-0">
          <div className="text-sm text-theme-text-secondary">
            {currentSelectedCount} of {currentTotalCount} {activeTab} selected
          </div>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              disabled={allSelected}
              className="px-3 py-1.5 text-xs font-medium bg-theme-bg-secondary hover:bg-theme-bg-tertiary text-theme-text-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Select All
            </button>
            <button
              onClick={deselectAll}
              disabled={currentSelectedCount === 0}
              className="px-3 py-1.5 text-xs font-medium bg-theme-bg-secondary hover:bg-theme-bg-tertiary text-theme-text-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Deselect All
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'notes' ? (
            <div className="space-y-2">
              {filteredNotes.length === 0 ? (
                <div className="text-center py-12 text-theme-text-secondary">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">
                    {searchQuery ? 'No notes match your search' : 'No notes available'}
                  </p>
                </div>
              ) : (
                filteredNotes.map(note => {
                  const isSelected = selectedNotes.has(note.id);
                  return (
                    <div
                      key={note.id}
                      onClick={() => toggleNote(note.id)}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-theme-accent bg-theme-accent/10'
                          : 'border-theme-border bg-theme-bg-darkest hover:border-theme-border-light'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            isSelected
                              ? 'border-theme-accent bg-theme-accent'
                              : 'border-theme-border'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-theme-text-primary mb-1">
                            {note.title || 'Untitled'}
                          </div>
                          <div className="text-xs text-theme-text-secondary line-clamp-2">
                            {note.content.substring(0, 150)}
                            {note.content.length > 150 ? '...' : ''}
                          </div>
                          {note.folder && (
                            <div className="text-xs text-theme-text-tertiary mt-1 flex items-center gap-1">
                              <Folder className="w-3 h-3" />
                              <span>{note.folder}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredFlows.length === 0 ? (
                <div className="text-center py-12 text-theme-text-secondary">
                  <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">
                    {searchQuery ? 'No flows match your search' : 'No flows available'}
                  </p>
                </div>
              ) : (
                filteredFlows.map(flow => {
                  const isSelected = selectedFlows.has(flow.id);
                  return (
                    <div
                      key={flow.id}
                      onClick={() => toggleFlow(flow.id)}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-theme-accent bg-theme-accent/10'
                          : 'border-theme-border bg-theme-bg-darkest hover:border-theme-border-light'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            isSelected
                              ? 'border-theme-accent bg-theme-accent'
                              : 'border-theme-border'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-theme-text-primary mb-1">
                            {flow.title || 'Untitled Flow'}
                          </div>
                          <div className="text-xs text-theme-text-secondary">
                            {flow.nodes.length} nodes, {flow.edges.length} connections
                          </div>
                          {flow.category && (
                            <div className="text-xs text-theme-text-tertiary mt-1 flex items-center gap-1">
                              <Folder className="w-3 h-3" />
                              <span>{flow.category}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-theme-border flex justify-between items-center flex-shrink-0 bg-theme-bg-darker">
          <div className="text-sm text-theme-text-secondary">
            {selectedNotes.size + selectedFlows.size} item
            {selectedNotes.size + selectedFlows.size !== 1 ? 's' : ''} selected
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedNotes.size === 0 && selectedFlows.size === 0}
              className="px-5 py-2.5 text-sm font-medium bg-theme-accent hover:bg-theme-accent-hover text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-theme-accent"
            >
              Sync Selected ({selectedNotes.size + selectedFlows.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
