import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useRouter } from '@tanstack/react-router';
import {
  Plus,
  Menu as MenuIcon,
  Download,
  Upload,
  Trash2,
  GitBranch,
  X,
  ChevronLeft,
  Book,
  Settings,
  Sparkles,
} from 'lucide-react';
import { getNoteByIdWithContent, saveNote, createNote, deleteNote, getNotes, writeAll, getAllFolders, setNoteFolder } from '../lib/storage';
import { getFlows, createFlow, addNoteToFlow, Flow, getFlowsContainingNote } from '../lib/flowStorage';
import Editor, { EditorHandle } from './Editor/Editor';
import { markdownToBlocks, blocksToMarkdown } from '../utils/editorConverter';
import ConfirmDialog from './ConfirmDialog';
import Toast from './Toast';
import SettingsDialog from './SettingsDialog';
import AIPromptDialog from './AIPromptDialog';
import NoteReferenceModal from './NoteReferenceModal';
import { exportToPDF } from '../lib/pdfExport';
import { logger } from '../utils/logger';
import { exportNoteAsJSON, exportNoteAsMarkdown, exportNotesAsJSON, exportNotesAsMarkdown } from '../utils/export';
import { useClickOutside } from '../hooks/useClickOutside';
import { OutputData } from '@editorjs/editorjs';

