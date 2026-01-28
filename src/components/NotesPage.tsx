import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  Plus,
  Search,
  Trash2,
  Grid,
  List as ListIcon,
  MoreVertical,
  Calendar,
  FolderOpen,
  Upload,
  Download,
  MoreHorizontal,
  Network
} from 'lucide-react';
import { getNotes, deleteNote, getAllFolders, createNote } from '../lib/storage';
import { useRef } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { formatDate } from '../utils/date';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Toggle } from './ui/toggle';
import ConfirmDialog from './ConfirmDialog'; // Legacy dialog, keep for now or migrate later if needed
import GraphViewDialog from './GraphViewDialog';
import { ScrollArea } from './ui/scroll-area';

export default function NotesPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/notes' });
  
  const [notes, setNotes] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showGraphView, setShowGraphView] = useState(false);
  const [searchQuery, setSearchQuery] = useState((search as { search?: string })?.search || '');
  const [sortBy] = useState<'title' | 'date'>((search as { sort?: 'title' | 'date' })?.sort || 'date');
  const [selectedFolder, setSelectedFolder] = useState<string>((search as { folder?: string })?.folder || 'All');
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadNotes = () => {
    try {
      const data = getNotes();
      setNotes(data || []);
      setFolders(['All', 'Unfiled', ...getAllFolders()]);
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotes();
    // Listen for storage refresh events
    const handleStorageRefresh = () => loadNotes();
    window.addEventListener('storage-refresh', handleStorageRefresh);
    return () => window.removeEventListener('storage-refresh', handleStorageRefresh);
  }, []);

  const debouncedSearchQuery = useDebounce(searchQuery);

  // Filter and sort notes
  const filteredNotes = useMemo(() => {
    let filtered = notes;

    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      filtered = notes.filter((note) =>
        note.title.toLowerCase().includes(query) ||
        note.content?.toLowerCase().includes(query)
      );
    }

    if (selectedFolder && selectedFolder !== 'All') {
      if (selectedFolder === 'Unfiled') {
        filtered = filtered.filter((n) => !n.folder || !n.folder.trim());
      } else {
        filtered = filtered.filter((n) => (n.folder || '').trim() === selectedFolder);
      }
    }

    return [...filtered].sort((a, b) => {
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [notes, debouncedSearchQuery, selectedFolder, sortBy]);

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setNoteToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (noteToDelete) {
      await deleteNote(noteToDelete);
      loadNotes();
      setNoteToDelete(null);
    }
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    let importedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const text = await file.text();
        if (file.type === 'application/json' || file.name.endsWith('.json')) {
           try {
             const jsonData = JSON.parse(text);
             if (Array.isArray(jsonData)) {
               // Bulk import
               jsonData.forEach(note => {
                 if (note.title || note.content) {
                   createNote(note.title || 'Untitled', note.content || '');
                   importedCount++;
                 }
               });
             } else if (jsonData.title || jsonData.content) {
               // Single note import
               createNote(jsonData.title || 'Untitled', jsonData.content || '');
               importedCount++;
             }
           } catch (e) {
             console.error('Invalid JSON file', e);
           }
        } else {
          // Assume markdown/text
          const title = file.name.replace(/\.[^/.]+$/, "");
          createNote(title, text);
          importedCount++;
        }
      } catch (error) {
        console.error('Error reading file:', error);
      }
    }

    if (importedCount > 0) {
      loadNotes();
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExportAll = () => {
    const allNotes = getNotes();
    const blob = new Blob([JSON.stringify(allNotes, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pinn-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple
        accept=".json,.md,.txt"
      />
      {/* Header / Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <h1 className="text-2xl font-bold tracking-tight">Notes</h1>
          <span className="text-muted-foreground text-sm ml-2">({filteredNotes.length})</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <FolderOpen className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {folders.map(folder => (
                <DropdownMenuItem
                  key={folder}
                  onClick={() => setSelectedFolder(folder)}
                  className={selectedFolder === folder ? "bg-accent" : ""}
                >
                  {folder}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center border rounded-md bg-background">
            <Toggle
              pressed={viewMode === 'grid'}
              onPressedChange={() => setViewMode('grid')}
              className="rounded-r-none border-r"
              aria-label="Grid view"
            >
              <Grid className="h-4 w-4" />
            </Toggle>
            <Toggle
              pressed={viewMode === 'list'}
              onPressedChange={() => setViewMode('list')}
              className="rounded-l-none border-r"
              aria-label="List view"
            >
              <ListIcon className="h-4 w-4" />
            </Toggle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowGraphView(true)}
              className="rounded-l-none"
              title="Graph View"
            >
              <Network className="h-4 w-4" />
            </Button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleImportClick}>
                <Upload className="mr-2 h-4 w-4" /> Import Notes
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportAll}>
                <Download className="mr-2 h-4 w-4" /> Export All
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button onClick={() => navigate({ to: '/note/new' })}>
            <Plus className="mr-2 h-4 w-4" /> New Note
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 -mx-6 px-6">
        {loading ? (
          <div className="py-20 text-center text-muted-foreground">Loading notes...</div>
        ) : filteredNotes.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            {searchQuery ? 'No notes found matching your search.' : 'No notes yet. Create one to get started.'}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
            {filteredNotes.map((note) => (
              <Card
                key={note.id}
                className="group cursor-pointer hover:shadow-md transition-all hover:border-primary/50"
                onClick={() => navigate({ to: '/note/$noteId', params: { noteId: note.id } })}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex justify-between items-start gap-2">
                    <CardTitle className="text-base font-semibold leading-tight line-clamp-2">
                      {note.title || 'Untitled'}
                    </CardTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => handleDeleteClick(e, note.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <p className="text-sm text-muted-foreground line-clamp-3 h-[4.5em]">
                    {/* Strip markdown roughly for preview */}
                    {note.content?.replace(/[#*`]/g, '') || 'No content'}
                  </p>
                </CardContent>
                <CardFooter className="p-4 pt-0 text-xs text-muted-foreground flex justify-between items-center">
                  <span className="flex items-center">
                    <Calendar className="mr-1 h-3 w-3" />
                    {formatDate(note.updated_at)}
                  </span>
                  {note.folder && (
                    <span className="bg-secondary px-2 py-0.5 rounded text-[10px] font-medium">
                      {note.folder}
                    </span>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2 pb-20">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                className="group flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => navigate({ to: '/note/$noteId', params: { noteId: note.id } })}
              >
                <div className="flex-1 min-w-0 grid gap-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold truncate">{note.title || 'Untitled'}</h3>
                    {note.folder && (
                      <span className="bg-secondary px-2 py-0.5 rounded text-[10px] text-muted-foreground">
                        {note.folder}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{formatDate(note.updated_at)}</span>
                    <span className="truncate max-w-[300px] opacity-70">
                        {note.content?.slice(0, 50).replace(/\n/g, ' ')}...
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => handleDeleteClick(e, note.id)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
        title="Delete Note"
        message="Are you sure you want to delete this note? This cannot be undone."
        confirmText="Delete"
      />

      <GraphViewDialog
        isOpen={showGraphView}
        onClose={() => setShowGraphView(false)}
        onNavigateToNote={(noteId) => navigate({ to: '/note/$noteId', params: { noteId } })}
      />
    </div>
  );
}
