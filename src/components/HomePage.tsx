import { useState, useEffect, useRef } from 'react';
import { Search, Plus, Menu as MenuIcon, FileText, Download, Upload, Trash2, GitBranch, Bookmark, Book, Sparkles, Settings } from 'lucide-react';
import { getNotes as loadFromStorage, Note, writeAll } from '../lib/storage';
import { getFlows, Flow } from '../lib/flowStorage';
import ConfirmDialog from './ConfirmDialog';
import Toast from './Toast';
import SettingsDialog from './SettingsDialog';
import JSZip from 'jszip';

interface HomePageProps {
  onNavigateToEditor: (noteId?: string) => void;
  onNavigateToFlows: () => void;
  onNavigateToFlow: (flowId: string) => void;
  onNavigateToNotes: () => void;
}

export default function HomePage({ onNavigateToEditor, onNavigateToFlows, onNavigateToFlow, onNavigateToNotes }: HomePageProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [filteredNotes, setFilteredNotes] = useState<Note[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [filteredFlows, setFilteredFlows] = useState<Flow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'title' | 'date'>('date');
  const [flowSortBy, setFlowSortBy] = useState<'title' | 'date'>('date');
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [toast, setToast] = useState<{ isOpen: boolean; message: string; type: 'success' | 'error' }>({
    isOpen: false,
    message: '',
    type: 'success',
  });
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadNotes();
    loadFlows();
    
    // Listen for storage refresh events (e.g., after folder restore)
    const handleStorageRefresh = () => {
      loadNotes();
      loadFlows();
    };
    
    window.addEventListener('storage-refresh', handleStorageRefresh);
    
    return () => {
      window.removeEventListener('storage-refresh', handleStorageRefresh);
    };
  }, []);

  useEffect(() => {
    filterAndSortNotes();
    filterAndSortFlows();
  }, [notes, flows, searchQuery, sortBy, flowSortBy]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  const loadNotes = () => {
    try {
      const data = loadFromStorage();
      setNotes(data || []);
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFlows = () => {
    try {
      const data = getFlows();
      setFlows(data || []);
    } catch (error) {
      console.error('Error loading flows:', error);
    }
  };

  const filterAndSortNotes = () => {
    let filtered = notes;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = notes.filter(
        (note) =>
          note.title.toLowerCase().includes(query) ||
          note.content.toLowerCase().includes(query)
      );
    }

    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    setFilteredNotes(filtered);
  };

  const filterAndSortFlows = () => {
    let filtered = flows;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = flows.filter(
        (flow) =>
          flow.title.toLowerCase().includes(query) ||
          flow.tags?.some((tag) => tag.toLowerCase().includes(query)) ||
          flow.nodes?.some((node) => node.data.label.toLowerCase().includes(query))
      );
    }

    filtered = [...filtered].sort((a, b) => {
      if (flowSortBy === 'title') {
        return a.title.localeCompare(b.title);
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    setFilteredFlows(filtered);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const handleNewNote = () => {
    onNavigateToEditor();
  };

  const handleExportAll = async () => {
    const allNotes = loadFromStorage();
    if (allNotes.length === 0) {
      setToast({
        isOpen: true,
        message: 'No notes to export.',
        type: 'error',
      });
      setMenuOpen(false);
      return;
    }

    try {
      const zip = new JSZip();
      
      // Add each note as an individual JSON file
      allNotes.forEach((note) => {
        const sanitizedName = note.title.replace(/[^a-z0-9]/gi, '_') || 'Untitled';
        // Use note ID to ensure uniqueness if titles are similar
        const fileName = `${sanitizedName}_${note.id.slice(0, 8)}.json`;
        zip.file(fileName, JSON.stringify(note, null, 2));
      });

      // Generate ZIP file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pinn-notes-export.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMenuOpen(false);
    } catch (error) {
      console.error('Error creating ZIP file:', error);
      setToast({
        isOpen: true,
        message: 'Failed to create export file.',
        type: 'error',
      });
      setMenuOpen(false);
    }
  };

  const handleExportAllMarkdown = async () => {
    const allNotes = loadFromStorage();
    if (allNotes.length === 0) {
      setToast({
        isOpen: true,
        message: 'No notes to export.',
        type: 'error',
      });
      setMenuOpen(false);
      return;
    }

    try {
      const zip = new JSZip();
      
      // Add each note as an individual Markdown file
      allNotes.forEach((note) => {
        const sanitizedName = note.title.replace(/[^a-z0-9]/gi, '_') || 'Untitled';
        // Use note ID to ensure uniqueness if titles are similar
        const fileName = `${sanitizedName}_${note.id.slice(0, 8)}.md`;
        const markdown = `# ${note.title}\n\n${note.content}`;
        zip.file(fileName, markdown);
      });

      // Generate ZIP file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pinn-notes-export.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMenuOpen(false);
    } catch (error) {
      console.error('Error creating ZIP file:', error);
      setToast({
        isOpen: true,
        message: 'Failed to create export file.',
        type: 'error',
      });
      setMenuOpen(false);
    }
  };

  const handleImportNotes = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const importedData = JSON.parse(content);
          
          // Handle both single note and array of notes
          const notesToImport = Array.isArray(importedData) ? importedData : [importedData];
          
          // Validate notes structure
          const validNotes = notesToImport.filter((note: any) => 
            note && typeof note === 'object' && note.title !== undefined && note.content !== undefined
          );

          if (validNotes.length === 0) {
            setToast({
              isOpen: true,
              message: 'No valid notes found in the file. Please ensure the file contains notes with title and content fields.',
              type: 'error',
            });
            return;
          }

          // Import notes (generate new IDs and timestamps)
          const existingNotes = loadFromStorage();
          const importedNotes = validNotes.map((note: any) => ({
            id: crypto.randomUUID(),
            title: note.title || 'Untitled',
            content: note.content || '',
            created_at: note.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }));

          // Merge with existing notes
          const allNotes = [...importedNotes, ...existingNotes];
          writeAll(allNotes);

          // Reload notes
          loadNotes();

          setToast({
            isOpen: true,
            message: `Successfully imported ${importedNotes.length} note(s).`,
            type: 'success',
          });
          setMenuOpen(false);
        } catch (error) {
          console.error('Error importing notes:', error);
          setToast({
            isOpen: true,
            message: 'Failed to import notes. Please ensure the file is a valid JSON file.',
            type: 'error',
          });
        }
      };
      reader.readAsText(file);
    };
    input.click();
    setMenuOpen(false);
  };

  const handleClearAll = () => {
    setShowClearAllConfirm(true);
    setMenuOpen(false);
  };

  const confirmClearAll = () => {
    writeAll([]);
    setNotes([]);
    setFilteredNotes([]);
  };

  return (
    <div className="min-h-screen bg-theme-bg-primary">
      <header className="sticky top-0 z-50 bg-theme-bg-primary flex items-center justify-between px-6 py-4 border-b border-theme-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#e8935f] rounded-lg flex items-center justify-center">
            <Bookmark className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-light text-theme-text-primary">Pinn.</h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleNewNote}
            className="flex items-center gap-2 px-4 py-2 text-theme-text-primary hover:text-white transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>New Note</span>
          </button>
          <button
            onClick={onNavigateToNotes}
            className="flex items-center gap-2 px-4 py-2 text-theme-text-primary hover:text-white transition-colors"
          >
            <Book className="w-5 h-5" />
            <span>Notes</span>
          </button>
          <button
            onClick={onNavigateToFlows}
            className="flex items-center gap-2 px-4 py-2 text-theme-text-primary hover:text-white transition-colors"
          >
            <GitBranch className="w-5 h-5" />
            <span>Flow</span>
          </button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 px-4 py-2 text-theme-text-primary hover:text-white transition-colors"
            >
              <MenuIcon className="w-5 h-5" />
              <span>Menu</span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-theme-bg-secondary border border-gray-600 rounded-lg shadow-lg z-50">
                <div className="py-1">
                  <button
                    onClick={handleImportNotes}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-theme-text-primary hover:bg-theme-bg-primary hover:text-white transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Import Notes</span>
                  </button>
                  <div className="border-t border-gray-600 my-1" />
                  <button
                    onClick={handleExportAll}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-theme-text-primary hover:bg-theme-bg-primary hover:text-white transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export All Notes (JSON)</span>
                  </button>
                  <button
                    onClick={handleExportAllMarkdown}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-theme-text-primary hover:bg-theme-bg-primary hover:text-white transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export All Notes (Markdown)</span>
                  </button>
                  <div className="border-t border-gray-600 my-1" />
                  <button
                    onClick={handleClearAll}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-red-400 hover:bg-theme-bg-primary hover:text-red-300 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Clear All Notes</span>
                  </button>
                  <div className="border-t border-gray-600 my-1" />
                  <button
                    onClick={() => {
                      setShowSettingsDialog(true);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-theme-text-primary hover:bg-theme-bg-primary hover:text-white transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="relative mb-16">
          <div className="absolute inset-0 bg-gradient-to-r from-[#e8935f]/5 via-transparent to-blue-500/5 rounded-2xl blur-3xl"></div>
          <div className="relative">
            <Search className="absolute left-5 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Search notes and flows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-theme-bg-secondary border border-gray-600 rounded-xl pl-14 pr-6 py-4 text-theme-text-primary placeholder-gray-500 focus:outline-none focus:border-[#e8935f]/50 focus:ring-2 focus:ring-[#e8935f]/20 transition-all shadow-lg"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-12">Loading...</div>
        ) : (
          <div className="space-y-16">
            {/* Flows Section */}
            {filteredFlows.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-8 bg-gradient-to-b from-[#e8935f] to-transparent rounded-full"></div>
                    <h3 className="text-sm uppercase tracking-wider text-theme-text-secondary font-semibold">
                      Recently Created Flows
                    </h3>
                  </div>
                  <div className="flex items-center gap-3">
                  <button
                    onClick={() => setFlowSortBy(flowSortBy === 'title' ? 'date' : 'title')}
                    className="text-sm text-gray-500 hover:text-theme-text-primary transition-colors px-3 py-1 rounded-md hover:bg-theme-bg-secondary"
                  >
                    Sort By: {flowSortBy === 'title' ? 'Title' : 'Date'}
                  </button>
                    <button
                      onClick={onNavigateToFlows}
                      className="text-sm text-gray-500 hover:text-theme-text-primary transition-colors px-3 py-1 rounded-md hover:bg-theme-bg-secondary"
                    >
                      View All
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredFlows.slice(0, 4).map((flow) => (
                    <button
                      key={flow.id}
                      onClick={() => onNavigateToFlow(flow.id)}
                      className="group relative bg-theme-bg-secondary hover:bg-theme-bg-tertiary border border-gray-600 hover:border-gray-500 rounded-xl p-5 transition-all duration-200 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-[#e8935f]/20 to-[#e8935f]/10 border border-[#e8935f]/30 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                          <GitBranch className="w-5 h-5 text-[#e8935f]" />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <h4 className="text-base font-medium text-theme-text-primary group-hover:text-white transition-colors mb-1.5 truncate leading-tight">
                            {flow.title}
                          </h4>
                          <div className="flex items-center gap-2.5 flex-wrap text-xs text-gray-500">
                            <span className="whitespace-nowrap">{formatDate(flow.created_at)}</span>
                            <span className="px-2 py-0.5 bg-theme-bg-primary rounded-md border border-gray-600 text-theme-text-secondary whitespace-nowrap">
                              {flow.nodes?.length || 0} node{(flow.nodes?.length || 0) !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Notes Section */}
            {filteredNotes.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-8 bg-gradient-to-b from-blue-500 to-transparent rounded-full"></div>
                    <h3 className="text-sm uppercase tracking-wider text-theme-text-secondary font-semibold">
                      Recently Modified Notes
                    </h3>
                  </div>
                  <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSortBy(sortBy === 'title' ? 'date' : 'title')}
                    className="text-sm text-gray-500 hover:text-theme-text-primary transition-colors px-3 py-1 rounded-md hover:bg-theme-bg-secondary"
                  >
                    Sort By: {sortBy === 'title' ? 'Title' : 'Date'}
                  </button>
                    <button
                      onClick={onNavigateToNotes}
                      className="text-sm text-gray-500 hover:text-theme-text-primary transition-colors px-3 py-1 rounded-md hover:bg-theme-bg-secondary"
                    >
                      View All
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredNotes.slice(0, 6).map((note) => (
                    <button
                      key={note.id}
                      onClick={() => onNavigateToEditor(note.id)}
                      className="group relative bg-theme-bg-secondary hover:bg-theme-bg-tertiary border border-gray-600 hover:border-gray-500 rounded-xl p-5 transition-all duration-200 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/10 border border-blue-500/30 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                          <FileText className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <h4 className="text-base font-medium text-theme-text-primary group-hover:text-white transition-colors mb-1.5 line-clamp-2 leading-tight">
                            {note.title}
                          </h4>
                          <p className="text-xs text-gray-500 whitespace-nowrap">{formatDate(note.updated_at)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : !searchQuery && (
              <div className="flex flex-col items-center justify-center py-24 px-4">
                <div className="relative mb-8">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#e8935f]/10 to-transparent rounded-2xl blur-xl"></div>
                  <div className="relative w-24 h-24 rounded-2xl bg-gradient-to-br from-[#3a4450] to-[#2c3440] flex items-center justify-center">
                    <Sparkles className="w-12 h-12 text-[#e8935f] opacity-80" />
                  </div>
                </div>
                <h3 className="text-xl font-medium text-theme-text-primary mb-2 text-center">No notes yet</h3>
                <p className="text-sm text-gray-500 max-w-md text-center">
                  Start capturing your thoughts and ideas. Create your first note to begin.
                </p>
                <button
                  onClick={handleNewNote}
                  className="mt-8 px-6 py-3 bg-gradient-to-r from-[#e8935f] to-[#e8935f]/90 hover:from-[#e8935f]/90 hover:to-[#e8935f] text-white rounded-lg font-medium transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  <span>Create Note</span>
                </button>
              </div>
            )}

            {searchQuery && filteredNotes.length === 0 && filteredFlows.length === 0 && (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-theme-bg-secondary border border-gray-600 mb-4">
                  <Search className="w-10 h-10 text-gray-500" />
                </div>
                <p className="text-theme-text-secondary mb-2">No notes or flows found</p>
                <p className="text-sm text-gray-500">Try a different search term</p>
              </div>
            )}
          </div>
        )}
      </main>

      <button
        onClick={handleNewNote}
        className="fixed bottom-8 right-8 w-14 h-14 bg-blue-500 hover:bg-blue-600 rounded-full flex items-center justify-center shadow-lg transition-colors"
      >
        <Plus className="w-6 h-6 text-white" />
      </button>

      <ConfirmDialog
        isOpen={showClearAllConfirm}
        onClose={() => setShowClearAllConfirm(false)}
        onConfirm={confirmClearAll}
        title="Delete All Notes"
        message="Are you sure you want to delete all notes? This cannot be undone."
        confirmText="Delete All"
      />

      <Toast
        isOpen={toast.isOpen}
        onClose={() => setToast({ ...toast, isOpen: false })}
        message={toast.message}
        type={toast.type}
      />

      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
      />
    </div>
  );
}
