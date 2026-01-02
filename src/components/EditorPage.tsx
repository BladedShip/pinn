import { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Menu as MenuIcon,
  Bold,
  Italic,
  Strikethrough,
  Minus,
  Quote,
  List,
  ListOrdered,
  CheckSquare,
  Table,
  Image,
  Link,
  Code,
  Code2,
  Download,
  Upload,
  Trash2,
  GitBranch,
  X,
  ChevronLeft,
  Book,
  Settings,
  Sparkles,
  FileText,
} from 'lucide-react';
import { getNoteById, getNoteByIdWithContent, saveNote, createNote, deleteNote, getNotes, writeAll, getAllFolders, setNoteFolder } from '../lib/storage';
import { getFlows, createFlow, addNoteToFlow, Flow, getFlowsContainingNote } from '../lib/flowStorage';
import MarkdownEditor from './MarkdownEditor';
import MarkdownPreview from './MarkdownPreview';
import ConfirmDialog from './ConfirmDialog';
import Toast from './Toast';
import SettingsDialog from './SettingsDialog';
import AIPromptDialog from './AIPromptDialog';
import AIComparisonDialog from './AIComparisonDialog';
import NoteReferenceModal from './NoteReferenceModal';
import { exportToPDF } from '../lib/pdfExport';
import { logger } from '../utils/logger';
import { exportNoteAsJSON, exportNoteAsMarkdown, exportNotesAsJSON, exportNotesAsMarkdown } from '../utils/export';
import { useClickOutside } from '../hooks/useClickOutside';

interface EditorPageProps {
  noteId: string | null;
  onNavigateToHome: () => void;
  onNavigateToFlows: () => void;
  onNavigateToNotes: () => void;
  onNavigateToEditor?: (noteId: string) => void;
}

