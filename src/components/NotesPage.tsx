import { useState, useEffect, useRef } from 'react';
import { Search, Plus, Menu as MenuIcon, Download, Upload, Trash2, ChevronLeft, GitBranch, Settings, Folder, FolderOpen, ChevronRight, ChevronDown, Edit2, Book } from 'lucide-react';
import { getNotes, Note, deleteNote, writeAll, getAllFolders, setNoteFolder, addFolder, renameFolder as storageRenameFolder, deleteFolder as storageDeleteFolder } from '../lib/storage';
import { getFlowsContainingNote } from '../lib/flowStorage';
import ConfirmDialog from './ConfirmDialog';
import Toast from './Toast';
import SettingsDialog from './SettingsDialog';
import JSZip from 'jszip';

interface NotesPageProps {
  onNavigateToEditor: (noteId?: string) => void;
  onNavigateToHome: () => void;
  onNavigateToFlows: () => void;
}

export default function NotesPage({ onNavigateToEditor, onNavigateToHome, onNavigateToFlows }: NotesPageProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [filteredNotes, setFilteredNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'title' | 'date'>('date');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [lengthFilter, setLengthFilter] = useState<'all' | 'short' | 'medium' | 'long'>('all');
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('All');
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [assignAfterCreateNoteId, setAssignAfterCreateNoteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [flowsUsingNote, setFlowsUsingNote] = useState<Array<{ flowId: string; flowTitle: string }>>([]);
  const [folderToRename, setFolderToRename] = useState<string | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
  const [folderDeleteCount, setFolderDeleteCount] = useState<number>(0);
  const [showFolderDeleteDialog, setShowFolderDeleteDialog] = useState(false);
  const [toast, setToast] = useState<{ isOpen: boolean; message: string; type: 'success' | 'error' }>({
    isOpen: false,
    message: '',
    type: 'success',
  });
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadNotes();
    
    // Listen for storage refresh events (e.g., after folder restore)
    const handleStorageRefresh = () => {
      loadNotes();
    };
    
    window.addEventListener('storage-refresh', handleStorageRefresh);
    
    return () => {
      window.removeEventListener('storage-refresh', handleStorageRefresh);
    };
  }, []);

  useEffect(() => {
    filterAndSortNotes();
  }, [notes, searchQuery, sortBy, selectedFolder, dateFilter, lengthFilter]);

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
      const data = getNotes();
      setNotes(data || []);
      const allFolders = getAllFolders();
      setFolders(['All', 'Unfiled', ...allFolders]);
      // Auto-expand folders that have notes in the current filter
      if (allFolders.length > 0 && expandedFolders.size === 0) {
        setExpandedFolders(new Set(allFolders));
      }
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFolder = (folderName: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderName)) {
        next.delete(folderName);
      } else {
        next.add(folderName);
      }
      return next;
    });
  };

  const handleFolderClick = (folderName: string) => {
    setSelectedFolder(folderName);
  };

  const organizeNotesByFolder = () => {
    const organized: Record<string, Note[]> = {};
    const unfiled: Note[] = [];

    notes.forEach((note) => {
      const folder = note.folder?.trim();
      if (folder) {
        if (!organized[folder]) {
          organized[folder] = [];
        }
        organized[folder].push(note);
      } else {
        unfiled.push(note);
      }
    });

    // Sort notes within each folder by updated_at
    Object.keys(organized).forEach((folder) => {
      organized[folder].sort((a, b) => 
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    });

    unfiled.sort((a, b) => 
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    return { organized, unfiled };
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

    if (selectedFolder && selectedFolder !== 'All') {
      if (selectedFolder === 'Unfiled') {
        filtered = filtered.filter((n) => !n.folder || !n.folder.trim());
      } else {
        filtered = filtered.filter((n) => (n.folder || '').trim() === selectedFolder);
      }
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);

      filtered = filtered.filter((note) => {
        const updatedDate = new Date(note.updated_at);
        switch (dateFilter) {
          case 'today':
            return updatedDate >= today;
          case 'week':
            return updatedDate >= weekAgo;
          case 'month':
            return updatedDate >= monthAgo;
          default:
            return true;
        }
      });
    }

    // Length filter
    if (lengthFilter !== 'all') {
      filtered = filtered.filter((note) => {
        const length = note.content.length;
        switch (lengthFilter) {
          case 'short':
            return length < 500;
          case 'medium':
            return length >= 500 && length <= 2000;
          case 'long':
            return length > 2000;
          default:
            return true;
        }
      });
    }

    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    setFilteredNotes(filtered);
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
    // Store selected folder for auto-assignment when note is created
    if (selectedFolder && selectedFolder !== 'All' && selectedFolder !== 'Unfiled') {
      localStorage.setItem('pinn.pendingFolder', selectedFolder);
    } else {
      localStorage.removeItem('pinn.pendingFolder');
    }
    onNavigateToEditor();
  };

  const handleCreateFolder = () => {
    setAssignAfterCreateNoteId(null);
    setNewFolderName('');
    setShowFolderDialog(true);
  };

  const handleRenameFolder = (name: string) => {
    setFolderToRename(name);
    setNewFolderName(name);
    setShowFolderDialog(true);
  };

  const handleDeleteFolderClick = (name: string) => {
    setFolderToDelete(name);
    // Count how many notes are in this folder to decide dialog variant
    try {
      const count = notes.reduce((acc, n) => acc + (((n.folder || '').trim() === name) ? 1 : 0), 0);
      setFolderDeleteCount(count);
    } catch {
      setFolderDeleteCount(0);
    }
    setShowFolderDeleteDialog(true);
  };

  const handleAssignFolder = (noteId: string, value: string) => {
    if (value === '__new__') {
      setAssignAfterCreateNoteId(noteId);
      setNewFolderName('');
      setShowFolderDialog(true);
      return;
    }
    const folder = value === 'Unfiled' ? undefined : (value || undefined);
    const updated = setNoteFolder(noteId, folder);
    if (updated) {
      loadNotes();
    }
  };

  const confirmCreateFolder = () => {
    const normalized = (newFolderName || '').trim();
    if (!normalized) {
      setShowFolderDialog(false);
      return;
    }
    if (folderToRename && folderToRename !== normalized) {
      storageRenameFolder(folderToRename, normalized);
      loadNotes();
      setSelectedFolder(normalized);
    } else {
      // Persist new folder and refresh
      addFolder(normalized);
      setFolders(['All', 'Unfiled', ...getAllFolders()]);
      if (!assignAfterCreateNoteId) setSelectedFolder(normalized);
    }

    if (assignAfterCreateNoteId) {
      const updated = setNoteFolder(assignAfterCreateNoteId, normalized);
      if (updated) {
        loadNotes();
      }
    } else {
      // already handled above
    }

    setAssignAfterCreateNoteId(null);
    setNewFolderName('');
    setFolderToRename(null);
    setShowFolderDialog(false);
  };

  const confirmDeleteFolder = (mode: 'delete-notes' | 'move-to-unfiled') => {
    if (!folderToDelete) return;
    storageDeleteFolder(folderToDelete, mode);
    setShowFolderDeleteDialog(false);
    setFolderToDelete(null);
    setFolderDeleteCount(0);
    if (selectedFolder === folderToDelete) setSelectedFolder('All');
    loadNotes();
  };

  const handleDeleteNote = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const flows = getFlowsContainingNote(noteId);
    setFlowsUsingNote(flows);
    setNoteToDelete(noteId);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteNote = () => {
    if (noteToDelete) {
      deleteNote(noteToDelete);
      loadNotes();
      setNoteToDelete(null);
      setFlowsUsingNote([]);
    }
  };

  const handleExportAll = async () => {
    const allNotes = getNotes();
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
    const allNotes = getNotes();
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
          const existingNotes = getNotes();
          const importedNotes = validNotes.map((note: any) => ({
            id: crypto.randomUUID(),
            title: note.title || 'Untitled',
            content: note.content || '',
            folder: (typeof note.folder === 'string' && note.folder.trim()) ? note.folder.trim() : undefined,
            created_at: note.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }));

          // Merge with existing notes
          const allNotes = [...importedNotes, ...existingNotes];
          writeAll(allNotes);
          setFolders(['All', 'Unfiled', ...getAllFolders()]);

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
    notes.forEach((note) => deleteNote(note.id));
    setNotes([]);
    setFilteredNotes([]);
  };

  const getPreview = (content: string, maxLength: number = 100) => {
    if (!content) return 'No content';
    
    // Convert markdown to plain text more intelligently
    let text = content;
    
    // Handle markdown tables - extract text from table rows
    text = text.replace(/\|(.+)\|/g, (_match, content: string) => {
      // Skip separator rows (like |-----: |-----: |)
      if (content.match(/^[\s-:]+$/)) return '';
      // Extract cell contents and join with spaces
      const cells = content.split('|').map((c: string) => c.trim()).filter((c: string) => c && !c.match(/^[-:]+$/));
      return cells.join(' ');
    });
    
    // Remove markdown headers
    text = text.replace(/^#{1,6}\s+(.+)$/gm, '$1');
    
    // Remove markdown links but keep the text
    text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
    
    // Remove markdown images but keep alt text
    text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1');
    
    // Remove markdown code blocks
    text = text.replace(/```[\s\S]*?```/g, '');
    
    // Remove inline code
    text = text.replace(/`([^`]+)`/g, '$1');
    
    // Remove markdown lists markers
    text = text.replace(/^[\s]*[-*+]\s+/gm, '');
    text = text.replace(/^[\s]*\d+\.\s+/gm, '');
    
    // Remove markdown bold/italic markers
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/\*([^*]+)\*/g, '$1');
    text = text.replace(/__([^_]+)__/g, '$1');
    text = text.replace(/_([^_]+)_/g, '$1');
    
    // Remove markdown strikethrough
    text = text.replace(/~~([^~]+)~~/g, '$1');
    
    // Remove markdown blockquotes
    text = text.replace(/^>\s+/gm, '');
    
    // Remove horizontal rules
    text = text.replace(/^[-*_]{3,}$/gm, '');
    
    // Remove remaining markdown special characters (but keep pipes and colons for content)
    text = text.replace(/[#`\[\]()]/g, '');
    
    // Clean up extra whitespace
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.replace(/\s+/g, ' ');
    text = text.trim();
    
    if (!text || text.length === 0) return 'No content';
    
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  const { organized, unfiled } = organizeNotesByFolder();
  // Include empty folders from the persisted list so they show in the sidebar
  const folderSet = new Set<string>([
    ...Object.keys(organized),
    ...folders.filter((f) => f !== 'All' && f !== 'Unfiled'),
  ]);
  const sortedFolders = Array.from(folderSet).sort((a, b) => a.localeCompare(b));

  return (
    <div className="h-screen bg-theme-bg-primary flex flex-col overflow-hidden">
      <header className="sticky top-0 z-50 bg-theme-bg-primary flex items-center justify-between px-6 py-4 border-b border-theme-border flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onNavigateToHome}
            className="flex items-center gap-2 text-theme-text-secondary hover:text-white transition-colors"
            title="Back to Home"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">Back</span>
          </button>
          <h1 className="text-xl font-light text-theme-text-primary">Notes</h1>
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

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Sidebar */}
        <aside 
          className="bg-theme-bg-primary border-r border-theme-border w-[280px] min-w-[200px] flex-shrink-0 h-full flex flex-col"
        >
          {/* Fixed Header Section */}
          <div className="flex-shrink-0 p-4 space-y-2 bg-theme-bg-primary">
            {/* Search in sidebar */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-theme-bg-secondary border border-theme-border rounded-lg pl-9 pr-3 py-2 text-sm text-theme-text-primary placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors"
              />
            </div>

            {/* All Notes */}
            <div className="mb-2">
              <button
                onClick={() => handleFolderClick('All')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedFolder === 'All'
                    ? 'bg-theme-bg-secondary text-theme-text-primary'
                    : 'text-theme-text-secondary hover:bg-theme-bg-secondary hover:text-theme-text-primary'
                }`}
              >
                <Book className="w-4 h-4" />
                <span className="flex-1 text-left">All Notes</span>
                <span className="text-xs text-gray-600">{notes.length}</span>
              </button>
            </div>

            {/* Unfiled Notes */}
            {unfiled.length > 0 && (
              <div className="mb-2">
                <button
                  onClick={() => handleFolderClick('Unfiled')}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedFolder === 'Unfiled'
                      ? 'bg-theme-bg-secondary text-white'
                      : 'text-theme-text-secondary hover:bg-theme-bg-secondary hover:text-theme-text-primary'
                  }`}
                >
                  <Book className="w-4 h-4" />
                  <span className="flex-1 text-left">Unfiled</span>
                  <span className="text-xs text-gray-600">{unfiled.length}</span>
                </button>
              </div>
            )}

            {/* Folders Header */}
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Folders</span>
              <button
                onClick={handleCreateFolder}
                className="text-xs text-gray-500 hover:text-theme-text-primary p-1"
                title="New Folder"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Scrollable Folders List */}
          <div 
            className="flex-1 overflow-y-auto sidebar-scroll-container px-4 pb-4"
            style={{ 
              scrollbarWidth: 'none', /* Firefox */
              msOverflowStyle: 'none', /* IE and Edge */
            }}
          >
            <div className="space-y-1">
              {sortedFolders.length === 0 && (
                <div className="px-3 pb-2 text-xs text-gray-500 flex items-center gap-2">
                  <span>No folders yet</span>
                  <button
                    onClick={handleCreateFolder}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-theme-border text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary"
                  >
                    <Plus className="w-3 h-3" />
                    <span>New folder</span>
                  </button>
                </div>
              )}
              {sortedFolders.map((folderName) => {
                  const folderNotes = organized[folderName] || [];
                  const isExpanded = expandedFolders.has(folderName);
                  const filteredFolderNotes = searchQuery
                    ? folderNotes.filter(
                        (note) =>
                          note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          note.content.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                    : folderNotes;

                  return (
                    <div key={folderName} className="mb-1">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleFolder(folderName)}
                          className="p-1 text-gray-500 hover:text-theme-text-primary transition-colors"
                          title={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                        <div className={`group flex-1 flex items-center gap-2 px-1 rounded-lg text-sm min-w-0`}>
                          <button
                            onClick={() => handleFolderClick(folderName)}
                            className={`flex-1 flex items-center gap-2 px-2 py-2 rounded-lg transition-colors min-w-0 ${
                              selectedFolder === folderName
                                ? 'bg-theme-bg-secondary text-white'
                                : 'text-theme-text-secondary hover:bg-theme-bg-secondary hover:text-theme-text-primary'
                            }`}
                          >
                          {isExpanded ? (
                            <FolderOpen className="w-4 h-4 flex-shrink-0" />
                          ) : (
                            <Folder className="w-4 h-4 flex-shrink-0" />
                          )}
                          <span className="flex-1 text-left truncate">
                            {folderName}
                          </span>
                          </button>
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 pr-2">
                            <button
                              title="Rename folder"
                              onClick={() => handleRenameFolder(folderName)}
                              className="p-1 text-gray-500 hover:text-theme-text-primary rounded"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              title="Delete folder"
                              onClick={() => handleDeleteFolderClick(folderName)}
                              className="p-1 text-gray-500 hover:text-red-400 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                      {isExpanded && filteredFolderNotes.length > 0 && (
                        <div className="ml-7 mt-1 space-y-0.5">
                          {filteredFolderNotes.map((note) => (
                            <div key={note.id} className="group flex items-center gap-2 px-3 py-1.5 rounded text-sm text-theme-text-secondary hover:bg-theme-bg-secondary hover:text-theme-text-primary transition-colors truncate min-w-0">
                              <Book className="w-3 h-3 flex-shrink-0" />
                              <button
                                onClick={() => onNavigateToEditor(note.id)}
                                className="flex-1 text-left truncate"
                                title={note.title}
                              >
                                {note.title}
                              </button>
                              <button
                                title="Edit note"
                                onClick={() => onNavigateToEditor(note.id)}
                                className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-theme-text-primary rounded"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                title="Delete note"
                                onClick={() => {
                                  setNoteToDelete(note.id);
                                  setShowDeleteConfirm(true);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400 rounded"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

              {/* Empty state intentionally minimal - no extra call-to-action here */}
              {sortedFolders.length === 0 && unfiled.length === 0 && !loading && null}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 h-full flex flex-col">
          {/* Fixed Header Section */}
          <div className="flex-shrink-0 bg-theme-bg-primary border-b border-theme-border">
            <div className="max-w-5xl mx-auto px-6 py-6">
              {!loading && (
                <div className="flex items-center justify-between">
                  <h3 className="text-sm uppercase tracking-wider text-gray-500">
                    {selectedFolder === 'All' ? 'All Notes' : selectedFolder === 'Unfiled' ? 'Unfiled Notes' : `Notes in "${selectedFolder}"`}
                  </h3>
                  <div className="flex items-center gap-4">
                    {/* Date Filter */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Date:</span>
                      <select
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value as 'all' | 'today' | 'week' | 'month')}
                        className="text-xs bg-theme-bg-secondary border border-theme-border rounded px-2 py-1 text-theme-text-secondary hover:text-theme-text-primary focus:outline-none focus:border-gray-600 transition-colors"
                      >
                        <option value="all">All Time</option>
                        <option value="today">Today</option>
                        <option value="week">This Week</option>
                        <option value="month">This Month</option>
                      </select>
                    </div>
                    {/* Length Filter */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Length:</span>
                      <select
                        value={lengthFilter}
                        onChange={(e) => setLengthFilter(e.target.value as 'all' | 'short' | 'medium' | 'long')}
                        className="text-xs bg-theme-bg-secondary border border-theme-border rounded px-2 py-1 text-theme-text-secondary hover:text-theme-text-primary focus:outline-none focus:border-gray-600 transition-colors"
                      >
                        <option value="all">All</option>
                        <option value="short">Short (&lt;500)</option>
                        <option value="medium">Medium (500-2000)</option>
                        <option value="long">Long (&gt;2000)</option>
                      </select>
                    </div>
                    {/* Sort By */}
                    {filteredNotes.length > 0 && (
                      <button
                        onClick={() => setSortBy(sortBy === 'title' ? 'date' : 'title')}
                        className="text-sm text-gray-500 hover:text-theme-text-secondary transition-colors"
                      >
                        Sort By: {sortBy === 'title' ? 'Title' : 'Date'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Scrollable Notes List */}
          <div 
            className="flex-1 overflow-y-auto content-scroll-container"
            style={{ 
              scrollbarWidth: 'none', /* Firefox */
              msOverflowStyle: 'none', /* IE and Edge */
            }}
          >
            <div className="max-w-5xl mx-auto px-6 py-12">
              {loading ? (
                <div className="text-center text-gray-500 py-12">Loading notes...</div>
              ) : filteredNotes.length > 0 ? (
                <div className="space-y-6">
                  {filteredNotes.map((note) => (
                    <div
                      key={note.id}
                      className="group relative bg-theme-bg-secondary rounded-lg p-4 hover:bg-theme-bg-tertiary transition-colors cursor-pointer"
                      onClick={() => onNavigateToEditor(note.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="text-lg text-theme-text-primary group-hover:text-white transition-colors mb-2">
                            {note.title}
                          </h4>
                          <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                            {getPreview(note.content)}
                          </p>
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            <span>{formatDate(note.updated_at)}</span>
                            <span>{note.content.length} characters</span>
                            {selectedFolder === 'All' && (
                              <span className="px-2 py-0.5 rounded bg-theme-bg-primary border border-theme-border text-theme-text-secondary">
                                {note.folder && note.folder.trim() ? note.folder : 'Unfiled'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            onClick={(e) => e.stopPropagation()}
                            value={note.folder && note.folder.trim() ? note.folder : 'Unfiled'}
                            onChange={(e) => handleAssignFolder(note.id, e.target.value)}
                            title={note.folder || 'Unfiled'}
                            className="text-xs bg-[#2a3038]/30 border border-[#3a4048]/50 hover:border-[#3a4048] rounded px-2 py-1 text-theme-text-secondary hover:text-theme-text-primary max-w-[200px] transition-all hover:bg-[#2a3038]/50 focus:bg-[#2a3038]/50 focus:border-[#3a4048] focus:outline-none"
                          >
                            <option value="Unfiled">Unfiled</option>
                            {folders.filter((f) => f !== 'All' && f !== 'Unfiled').map((f) => (
                              <option key={f} value={f}>{f.length > 40 ? `${f.slice(0, 37)}...` : f}</option>
                            ))}
                            <option value="__new__">+ New folder…</option>
                          </select>
                          <button
                            onClick={(e) => handleDeleteNote(note.id, e)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-500 hover:text-red-400 hover:bg-theme-bg-primary rounded transition-all"
                            title="Delete note"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-12">
                  {searchQuery ? 'No notes found' : selectedFolder === 'All' ? 'No notes yet. Create your first note!' : `No notes in "${selectedFolder}"`}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <button
        onClick={handleNewNote}
        className="fixed bottom-8 right-8 w-14 h-14 bg-blue-500 hover:bg-blue-600 rounded-full flex items-center justify-center shadow-lg transition-colors"
      >
        <Plus className="w-6 h-6 text-white" />
      </button>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setNoteToDelete(null);
          setFlowsUsingNote([]);
        }}
        onConfirm={confirmDeleteNote}
        title="Delete Note"
        message={
          flowsUsingNote.length > 0
            ? `This note is used in ${flowsUsingNote.length} flow${flowsUsingNote.length > 1 ? 's' : ''}: ${flowsUsingNote.map(f => f.flowTitle).join(', ')}. Deleting it will remove it from these flows. Are you sure you want to delete this note? This cannot be undone.`
            : "Are you sure you want to delete this note? This cannot be undone."
        }
        confirmText="Delete"
      />

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

      {showFolderDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-theme-bg-primary rounded-xl shadow-2xl w-full max-w-md border border-theme-border overflow-hidden">
            <div className="px-6 py-5 border-b border-theme-border">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-light text-theme-text-primary">{folderToRename ? 'Rename Folder' : 'New Folder'}</h2>
                <button
                  onClick={() => {
                    setShowFolderDialog(false);
                    setAssignAfterCreateNoteId(null);
                    setNewFolderName('');
                    setFolderToRename(null);
                  }}
                  className="text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded-lg p-1.5 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="px-6 py-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-theme-text-primary mb-3">Folder name</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Enter folder name..."
                  className="w-full bg-theme-bg-darkest border border-theme-border rounded-lg px-4 py-3 text-theme-text-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#e8935f] focus:border-transparent transition-all"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-theme-border">
                <button
                  onClick={() => {
                    setShowFolderDialog(false);
                    setAssignAfterCreateNoteId(null);
                    setNewFolderName('');
                    setFolderToRename(null);
                  }}
                  className="px-5 py-2.5 text-sm font-medium text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmCreateFolder}
                  disabled={!newFolderName.trim()}
                  className="px-5 py-2.5 text-sm font-medium bg-[#e8935f] hover:bg-[#d8834f] text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#e8935f] shadow-lg hover:shadow-xl"
                >
                  {folderToRename ? 'Rename' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showFolderDeleteDialog && folderToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-theme-bg-primary rounded-xl shadow-2xl w-full max-w-md border border-theme-border overflow-hidden">
            <div className="px-6 py-5 border-b border-theme-border">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-light text-theme-text-primary">Delete Folder</h2>
                <button
                  onClick={() => {
                    setShowFolderDeleteDialog(false);
                    setFolderToDelete(null);
                  }}
                  className="text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded-lg p-1.5 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="px-6 py-6 space-y-6">
              {folderDeleteCount > 0 ? (
                <>
                  <div className="text-theme-text-primary">
                    <div className="mb-2">The folder</div>
                    <div className="inline-block max-w-full px-2 py-1 rounded border border-theme-border bg-theme-bg-darkest text-[#e8935f] font-medium overflow-hidden text-ellipsis whitespace-nowrap" title={folderToDelete}>{folderToDelete}</div>
                    <div className="mt-3">contains notes. What would you like to do?</div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => confirmDeleteFolder('move-to-unfiled')}
                      className="px-5 py-2.5 text-sm font-medium bg-theme-bg-secondary hover:bg-theme-bg-tertiary text-gray-100 rounded-lg transition-all text-left"
                    >
                      Move notes to Unfiled and delete folder
                    </button>
                    <button
                      onClick={() => confirmDeleteFolder('delete-notes')}
                      className="px-5 py-2.5 text-sm font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all text-left"
                    >
                      Delete folder and all notes inside
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-theme-text-primary">
                    <div className="mb-2">Delete empty folder</div>
                    <div className="inline-block max-w-full px-2 py-1 rounded border border-theme-border bg-theme-bg-darkest text-[#e8935f] font-medium overflow-hidden text-ellipsis whitespace-nowrap" title={folderToDelete}>{folderToDelete}</div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setShowFolderDeleteDialog(false);
                        setFolderToDelete(null);
                        setFolderDeleteCount(0);
                      }}
                      className="px-5 py-2.5 text-sm font-medium text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => confirmDeleteFolder('move-to-unfiled')}
                      className="px-5 py-2.5 text-sm font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all"
                    >
                      Delete folder
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`
        .sidebar-scroll-container::-webkit-scrollbar,
        .content-scroll-container::-webkit-scrollbar {
          display: none; /* Chrome, Safari, Opera */
        }
      `}</style>
    </div>
  );
}

