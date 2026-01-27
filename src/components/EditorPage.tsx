import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import {
  Download,
  Trash2,
  GitBranch,
  Sparkles,
  MoreHorizontal
} from 'lucide-react';
import { getNoteByIdWithContent, saveNote, createNote, deleteNote, setNoteFolder } from '../lib/storage';
import { getFlows, createFlow, addNoteToFlow, Flow, getFlowsContainingNote } from '../lib/flowStorage';
import Editor, { EditorHandle } from './Editor/Editor';
import { markdownToBlocks, blocksToMarkdown } from '../utils/editorConverter';
import ConfirmDialog from './ConfirmDialog';
import Toast from './Toast';
import AIPromptDialog from './AIPromptDialog';
import NoteReferenceModal from './NoteReferenceModal';
import { exportToPDF } from '../lib/pdfExport';
import { logger } from '../utils/logger';
import { exportNoteAsJSON, exportNoteAsMarkdown } from '../utils/export';
import { OutputData } from '@editorjs/editorjs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from './ui/dropdown-menu';

export default function EditorPage() {
  const { noteId: routeNoteId } = useParams({ from: '/note/$noteId' });
  const navigate = useNavigate();
  const noteId = routeNoteId === 'new' ? null : routeNoteId;

  const [title, setTitle] = useState('');
  const [editorData, setEditorData] = useState<OutputData>({ time: Date.now(), blocks: [], version: '2.30.0' });
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(noteId);

  // Dialog states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [flowsUsingNote, setFlowsUsingNote] = useState<Array<{ flowId: string; flowTitle: string }>>([]);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [showNoteReferenceModal, setShowNoteReferenceModal] = useState(false);
  const [showFlowModal, setShowFlowModal] = useState(false);

  // Flow Modal state
  const [flows, setFlows] = useState<Pick<Flow, 'id' | 'title'>[]>([]);
  const [newFlowName, setNewFlowName] = useState('');
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);

  const editorRef = useRef<EditorHandle>(null);

  // AI Selection state
  const [selectedText, setSelectedText] = useState('');
  const [selectionStart, setSelectionStart] = useState<number | undefined>();
  const [selectionEnd, setSelectionEnd] = useState<number | undefined>();

  const [toast, setToast] = useState<{ isOpen: boolean; message: string; type: 'success' | 'error' }>({
    isOpen: false,
    message: '',
    type: 'success',
  });

  useEffect(() => {
    if (noteId) {
      loadNote(noteId);
    } else {
      setTitle('');
      setEditorData({ time: Date.now(), blocks: [], version: '2.30.0' });
      setIsEditorReady(true);

      const pendingFolder = localStorage.getItem('pinn.pendingFolder');
      if (pendingFolder) {
        // Handle pending folder logic if needed
      }
    }
    loadFlows();
  }, [noteId]);

  const loadFlows = () => {
    try {
      const data = getFlows();
      setFlows((data || []).map((f) => ({ id: f.id, title: f.title })));
    } catch (error) {
      logger.error('Error loading flows:', error);
    }
  };

  const loadNote = async (id: string) => {
    try {
      setIsEditorReady(false);
      const data = await getNoteByIdWithContent(id);
      if (data) {
        setTitle(data.title);
        const blocks = await markdownToBlocks(data.content);
        setEditorData(blocks);
        setCurrentNoteId(data.id);
      }
      setIsEditorReady(true);
    } catch (error) {
      logger.error('Error loading note:', error);
      setIsEditorReady(true);
    }
  };

  const saveCurrentNote = useCallback(async () => {
    setSaving(true);
    try {
      let content = '';
      if (editorRef.current) {
        const outputData = await editorRef.current.save();
        content = blocksToMarkdown(outputData);
      }

      if (currentNoteId) {
        const existingNote = await getNoteByIdWithContent(currentNoteId);
        const updated = saveNote({
          id: currentNoteId,
          title: title || 'Untitled',
          content: content,
          folder: existingNote?.folder, // Preserve folder
          created_at: existingNote?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        setCurrentNoteId(updated.id);
      } else {
        const pendingFolder = localStorage.getItem('pinn.pendingFolder');
        const created = createNote(title || 'Untitled', content);
        setCurrentNoteId(created.id);
        if (pendingFolder) {
          setNoteFolder(created.id, pendingFolder);
          localStorage.removeItem('pinn.pendingFolder');
        }
      }
    } catch (e) {
      logger.error('Autosave error:', e);
    } finally {
      setSaving(false);
    }
  }, [currentNoteId, title]);

  useEffect(() => {
    // Autosave on title change
    if (!currentNoteId && !title) return;
    const t = setTimeout(() => {
      saveCurrentNote();
    }, 1000);
    return () => clearTimeout(t);
  }, [title]);

  const handleEditorChange = () => {
    setSaving(true);
    // @ts-ignore
    if (window.editorSaveTimeout) clearTimeout(window.editorSaveTimeout);
    // @ts-ignore
    window.editorSaveTimeout = setTimeout(() => {
      saveCurrentNote();
    }, 1000);
  };

  const handleDeleteNote = () => {
    if (!currentNoteId) return;
    const flows = getFlowsContainingNote(currentNoteId);
    setFlowsUsingNote(flows);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteNote = async () => {
    if (currentNoteId) {
      try {
        await deleteNote(currentNoteId);
        navigate({ to: '/notes' });
      } catch (error) {
        logger.error('Error deleting note:', error);
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
      addNoteToFlow(selectedFlowId, currentNoteId, title || 'Untitled');
    } else if (newFlowName.trim()) {
      const newFlow = createFlow(newFlowName.trim());
      addNoteToFlow(newFlow.id, currentNoteId, title || 'Untitled');
      navigate({ to: '/flows' });
    }

    setShowFlowModal(false);
    setSelectedFlowId(null);
    setNewFlowName('');

    setToast({
        isOpen: true,
        message: 'Added to flow',
        type: 'success'
    });
  };

  const handleAIGenerate = async (generatedText: string, _isReplace: boolean, _startPos?: number, _endPos?: number) => {
    const editor = editorRef.current?.getInstance();
    if (!editor) return;

    const newBlocks = await markdownToBlocks(generatedText);
    newBlocks.blocks.forEach(block => {
        editor.blocks.insert(block.type, block.data);
    });

    handleEditorChange();
    setToast({
      isOpen: true,
      message: 'AI content generated successfully!',
      type: 'success',
    });
  };

  const openAIDialog = () => {
    const selection = window.getSelection();
    const text = selection ? selection.toString() : '';
    setSelectedText(text);
    setSelectionStart(0);
    setSelectionEnd(0);
    setShowAIDialog(true);
  };

  const handleExportNotePDF = async () => {
    if (!currentNoteId) return;
    await saveCurrentNote();
    const note = await getNoteByIdWithContent(currentNoteId);
    if (!note) return;

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
        message: 'Failed to export PDF.',
        type: 'error',
      });
    }
  };

  const handleExportNoteJSON = async () => {
    if (!currentNoteId) return;
    await saveCurrentNote();
    const note = await getNoteByIdWithContent(currentNoteId);
    if (!note) return;
    exportNoteAsJSON(note);
  };

  const handleExportNoteMarkdown = async () => {
    if (!currentNoteId) return;
    await saveCurrentNote();
    const note = await getNoteByIdWithContent(currentNoteId);
    if (!note) return;
    exportNoteAsMarkdown(note);
  };

  const handleSelectNoteReference = (noteId: string, noteTitle: string) => {
     // Insert as a link or special format
     const editor = editorRef.current?.getInstance();
     if (!editor) return;

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
    <div className="h-full flex flex-col relative">
      {/* Top Bar - Clean and Minimal */}
      <div className="flex items-center justify-between px-8 py-4 shrink-0 bg-background z-10">
        <div className="flex-1 max-w-3xl mx-auto w-full">
           {/* Title Input as part of the page content, Notion style */}
        </div>

        <div className="absolute right-6 top-4 flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-2">
                {saving ? 'Saving...' : 'Saved'}
            </span>

            <Button variant="ghost" size="icon" onClick={openAIDialog} title="AI Assistant">
                <Sparkles className="h-4 w-4" />
            </Button>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleAddToFlowClick}>
                        <GitBranch className="mr-2 h-4 w-4" /> Add to Flow
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleExportNotePDF}>
                        <Download className="mr-2 h-4 w-4" /> Export PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportNoteJSON}>
                        <Download className="mr-2 h-4 w-4" /> Export JSON
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportNoteMarkdown}>
                        <Download className="mr-2 h-4 w-4" /> Export Markdown
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDeleteNote}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete Note
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 pb-32">
            {/* Title Area */}
            <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled"
                className="w-full text-4xl font-bold bg-transparent border-none focus:outline-none placeholder:text-muted-foreground/50 py-4"
            />

            {/* Editor Area */}
            {isEditorReady && (
                <Editor
                    ref={editorRef}
                    data={editorData}
                    onChange={handleEditorChange}
                    readOnly={false}
                />
            )}
        </div>
      </div>

      {/* Dialogs */}
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
            ? `This note is used in ${flowsUsingNote.length} flows. Deleting it will remove it from these flows.`
            : "Are you sure you want to delete this note? This cannot be undone."
        }
        confirmText="Delete"
      />

      <AIPromptDialog
        isOpen={showAIDialog}
        onClose={() => setShowAIDialog(false)}
        onGenerate={handleAIGenerate}
        selectedText={selectedText}
        selectionStart={selectionStart}
        selectionEnd={selectionEnd}
      />

      <Toast
        isOpen={toast.isOpen}
        onClose={() => setToast({ ...toast, isOpen: false })}
        message={toast.message}
        type={toast.type}
      />

      {/* Flow Modal */}
      {showFlowModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background border rounded-lg shadow-lg max-w-sm w-full p-6">
                <h3 className="text-lg font-semibold mb-4">Add to Flow</h3>

                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium mb-1.5 block">Select Flow</label>
                        <select
                            className="w-full bg-background border rounded-md p-2 text-sm"
                            onChange={(e) => {
                                setSelectedFlowId(e.target.value);
                                setNewFlowName('');
                            }}
                            value={selectedFlowId || ''}
                        >
                            <option value="">Select a flow...</option>
                            {flows.map(f => (
                                <option key={f.id} value={f.id}>{f.title}</option>
                            ))}
                        </select>
                    </div>

                    <div className="text-center text-xs text-muted-foreground">- OR -</div>

                    <div>
                        <label className="text-sm font-medium mb-1.5 block">Create New Flow</label>
                        <Input
                            placeholder="New Flow Name"
                            value={newFlowName}
                            onChange={(e) => {
                                setNewFlowName(e.target.value);
                                setSelectedFlowId(null);
                            }}
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={() => setShowFlowModal(false)}>Cancel</Button>
                        <Button onClick={handleFlowSelection} disabled={!selectedFlowId && !newFlowName}>Add</Button>
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