export default function EditorPage({ noteId, onNavigateToHome, onNavigateToFlows, onNavigateToNotes, onNavigateToEditor }: EditorPageProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [editorMode, setEditorMode] = useState<'markdown' | 'preview'>(noteId ? 'preview' : 'markdown');
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
  const [selectedText, setSelectedText] = useState('');
  const [selectionStart, setSelectionStart] = useState<number | undefined>();
  const [selectionEnd, setSelectionEnd] = useState<number | undefined>();
  const [showComparisonDialog, setShowComparisonDialog] = useState(false);
  const [aiComparison, setAiComparison] = useState<{
    oldText: string;
    newText: string;
    startPos: number;
    endPos: number;
  } | null>(null);
  const [showNoteReferenceModal, setShowNoteReferenceModal] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const flowButtonRef = useRef<HTMLButtonElement | null>(null);

  // isEditMode is true when in markdown mode (not preview)
  const isEditMode = editorMode === 'markdown';

  useEffect(() => {
    if (noteId) {
      loadNote(noteId);
      // When opening an existing note, default to preview mode
      setEditorMode('preview');
    } else {
      setTitle('');
      setContent('');
      // When creating a new note, default to edit mode
      setEditorMode('markdown');
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
      const data = await getNoteByIdWithContent(id);
      if (data) {
        setTitle(data.title);
        setContent(data.content);
        setCurrentNoteId(data.id);
        setFolder(data.folder && data.folder.trim() ? data.folder : 'Unfiled');
      }
    } catch (error) {
      logger.error('Error loading note:', error);
    }
  };

  const wrapSelection = (prefix: string, suffix: string = prefix) => {
    const textarea = editorRef.current;
    if (!textarea) return;
    
    // Focus the textarea first
    textarea.focus();
    
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = content.slice(start, end);
    const textToInsert = selected || 'text';
    
    // Use execCommand to make it undoable
    // First, delete selection if any
    if (selected) {
      textarea.setSelectionRange(start, end);
      document.execCommand('delete', false);
    }
    
    // Insert the wrapped text
    const wrappedText = `${prefix}${textToInsert}${suffix}`;
    document.execCommand('insertText', false, wrappedText);
    
    // Update React state to stay in sync
    const newContent = textarea.value;
    setContent(newContent);
    
    // Restore selection roughly around inserted text
    const cursorPos = textarea.selectionStart;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorPos, cursorPos);
    });
  };

  const applyToSelectedLines = (linePrefix: string) => {
    const textarea = editorRef.current;
    if (!textarea) return;
    
    // Focus the textarea first
    textarea.focus();
    
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = content.slice(start, end);
    
    if (!selected) {
      // If no selection, select the current line
      const textBefore = content.slice(0, start);
      const lineStart = textBefore.lastIndexOf('\n') + 1;
      const textAfter = content.slice(start);
      const lineEnd = textAfter.indexOf('\n');
      const actualEnd = lineEnd === -1 ? content.length : start + lineEnd;
      textarea.setSelectionRange(lineStart, actualEnd);
      const lineText = content.slice(lineStart, actualEnd);
      
      // Delete and insert with prefix
      document.execCommand('delete', false);
      const transformed = `${linePrefix}${lineText.replace(/^\s*/, '')}`;
      document.execCommand('insertText', false, transformed);
    } else {
      // Delete selection
      textarea.setSelectionRange(start, end);
      document.execCommand('delete', false);
      
      // Transform lines and insert
      const lines = selected.split(/\n/);
      const transformed = lines.map((l) => `${linePrefix}${l.replace(/^\s*/, '')}`).join('\n');
      document.execCommand('insertText', false, transformed);
    }
    
    // Update React state to stay in sync
    const newContent = textarea.value;
    setContent(newContent);
    
    requestAnimationFrame(() => {
      textarea.focus();
    });
  };

  const insertAtCursor = (text: string) => {
    const textarea = editorRef.current;
    if (!textarea) return;
    
    // Focus the textarea first
    textarea.focus();
    
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    
    // Delete selection if any
    if (start !== end) {
      textarea.setSelectionRange(start, end);
      document.execCommand('delete', false);
    }
    
    // Insert text using execCommand to make it undoable
    document.execCommand('insertText', false, text);
    
    // Update React state to stay in sync
    const newContent = textarea.value;
    setContent(newContent);
    
    const cursorPos = textarea.selectionStart;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorPos, cursorPos);
    });
  };

  useEffect(() => {
    // Save title changes in both edit and preview modes
    // Content changes only happen in edit mode (preview is read-only)
    setSaving(true);
    const t = setTimeout(async () => {
      try {
        if (currentNoteId) {
          // Get note with content to ensure we have created_at
          const existingNote = await getNoteByIdWithContent(currentNoteId);
          // In preview mode, content is read-only so use existing content
          // In edit mode, use current content state
          const contentToSave = isEditMode ? content : (existingNote?.content || content);
          
          const updated = saveNote({
            id: currentNoteId,
            title: title || 'Untitled',
            content: contentToSave,
            folder: folder === 'Unfiled' ? undefined : folder,
            created_at: existingNote?.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          setCurrentNoteId(updated.id);
        } else {
          // Check for pending folder from NotesPage
          const pendingFolder = localStorage.getItem('pinn.pendingFolder');
          const created = createNote(title || 'Untitled', content);
          setCurrentNoteId(created.id);
          // Assign folder if pending
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
    }, 500);
    return () => clearTimeout(t);
  }, [title, content, isEditMode, currentNoteId, folder]);

  useClickOutside(menuRef, () => {
    if (menuOpen) {
      setMenuOpen(false);
    }
  });

  // Handle text selection for AI
  useEffect(() => {
    const textarea = editorRef.current;
    if (!textarea || editorMode !== 'markdown') return;

    const handleSelectionChange = () => {
      const start = textarea.selectionStart ?? 0;
      const end = textarea.selectionEnd ?? 0;
      if (start !== end) {
        const selected = content.slice(start, end);
        setSelectedText(selected);
        setSelectionStart(start);
        setSelectionEnd(end);
      } else {
        setSelectedText('');
        setSelectionStart(undefined);
        setSelectionEnd(undefined);
      }
    };

    textarea.addEventListener('mouseup', handleSelectionChange);
    textarea.addEventListener('keyup', handleSelectionChange);

    return () => {
      textarea.removeEventListener('mouseup', handleSelectionChange);
      textarea.removeEventListener('keyup', handleSelectionChange);
    };
  }, [editorMode, content]);

  // Handle keyboard shortcuts in markdown editor
  useEffect(() => {
    const textarea = editorRef.current;
    if (!textarea || editorMode !== 'markdown') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Only handle shortcuts when modifier is pressed
      if (!modKey) return;

      // Prevent default browser behavior for shortcuts
      if ((e.key === 'b' || e.key === 'B') && modKey && !e.shiftKey) {
        e.preventDefault();
        wrapSelection('**');
      } else if ((e.key === 'i' || e.key === 'I') && modKey && !e.shiftKey) {
        e.preventDefault();
        wrapSelection('*');
      } else if ((e.key === 'k' || e.key === 'K') && modKey && !e.shiftKey) {
        e.preventDefault();
        textarea.focus();
        const start = textarea.selectionStart ?? 0;
        const end = textarea.selectionEnd ?? 0;
        const selected = content.slice(start, end);
        const linkText = selected || 'link text';
        const linkMarkdown = `[${linkText}](https://)`;
        
        // Delete selection if any
        if (selected) {
          textarea.setSelectionRange(start, end);
          document.execCommand('delete', false);
        }
        
        // Insert link markdown using execCommand to make it undoable
        document.execCommand('insertText', false, linkMarkdown);
        
        // Update React state to stay in sync
        const newContent = textarea.value;
        setContent(newContent);
        
        // Select the URL part (https://) for easy editing
        const urlStart = textarea.selectionStart - 8; // Length of 'https://'
        const urlEnd = textarea.selectionStart;
        requestAnimationFrame(() => {
          if (textarea) {
            textarea.focus();
            textarea.setSelectionRange(urlStart, urlEnd);
          }
        });
      } else if (e.key === '`' && modKey && !e.shiftKey) {
        e.preventDefault();
        wrapSelection('`');
      } else if (e.key === '`' && modKey && e.shiftKey) {
        e.preventDefault();
        wrapSelection('\n```\n', '\n```\n');
      } else if ((e.key === 'x' || e.key === 'X') && modKey && e.shiftKey) {
        e.preventDefault();
        wrapSelection('~~');
      }
    };

    textarea.addEventListener('keydown', handleKeyDown);

    return () => {
      textarea.removeEventListener('keydown', handleKeyDown);
    };
  }, [editorMode, content]);

  const handleExportNote = async () => {
    if (!currentNoteId) return;
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
    const note = await getNoteByIdWithContent(currentNoteId);
    if (!note) return;
    exportNoteAsMarkdown(note);
    setMenuOpen(false);
  };

  const handleExportNotePDF = async () => {
    if (!currentNoteId) return;
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

  const confirmDeleteNote = () => {
    if (currentNoteId) {
      deleteNote(currentNoteId);
      onNavigateToHome();
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
      onNavigateToFlows();
      // Note: The flow will be opened from the flows listing page
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

  const handleAIGenerate = (generatedText: string, isReplace: boolean, startPos?: number, endPos?: number) => {
    const textarea = editorRef.current;
    if (!textarea) return;

    if (isReplace && startPos !== undefined && endPos !== undefined) {
      // Store old text for comparison
      const oldText = content.slice(startPos, endPos);
      setAiComparison({
        oldText,
        newText: generatedText,
        startPos,
        endPos,
      });
      setShowComparisonDialog(true);
    } else {
      // Append to end of content (no comparison needed)
      // Use execCommand to make it undoable
      textarea.focus();
      const endPos = content.length;
      textarea.setSelectionRange(endPos, endPos);
      
      // Insert newline and text
      const textToInsert = content ? `\n\n${generatedText}` : generatedText;
      document.execCommand('insertText', false, textToInsert);
      
      // Update React state to stay in sync
      const newContent = textarea.value;
      setContent(newContent);
      
      // Move cursor to end
      requestAnimationFrame(() => {
        textarea.focus();
        const newEndPos = textarea.value.length;
        textarea.setSelectionRange(newEndPos, newEndPos);
        textarea.scrollTop = textarea.scrollHeight;
      });

      // Show success toast
      setToast({
        isOpen: true,
        message: 'AI content generated successfully!',
        type: 'success',
      });
    }
  };

  const handleAcceptAIChange = (editedText?: string) => {
    if (!aiComparison) return;

    const textarea = editorRef.current;
    if (!textarea) return;

    // Use edited text if provided, otherwise use original AI-generated text
    const textToInsert = editedText || aiComparison.newText;
    const { startPos, endPos } = aiComparison;
    
    // Use execCommand to make it undoable
    textarea.focus();
    textarea.setSelectionRange(startPos, endPos);
    
    // Delete selection and insert new text
    document.execCommand('delete', false);
    document.execCommand('insertText', false, textToInsert);
    
    // Update React state to stay in sync
    const newContent = textarea.value;
    setContent(newContent);

    // Set cursor after inserted text
    const newCursorPos = textarea.selectionStart;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    });

    // Close dialog and show toast
    setShowComparisonDialog(false);
    setAiComparison(null);
    setToast({
      isOpen: true,
      message: editedText ? 'AI changes edited and accepted successfully!' : 'AI changes accepted successfully!',
      type: 'success',
    });
  };

  const handleRejectAIChange = () => {
    setShowComparisonDialog(false);
    setAiComparison(null);
    // No toast needed for rejection
  };

  const handleSelectNoteReference = (noteId: string, noteTitle: string) => {
    const textarea = editorRef.current;
    if (!textarea) return;

    // Insert note reference using custom syntax: [[note:noteId|noteTitle]]
    const noteReference = `[[note:${noteId}|${noteTitle}]]`;
    
    // Use execCommand to make it undoable
    textarea.focus();
    const start = textarea.selectionStart ?? content.length;
    const end = textarea.selectionEnd ?? content.length;
    
    // Delete selection if any
    if (start !== end) {
      textarea.setSelectionRange(start, end);
      document.execCommand('delete', false);
    }
    
    // Insert note reference
    document.execCommand('insertText', false, noteReference);
    
    // Update React state to stay in sync
    const newContent = textarea.value;
    setContent(newContent);
    
    // Move cursor after inserted reference
    const cursorPos = textarea.selectionStart;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorPos, cursorPos);
    });

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
            onClick={onNavigateToNotes}
            className="flex items-center gap-2 text-theme-text-secondary hover:text-white transition-colors"
            title="Back to Notes"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">Back</span>
          </button>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={onNavigateToHome}
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
              <div className="flex items-center gap-2 bg-theme-bg-secondary rounded-lg p-1">
                <button
                  onClick={() => setEditorMode('markdown')}
                  className={`px-4 py-2 rounded-md text-sm transition-colors ${
                    editorMode === 'markdown'
                      ? 'bg-theme-bg-primary text-white'
                      : 'text-theme-text-secondary hover:text-theme-text-primary'
                  }`}
                >
                  Write
                </button>
                <button
                  onClick={() => setEditorMode('preview')}
                  className={`px-4 py-2 rounded-md text-sm transition-colors ${
                    editorMode === 'preview'
                      ? 'bg-theme-bg-primary text-white'
                      : 'text-theme-text-secondary hover:text-theme-text-primary'
                  }`}
                >
                  Preview
                </button>
              </div>
            </div>

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
              {editorMode === 'markdown' && (
                <button
                  onClick={() => {
                    const textarea = editorRef.current;
                    if (textarea) {
                      // Capture current selection if any
                      const start = textarea.selectionStart ?? 0;
                      const end = textarea.selectionEnd ?? 0;
                      if (start !== end) {
                        const selected = content.slice(start, end);
                        setSelectedText(selected);
                        setSelectionStart(start);
                        setSelectionEnd(end);
                      } else {
                        setSelectedText('');
                        setSelectionStart(undefined);
                        setSelectionEnd(undefined);
                      }
                    }
                    setShowAIDialog(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-theme-text-primary hover:bg-theme-bg-secondary rounded transition-colors"
                  title="AI Assistant"
                  aria-label="AI Assistant"
                >
                  <Sparkles className="w-4 h-4" />
                </button>
              )}
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

          {isEditMode && editorMode === 'markdown' && (
            <div className="flex items-center gap-1 pb-6 border-b border-theme-border flex-wrap">
              <button onClick={() => wrapSelection('**')} className="p-2 text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded transition-colors" aria-label="Bold">
                <Bold className="w-5 h-5" />
              </button>
              <button onClick={() => wrapSelection('*')} className="p-2 text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded transition-colors" aria-label="Italic">
                <Italic className="w-5 h-5" />
              </button>
              <button onClick={() => wrapSelection('~~')} className="p-2 text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded transition-colors" aria-label="Strikethrough">
                <Strikethrough className="w-5 h-5" />
              </button>
              <div className="w-px h-6 bg-gray-700 mx-2" />
              <button onClick={() => insertAtCursor('\n\n---\n\n')} className="p-2 text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded transition-colors" aria-label="Insert horizontal rule">
                <Minus className="w-5 h-5" />
              </button>
              <button onClick={() => applyToSelectedLines('> ')} className="p-2 text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded transition-colors" aria-label="Quote">
                <Quote className="w-5 h-5" />
              </button>
              <div className="w-px h-6 bg-gray-700 mx-2" />
              <button onClick={() => applyToSelectedLines('- ')} className="p-2 text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded transition-colors" aria-label="Unordered list">
                <List className="w-5 h-5" />
              </button>
              <button onClick={() => applyToSelectedLines('1. ')} className="p-2 text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded transition-colors" aria-label="Ordered list">
                <ListOrdered className="w-5 h-5" />
              </button>
              <button onClick={() => applyToSelectedLines('- [ ] ')} className="p-2 text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded transition-colors" aria-label="Checklist">
                <CheckSquare className="w-5 h-5" />
              </button>
              <div className="w-px h-6 bg-gray-700 mx-2" />
              <button onClick={() => insertAtCursor(`\n\n| Column 1 | Column 2 | Column 3 |\n|---------:|:--------:|:---------|\n| value    | value    | value    |\n\n`)} className="p-2 text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded transition-colors" aria-label="Insert table">
                <Table className="w-5 h-5" />
              </button>
              <button onClick={() => insertAtCursor('![alt text](https://)')} className="p-2 text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded transition-colors" aria-label="Insert image">
                <Image className="w-5 h-5" />
              </button>
              <button onClick={() => insertAtCursor('[link text](https://)')} className="p-2 text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded transition-colors" title="Insert Link" aria-label="Insert link">
                <Link className="w-5 h-5" />
              </button>
              <div className="w-px h-6 bg-gray-700 mx-2" />
              <button onClick={() => wrapSelection('`')} className="p-2 text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded transition-colors" title="Inline Code" aria-label="Inline code">
                <Code className="w-5 h-5" />
              </button>
              <button onClick={() => wrapSelection('\n```\n', '\n```\n')} className="p-2 text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded transition-colors" title="Code Block" aria-label="Code block">
                <Code2 className="w-5 h-5" />
              </button>
              <div className="w-px h-6 bg-gray-700 mx-2" />
              <button onClick={() => setShowNoteReferenceModal(true)} className="p-2 text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded transition-colors" title="Reference Note" aria-label="Reference note">
                <Book className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        <div 
          className="flex-1 overflow-y-auto content-scroll-container"
          style={{ 
            scrollbarWidth: 'none', /* Firefox */
            msOverflowStyle: 'none', /* IE and Edge */
          }}
        >
          <div className="max-w-6xl mx-auto px-6 py-4">
            {editorMode === 'markdown' ? (
              <MarkdownEditor
                ref={editorRef}
                content={content}
                onChange={setContent}
                readOnly={false}
              />
            ) : (
              <MarkdownPreview 
                content={content} 
                onNavigateToNote={onNavigateToEditor}
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

      {aiComparison && (
        <AIComparisonDialog
          isOpen={showComparisonDialog}
          oldText={aiComparison.oldText}
          newText={aiComparison.newText}
          onAccept={handleAcceptAIChange}
          onReject={handleRejectAIChange}
        />
      )}

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