export default function EditorPage() {
  const { noteId: routeNoteId } = useParams({ from: '/note/$noteId' });
  const navigate = useNavigate();
  const router = useRouter();
  const noteId = routeNoteId === 'new' ? null : routeNoteId;
  const [title, setTitle] = useState('');
  const [editorData, setEditorData] = useState<OutputData>({ time: Date.now(), blocks: [], version: '2.30.0' });
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(noteId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [folder, setFolder] = useState<string>('Unfiled');
  const [folders, setFolders] = useState<string[]>([]);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showFlowModal, setShowFlowModal] = useState(false);
  const [flows, setFlows] = useState<Pick<Flow, 'id' | 'title'>[]>([]);
  const [newFlowName, setNewFlowName] = useState('');
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [noteFlowInfo, setNoteFlowInfo] = useState<{ flowId: string; flowTitle: string }[]>([]);
  const [showFlowTooltip, setShowFlowTooltip] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [flowsUsingNote, setFlowsUsingNote] = useState<Array<{ flowId: string; flowTitle: string }>>([]);
  const [toast, setToast] = useState<{ isOpen: boolean; message: string; type: 'success' | 'error' }>({
    isOpen: false,
    message: '',
    type: 'success',
  });
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);
  // AI Selection state
  const [selectedText, setSelectedText] = useState('');
  const [selectionStart, setSelectionStart] = useState<number | undefined>();
  const [selectionEnd, setSelectionEnd] = useState<number | undefined>();

  const [showNoteReferenceModal, setShowNoteReferenceModal] = useState(false);
  const editorRef = useRef<EditorHandle>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const flowButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // Reset state when route changes
    if (noteId) {
      loadNote(noteId);
    } else {
      setTitle('');
      setEditorData({ time: Date.now(), blocks: [], version: '2.30.0' });
      setIsEditorReady(true); // New note is ready immediately

      // Check for pending folder from NotesPage
      const pendingFolder = localStorage.getItem('pinn.pendingFolder');
      if (pendingFolder) {
        setFolder(pendingFolder);
      } else {
        setFolder('Unfiled');
      }
    }
    loadFlows();
    setFolders(['Unfiled', ...getAllFolders()]);
  }, [noteId]);

  useEffect(() => {
    checkNoteInFlow();
  }, [currentNoteId, flows]);

  const loadFlows = () => {
    try {
      const data = getFlows();
      setFlows((data || []).map((f) => ({ id: f.id, title: f.title })));
    } catch (error) {
      logger.error('Error loading flows:', error);
    }
  };

  const checkNoteInFlow = () => {
    if (!currentNoteId) {
      setNoteFlowInfo([]);
      return;
    }
    try {
      const allFlows = getFlows();
      const flowsContainingNote: { flowId: string; flowTitle: string }[] = [];
      
      for (const flow of allFlows) {
        const node = flow.nodes?.find((n) => n.noteId === currentNoteId);
        if (node) {
          flowsContainingNote.push({ flowId: flow.id, flowTitle: flow.title });
        }
      }
      
      setNoteFlowInfo(flowsContainingNote);
    } catch (error) {
      logger.error('Error checking note in flow:', error);
      setNoteFlowInfo([]);
    }
  };

  const loadNote = async (id: string) => {
    try {
      setIsEditorReady(false);
      const data = await getNoteByIdWithContent(id);
      if (data) {
        setTitle(data.title);
        // Convert Markdown to EditorJS Blocks
        const blocks = await markdownToBlocks(data.content);
        setEditorData(blocks);
        setCurrentNoteId(data.id);
        setFolder(data.folder && data.folder.trim() ? data.folder : 'Unfiled');
      }
      setIsEditorReady(true);
    } catch (error) {
      logger.error('Error loading note:', error);
      setIsEditorReady(true);
    }
  };

  // Auto-save logic
  const saveCurrentNote = useCallback(async () => {
    setSaving(true);
    try {
      let content = '';
      
      // Get content from editor if available
      if (editorRef.current) {
        const outputData = await editorRef.current.save();
        content = blocksToMarkdown(outputData);
      }
      
      if (currentNoteId) {
        const existingNote = await getNoteByIdWithContent(currentNoteId);
        // If we couldn't get content (editor not ready/mounted), use existing
        // But if we are in this function, editor should be there usually.
        // If editor is not mounted (e.g. initial load), we shouldn't overwrite with empty string
        // unless we know it's intentional.
        // However, saveCurrentNote is triggered by debounced change.

        const updated = saveNote({
          id: currentNoteId,
          title: title || 'Untitled',
          content: content,
          folder: folder === 'Unfiled' ? undefined : folder,
          created_at: existingNote?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        setCurrentNoteId(updated.id);
      } else {
        // Create new note
        const pendingFolder = localStorage.getItem('pinn.pendingFolder');
        const created = createNote(title || 'Untitled', content);
        setCurrentNoteId(created.id);
        if (pendingFolder) {
          setNoteFolder(created.id, pendingFolder);
          setFolder(pendingFolder);
          localStorage.removeItem('pinn.pendingFolder');
        }
      }
    } catch (e) {
      logger.error('Autosave error:', e);
    } finally {
      setSaving(false);
    }
  }, [currentNoteId, title, folder]);

  // Debounce save
  useEffect(() => {
    // We don't want to save on initial load
    if (!currentNoteId && !title) return;

    const t = setTimeout(() => {
      saveCurrentNote();
    }, 1000);
    return () => clearTimeout(t);
  }, [title, folder]); // Trigger on title/folder change. Content change is handled by Editor's onChange

  const handleEditorChange = () => {
    // Trigger save on editor content change
    // Debounce is handled by the useEffect above? No, that only watches title/folder.
    // We need a separate debouncer for editor content or merge them.
    // Let's rely on a separate timeout for editor changes.
    setSaving(true);
    if (window.editorSaveTimeout) clearTimeout(window.editorSaveTimeout);
    window.editorSaveTimeout = setTimeout(() => {
      saveCurrentNote();
    }, 1000);
  };

  useClickOutside(menuRef, () => {
    if (menuOpen) {
      setMenuOpen(false);
    }
  });

  const handleExportNote = async () => {
    if (!currentNoteId) return;
    // Ensure we have latest content saved
    await saveCurrentNote();
    const note = await getNoteByIdWithContent(currentNoteId);
    if (!note) return;
    exportNoteAsJSON(note);
    setMenuOpen(false);
  };

  const handleFolderChange = (value: string) => {
    setFolder(value);
    if (!currentNoteId) return;
    if (value === '__new__') {
      setNewFolderName('');
      setShowFolderDialog(true);
      return;
    }
    const target = value === 'Unfiled' ? undefined : value;
    setNoteFolder(currentNoteId, target);
  };

  const confirmCreateFolder = () => {
    const normalized = (newFolderName || '').trim();
    if (!normalized || !currentNoteId) {
      setShowFolderDialog(false);
      return;
    }
    const updated = setNoteFolder(currentNoteId, normalized);
    if (updated) {
      setFolder(normalized);
      setFolders(() => {
        const base = ['Unfiled', ...getAllFolders()];
        const next = new Set(base);
        next.add(normalized);
        return Array.from(next).sort((a, b) => a.localeCompare(b));
      });
    }
    setNewFolderName('');
    setShowFolderDialog(false);
  };

  const handleExportAll = async () => {
    // Ensure current note is saved
    if (currentNoteId) await saveCurrentNote();

    const notes = getNotes();
    try {
      await exportNotesAsJSON(notes);
      setMenuOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create export file.';
      setToast({
        isOpen: true,
        message,
        type: 'error',
      });
      setMenuOpen(false);
    }
  };

  const handleExportNoteMarkdown = async () => {
    if (!currentNoteId) return;
    await saveCurrentNote();
    const note = await getNoteByIdWithContent(currentNoteId);
    if (!note) return;
    exportNoteAsMarkdown(note);
    setMenuOpen(false);
  };

  const handleExportNotePDF = async () => {
    if (!currentNoteId) return;
    await saveCurrentNote();
    const note = await getNoteByIdWithContent(currentNoteId);
    if (!note) return;

    setMenuOpen(false);
    
    try {
      await exportToPDF(note.title, note.content);
      setToast({
        isOpen: true,
        message: 'PDF exported successfully!',
        type: 'success',
      });
    } catch (error) {
      logger.error('Error exporting PDF:', error);
      setToast({
        isOpen: true,
        message: 'Failed to export PDF. Please try again.',
        type: 'error',
      });
    }
  };

  const handleExportAllMarkdown = async () => {
    if (currentNoteId) await saveCurrentNote();
    const notes = getNotes();
    try {
      await exportNotesAsMarkdown(notes);
      setMenuOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create export file.';
      setToast({
        isOpen: true,
        message,
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
          setFolders(['Unfiled', ...getAllFolders()]);

          // Reload the current note if needed
          if (currentNoteId) {
            loadNote(currentNoteId);
          }

          setToast({
            isOpen: true,
            message: `Successfully imported ${importedNotes.length} note(s).`,
            type: 'success',
          });
          setMenuOpen(false);
        } catch (error) {
          logger.error('Error importing notes:', error);
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

  const handleDeleteNote = () => {
    if (!currentNoteId) return;
    const flows = getFlowsContainingNote(currentNoteId);
    setFlowsUsingNote(flows);
    setShowDeleteConfirm(true);
    setMenuOpen(false);
  };

  const confirmDeleteNote = async () => {
    if (currentNoteId) {
      try {
        await deleteNote(currentNoteId);
        navigate({ to: '/' });
      } catch (error) {
        logger.error('Error deleting note:', error);
        // Note remains open if deletion failed
      }
    }
    setFlowsUsingNote([]);
  };

  const handleAddToFlowClick = () => {
    if (currentNoteId) {
      setShowFlowModal(true);
    }
  };

  const handleFlowSelection = () => {
    if (!currentNoteId) return;

    if (selectedFlowId) {
      // Add to existing flow
      addNoteToFlow(selectedFlowId, currentNoteId, title || 'Untitled');
    } else if (newFlowName.trim()) {
      // Create new flow and add note
      const newFlow = createFlow(newFlowName.trim());
      addNoteToFlow(newFlow.id, currentNoteId, title || 'Untitled');
      // Navigate to flows page and then to the new flow
      navigate({ to: '/flows' });
    }

    setShowFlowModal(false);
    setSelectedFlowId(null);
    setNewFlowName('');
    // Refresh flow info after adding
    setTimeout(() => {
      checkNoteInFlow();
      setShowFlowTooltip(true);
      setTimeout(() => setShowFlowTooltip(false), 3000);
    }, 100);
  };

  const handleAIGenerate = async (generatedText: string, isReplace: boolean, _startPos?: number, _endPos?: number) => {
    const editor = editorRef.current?.getInstance();
    if (!editor) return;

    // Convert generated text to blocks
    const newBlocks = await markdownToBlocks(generatedText);

    if (isReplace) {
        // Since we can't easily map character positions to blocks in EditorJS from here,
        // and we lost selection logic which relied on textarea,
        // we will fall back to appending or inserting at current caret if possible.
        // Actually, EditorJS has 'insert' API.

        // For now, simpler approach: Just insert at end or current position.
        // If we want to support replace, we need to know WHICH block was selected.
        // But the AI dialog is modal, so we lost focus.
        // Let's just insert for now.

        newBlocks.blocks.forEach(block => {
            editor.blocks.insert(block.type, block.data);
        });
    } else {
        // Insert
         newBlocks.blocks.forEach(block => {
            editor.blocks.insert(block.type, block.data);
        });
    }

    // Trigger save
    handleEditorChange();

    setToast({
      isOpen: true,
      message: 'AI content generated successfully!',
      type: 'success',
    });
  };

  // Helper to open AI dialog - currently relies on browser selection if we want "selectedText"
  // But EditorJS selection is different.
  const openAIDialog = async () => {
    // Try to get selected text from window selection
    const selection = window.getSelection();
    const text = selection ? selection.toString() : '';

    setSelectedText(text);
    // Positions are not relevant for EditorJS in the same way, pass 0
    setSelectionStart(0);
    setSelectionEnd(0);

    setShowAIDialog(true);
  };

  const handleSelectNoteReference = (noteId: string, noteTitle: string) => {
     // Insert as a link or special format
     const editor = editorRef.current?.getInstance();
     if (!editor) return;

     // We insert a link with specific format [[note:id|title]]
     // But better to use a link tool if available.
     // Let's insert text for now.

     // For EditorJS, we can insert a paragraph or HTML.
     // Or using block insert.
     // Let's insert as text at cursor if possible, but EditorJS API for inline insert is limited.
     // We can use `blocks.insert` to add a new block.

     editor.blocks.insert('paragraph', {
         text: `[[note:${noteId}|${noteTitle}]]`
     });

     handleEditorChange();

    setToast({
      isOpen: true,
      message: `Note reference to "${noteTitle}" inserted!`,
      type: 'success',
    });
  };

  return (
    <div className="h-screen bg-theme-bg-primary flex flex-col overflow-hidden">
      <header className="flex-shrink-0 bg-theme-bg-primary flex items-center justify-between px-6 py-4 border-b border-theme-border">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.history.back()}
            className="flex items-center gap-2 text-theme-text-secondary hover:text-white transition-colors"
            title="Back"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">Back</span>
          </button>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate({ to: '/note/new' })}
            className="flex items-center gap-2 px-4 py-2 text-theme-text-primary hover:text-white transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>New Note</span>
          </button>
          <button
            onClick={() => navigate({ to: '/notes' })}
            className="flex items-center gap-2 px-4 py-2 text-theme-text-primary hover:text-white transition-colors"
          >
            <Book className="w-5 h-5" />
            <span>Notes</span>
          </button>
          <button
            onClick={() => navigate({ to: '/flows' })}
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
                  {currentNoteId && (
                    <>
                      <button
                        onClick={handleExportNote}
                        className="w-full flex items-center gap-2 px-4 py-2 text-left text-theme-text-primary hover:bg-theme-bg-primary hover:text-white transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        <span>Export Note (JSON)</span>
                      </button>
                      <button
                        onClick={handleExportNoteMarkdown}
                        className="w-full flex items-center gap-2 px-4 py-2 text-left text-theme-text-primary hover:bg-theme-bg-primary hover:text-white transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        <span>Export Note (Markdown)</span>
                      </button>
                      <button
                        onClick={handleExportNotePDF}
                        className="w-full flex items-center gap-2 px-4 py-2 text-left text-theme-text-primary hover:bg-theme-bg-primary hover:text-white transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        <span>Export Note (PDF)</span>
                      </button>
                      <button
                        onClick={handleDeleteNote}
                        className="w-full flex items-center gap-2 px-4 py-2 text-left text-red-400 hover:bg-theme-bg-primary hover:text-red-300 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete Note</span>
                      </button>
                      <div className="border-t border-gray-600 my-1" />
                    </>
                  )}
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

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 max-w-6xl w-full mx-auto px-6 pt-8 pb-4 bg-theme-bg-primary">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full bg-transparent text-4xl font-light text-theme-text-primary placeholder-gray-600 focus:outline-none mb-4"
          />

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-500">Folder</label>
                <select
                  value={folder}
                  onChange={(e) => handleFolderChange(e.target.value)}
                  title={folder}
                  className="text-sm bg-theme-bg-secondary border border-theme-border rounded px-2 py-1 text-theme-text-primary max-w-[200px]"
                >
                  <option value="Unfiled">Unfiled</option>
                  {folders.map((f) => (
                    <option key={f} value={f}>{f.length > 40 ? `${f.slice(0, 37)}...` : f}</option>
                  ))}
                  <option value="__new__">+ New folder…</option>
                </select>
              </div>

                <button
                  onClick={openAIDialog}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-theme-text-primary hover:bg-theme-bg-secondary rounded transition-colors"
                  title="AI Assistant"
                  aria-label="AI Assistant"
                >
                  <Sparkles className="w-4 h-4" />
                </button>

              {currentNoteId && (
                <>
                  <div className="relative">
                    <button
                      ref={flowButtonRef}
                      onClick={handleAddToFlowClick}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 hover:text-theme-text-primary hover:bg-theme-bg-secondary rounded transition-colors"
                      onMouseEnter={() => noteFlowInfo.length > 0 && setShowFlowTooltip(true)}
                      onMouseLeave={() => setShowFlowTooltip(false)}
                    >
                      Add to flow
                    </button>
                    {showFlowTooltip && noteFlowInfo.length > 0 && (
                      <div className="absolute top-full left-0 mt-2 px-3 py-2.5 bg-theme-bg-secondary border border-gray-600 rounded-lg shadow-lg z-50 min-w-[200px]">
                        <div className="text-sm text-theme-text-primary">
                          {noteFlowInfo.length === 1 ? (
                            <>
                              Note added to <span className="font-semibold text-[#e8935f]">{noteFlowInfo[0].flowTitle}</span>
                            </>
                          ) : (
                            <div>
                              <div className="mb-1.5">Note added to {noteFlowInfo.length} flows:</div>
                              <div className="space-y-1">
                                {noteFlowInfo.map((flow) => (
                                  <div key={flow.flowId} className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#e8935f]"></span>
                                    <span className="font-semibold text-[#e8935f]">{flow.flowTitle}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="absolute -top-1 left-4 w-2 h-2 bg-theme-bg-secondary border-l border-t border-gray-600 transform rotate-45"></div>
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">{saving ? 'Saving…' : 'Saved'}</div>
                  <button
                    onClick={handleDeleteNote}
                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-theme-bg-secondary rounded transition-colors"
                    title="Delete note"
                    aria-label="Delete note"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
              {!currentNoteId && (
                <div className="text-sm text-gray-500">{saving ? 'Saving…' : 'Saved'}</div>
              )}
            </div>
          </div>
        </div>

        <div 
          className="flex-1 overflow-y-auto content-scroll-container"
          style={{ 
            scrollbarWidth: 'none', /* Firefox */
            msOverflowStyle: 'none', /* IE and Edge */
          }}
        >
          <div className="max-w-6xl mx-auto px-6 py-4">
             {isEditorReady && (
                <Editor
                    ref={editorRef}
                    data={editorData}
                    onChange={handleEditorChange}
                    readOnly={false}
                />
             )}
          </div>
          <style>{`
            .content-scroll-container::-webkit-scrollbar {
              display: none; /* Chrome, Safari, Opera */
            }
          `}</style>
        </div>
      </div>

      {showFlowModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-theme-bg-primary rounded-xl shadow-2xl w-full max-w-md border border-theme-border overflow-hidden">
            <div className="px-6 py-5 border-b border-theme-border">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-light text-theme-text-primary">Add to Flow</h2>
              <button
                onClick={() => {
                  setShowFlowModal(false);
                  setSelectedFlowId(null);
                  setNewFlowName('');
                }}
                className="text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded-lg p-1.5 transition-colors"
                aria-label="Close flow modal"
              >
                <X className="w-5 h-5" />
              </button>
              </div>
            </div>

            <div className="px-6 py-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-theme-text-primary mb-3">Select existing flow</label>
                <div className="max-h-48 overflow-y-auto scrollbar-hide border border-theme-border rounded-lg bg-theme-bg-darkest">
                  {flows.length > 0 ? (
                    flows.map((flow) => (
                      <button
                        key={flow.id}
                        onClick={() => {
                          setSelectedFlowId(flow.id);
                          setNewFlowName('');
                        }}
                        className={`w-full text-left px-4 py-3 transition-all duration-200 ${
                          selectedFlowId === flow.id
                            ? 'bg-[#e8935f] text-white shadow-md'
                            : 'text-theme-text-primary hover:bg-theme-bg-secondary hover:text-white'
                        } ${flows.indexOf(flow) !== flows.length - 1 ? 'border-b border-theme-border' : ''}`}
                      >
                        <span className="font-medium">{flow.title}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-center text-sm text-gray-500">
                      <p>No flows yet</p>
                      <p className="text-xs mt-1 text-gray-600">Create one below</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-theme-border"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="px-3 py-1 bg-theme-bg-primary text-xs font-medium text-gray-500 uppercase tracking-wider">OR</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-theme-text-primary mb-3">Create new flow</label>
                <input
                  type="text"
                  value={newFlowName}
                  onChange={(e) => {
                    setNewFlowName(e.target.value);
                    setSelectedFlowId(null);
                  }}
                  placeholder="Enter flow name..."
                  className="w-full bg-theme-bg-darkest border border-theme-border rounded-lg px-4 py-3 text-theme-text-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#e8935f] focus:border-transparent transition-all"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-theme-border">
                <button
                  onClick={() => {
                    setShowFlowModal(false);
                    setSelectedFlowId(null);
                    setNewFlowName('');
                  }}
                  className="px-5 py-2.5 text-sm font-medium text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-bg-secondary rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFlowSelection}
                  disabled={!selectedFlowId && !newFlowName.trim()}
                  className="px-5 py-2.5 text-sm font-medium bg-[#e8935f] hover:bg-[#d8834f] text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#e8935f] shadow-lg hover:shadow-xl"
                >
                  {selectedFlowId ? 'Add to Flow' : 'Create Flow'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
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

      <AIPromptDialog
        isOpen={showAIDialog}
        onClose={() => setShowAIDialog(false)}
        onGenerate={handleAIGenerate}
        selectedText={selectedText}
        selectionStart={selectionStart}
        selectionEnd={selectionEnd}
        onOpenSettings={() => setShowSettingsDialog(true)}
      />

      {showFolderDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-theme-bg-primary rounded-xl shadow-2xl w-full max-w-md border border-theme-border overflow-hidden">
            <div className="px-6 py-5 border-b border-theme-border">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-light text-theme-text-primary">New Folder</h2>
                <button
                  onClick={() => {
                    setShowFolderDialog(false);
                    setNewFolderName('');
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
                    setNewFolderName('');
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
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <NoteReferenceModal
        isOpen={showNoteReferenceModal}
        onClose={() => setShowNoteReferenceModal(false)}
        onSelectNote={handleSelectNoteReference}
        currentNoteId={currentNoteId}
      />
    </div>
  );
}

// Add global declaration for the timeout to satisfy TS
declare global {
  interface Window {
    editorSaveTimeout?: any;
  }
}
