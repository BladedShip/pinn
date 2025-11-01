import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Handle,
  Position,
  NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FileText, X, Search, Trash2, Tag, Palette, Edit2, Clock, PlusCircle, Calendar, ChevronLeft, Check, HelpCircle, GitBranch, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getFlowById, saveFlow, createFlow as createFlowStorage, Flow, FlowNode, FlowEdge, removeNodeFromFlow } from '../lib/flowStorage';
import { getNotes, getNoteById, saveNote, createNote, Note } from '../lib/storage';
import WYSIWYGEditor from './WYSIWYGEditor';

interface FlowPageProps {
  flowId: string | null;
  onNavigateToHome: () => void;
  onNavigateToEditor: (noteId: string) => void;
  onNavigateToFlows: () => void;
}

interface CustomNodeData extends Record<string, unknown> {
  label: string;
  color?: string;
  tags?: string[];
  noteId: string;
  isDeleted?: boolean;
  completed?: boolean;
}

const nodeColors = [
  '#6366F1', // Indigo
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#F43F5E', // Rose
  '#EF4444', // Red
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#14B8A6', // Teal
];

const edgeColors = [
  '#6366F1', // Indigo
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#F43F5E', // Rose
  '#EF4444', // Red
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#14B8A6', // Teal
];

// Custom Node Component
function CustomNode({ data, id }: NodeProps<Node<CustomNodeData>>) {
  const isCompleted = data.completed === true;
  
  return (
    <div
      className="relative"
      style={{
        background: data.isDeleted ? '#6B7280' : (data.color || '#6366F1'),
        color: '#fff',
        border: data.isDeleted ? '2px dashed #EF4444' : (isCompleted ? '2px solid #10B981' : '1px solid #3a4450'),
        borderRadius: '6px',
        padding: '12px',
        width: '200px',
        opacity: data.isDeleted ? 0.6 : (isCompleted ? 0.75 : 1),
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
      data-node-checkbox-id={id}
    >
      <Handle type="target" position={Position.Top} />
      <div className={`flex gap-2.5 ${data.isDeleted ? 'flex-col items-center justify-center' : 'items-center'}`}>
        {/* Checkbox button */}
        {!data.isDeleted && (
          <div
            data-node-checkbox="true"
            className="flex-shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center"
            title={isCompleted ? 'Mark as incomplete' : 'Mark as completed'}
          >
            {isCompleted ? (
              <CheckCircle2 className="w-4 h-4 text-green-300" strokeWidth={2.5} fill="currentColor" />
            ) : (
              <div className="w-4 h-4 border-2 border-white/60 rounded-full hover:border-white transition-colors" />
            )}
          </div>
        )}
        <div className={`${data.isDeleted ? 'text-center' : 'flex-1 min-w-0'} flex items-center`}>
          <div 
            className={`${data.isDeleted ? '' : 'truncate'} ${isCompleted ? 'line-through opacity-80' : ''}`}
            style={{
              fontSize: '13px',
              fontWeight: '400',
              lineHeight: '1.4',
              letterSpacing: '-0.01em',
              color: '#ffffff',
            }}
          >
            {data.label}
          </div>
        </div>
        {data.isDeleted && (
          <div className="flex items-center justify-center gap-1 mt-1 text-xs text-red-300" style={{ fontSize: '11px', fontWeight: '400' }}>
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            <span>Note deleted</span>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = {
  default: CustomNode,
};

export default function FlowPage({ flowId, onNavigateToHome: _onNavigateToHome, onNavigateToEditor, onNavigateToFlows }: FlowPageProps) {
  const [flow, setFlow] = useState<Flow | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CustomNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Note[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node<CustomNodeData> | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showNodeOptions, setShowNodeOptions] = useState<Node<CustomNodeData> | null>(null);
  const [showEdgeOptions, setShowEdgeOptions] = useState<Edge | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [flowTitle, setFlowTitle] = useState('');
  const [newTag, setNewTag] = useState('');
  const [defaultNodeColor, setDefaultNodeColor] = useState('#6366F1');
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [editingNoteTitle, setEditingNoteTitle] = useState(false);
  const [noteTitleValue, setNoteTitleValue] = useState('');
  const noteTitleInputRef = useRef<HTMLInputElement>(null);
  const isEditingRef = useRef(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const edgeOptionsRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);
  const flowRef = useRef(flow);

  // Keep refs updated
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    flowRef.current = flow;
  }, [flow]);

  useEffect(() => {
    if (flowId) {
      loadFlow(flowId);
    } else {
      // Create a new flow if none exists
      const newFlow = createFlowStorage('Untitled Flow');
      setFlow(newFlow);
      setFlowTitle('Untitled Flow');
      setNodes([]);
      setEdges([]);
    }
  }, [flowId]);

  // Sync node titles when the page becomes visible or receives focus (e.g., after editing notes)
  useEffect(() => {
    const syncNodeTitles = () => {
      const currentNodes = nodesRef.current;
      const currentFlow = flowRef.current;
      
      if (currentNodes.length === 0 || !currentFlow) return;

      const allNotes = getNotes();
      const noteMap = new Map(allNotes.map(note => [note.id, note.title]));
      
      const updatedNodes = currentNodes.map((node) => {
        const noteExists = noteMap.has(node.data.noteId);
        const currentTitle = noteMap.get(node.data.noteId);
        const isDeleted = !noteExists;
        
        // Update label if note exists and title changed
        // Update isDeleted status if it changed
        if ((currentTitle && currentTitle !== node.data.label) || (node.data.isDeleted !== isDeleted)) {
          return {
            ...node,
            data: {
              ...node.data,
              label: currentTitle || node.data.label,
              isDeleted,
            },
          };
        }
        return node;
      });

      const hasChanges = updatedNodes.some((node, idx) => {
        const oldNode = currentNodes[idx];
        return oldNode && (node.data.label !== oldNode.data.label || node.data.isDeleted !== oldNode.data.isDeleted);
      });
      
      if (hasChanges) {
        setNodes(updatedNodes);
        // Update stored flow
        const updatedFlow: Flow = {
          ...currentFlow,
          nodes: updatedNodes.map((node) => ({
            id: node.id,
            noteId: node.data.noteId,
            position: node.position,
            data: {
              label: node.data.label,
              color: node.data.color,
              tags: node.data.tags || [],
              completed: node.data.completed || false,
            },
          })),
        };
        saveFlow(updatedFlow);
        setFlow(updatedFlow);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncNodeTitles();
      }
    };

    const handleFocus = () => {
      syncNodeTitles();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    
    // Also sync periodically (every 3 seconds) when page is visible
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        syncNodeTitles();
      }
    }, 3000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [flowId]); // Only re-run when flowId changes

  const loadFlow = (id: string) => {
    const loadedFlow = getFlowById(id);
    if (loadedFlow) {
      setFlow(loadedFlow);
      setFlowTitle(loadedFlow.title);
      
      // Sync node labels with current note titles
      const reactFlowNodes: Node<CustomNodeData>[] = loadedFlow.nodes.map((node) => {
        const currentNote = getNoteById(node.noteId);
        const isDeleted = !currentNote;
        const currentTitle = currentNote?.title || node.data.label;
        
        return {
          id: node.id,
          position: node.position,
          data: {
            label: currentTitle,
            color: node.data.color || '#6366F1',
            tags: node.data.tags || [],
            noteId: node.noteId,
            isDeleted,
            completed: node.data.completed || false,
          },
          type: 'default',
          selected: false,
        };
      });
      
      const reactFlowEdges: Edge[] = loadedFlow.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        style: { stroke: edge.color || '#6366F1', strokeWidth: 2 },
        animated: true,
      }));
      setNodes(reactFlowNodes);
      setEdges(reactFlowEdges);
      
      // Update stored flow with synced titles
      if (loadedFlow.nodes.some((node) => {
        const currentNote = getNoteById(node.noteId);
        return currentNote && currentNote.title !== node.data.label;
      })) {
        const updatedFlow: Flow = {
          ...loadedFlow,
          nodes: reactFlowNodes.map((node) => ({
            id: node.id,
            noteId: node.data.noteId,
            position: node.position,
            data: {
              label: node.data.label,
              color: node.data.color,
              tags: node.data.tags || [],
              completed: node.data.completed || false,
            },
          })),
        };
        saveFlow(updatedFlow);
        setFlow(updatedFlow);
      }
    }
  };

  const saveFlowToStorage = useCallback(() => {
    if (!flow) return;

    const flowNodes: FlowNode[] = nodes.map((node) => ({
      id: node.id,
      noteId: node.data.noteId,
      position: node.position,
      data: {
        label: node.data.label,
        color: node.data.color,
        tags: node.data.tags || [],
        completed: node.data.completed || false,
      },
    }));

    const flowEdges: FlowEdge[] = edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      color: edge.style?.stroke as string,
    }));

    const updatedFlow: Flow = {
      ...flow,
      title: flowTitle,
      nodes: flowNodes,
      edges: flowEdges,
      updated_at: new Date().toISOString(),
    };

    const saved = saveFlow(updatedFlow);
    setFlow(saved);
  }, [flow, flowTitle, nodes, edges]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      saveFlowToStorage();
    }, 500);
    return () => clearTimeout(timeout);
  }, [nodes, edges, saveFlowToStorage]);

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        ...params,
        id: `edge-${params.source}-${params.target}`,
        style: { stroke: edgeColors[Math.floor(Math.random() * edgeColors.length)], strokeWidth: 2 },
        animated: true,
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges]
  );

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    const allNotes = getNotes();
    // Get note IDs that are already in the flow
    const existingNoteIds = new Set(nodes.map((n) => n.data.noteId));
    
    if (query.trim()) {
      const filtered = allNotes.filter(
        (note) =>
          (note.title.toLowerCase().includes(query.toLowerCase()) ||
          note.content.toLowerCase().includes(query.toLowerCase())) &&
          !existingNoteIds.has(note.id)
      );
      // Sort by relevance (title matches first)
      filtered.sort((a, b) => {
        const aTitleMatch = a.title.toLowerCase().startsWith(query.toLowerCase());
        const bTitleMatch = b.title.toLowerCase().startsWith(query.toLowerCase());
        if (aTitleMatch && !bTitleMatch) return -1;
        if (!aTitleMatch && bTitleMatch) return 1;
        return a.title.localeCompare(b.title);
      });
      setSearchResults(filtered.slice(0, 10)); // Limit to 10 suggestions
    } else {
      // Show recent/available notes as suggestions when search is empty
      const availableNotes = allNotes
        .filter((note) => !existingNoteIds.has(note.id))
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 5);
      setSearchResults(availableNotes);
    }
  }, [nodes]);

  useEffect(() => {
    // Load suggestions when search dropdown opens
    if (showSearch && !searchQuery) {
      handleSearch('');
    }
  }, [showSearch, handleSearch, searchQuery]);

  useEffect(() => {
    if (!showSearch && !showEdgeOptions) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      if (showSearch && searchRef.current && !searchRef.current.contains(target)) {
        setShowSearch(false);
        setSearchQuery('');
      }
      
      if (showEdgeOptions && edgeOptionsRef.current && !edgeOptionsRef.current.contains(target)) {
        setShowEdgeOptions(null);
      }
    };

    // Use capture phase to catch the event early
    document.addEventListener('mousedown', handleClickOutside, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [showSearch, showEdgeOptions]);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    setShowEdgeOptions(null);
  }, [setEdges]);

  // Handle Delete/Backspace key to delete selected nodes or edges
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't delete if user is typing in an input field
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Check for Delete or Backspace key
      if (event.key === 'Delete' || event.key === 'Backspace') {
        // Delete selected edges
        if (selectedEdges.length > 0) {
          event.preventDefault();
          selectedEdges.forEach((edgeId) => {
            handleDeleteEdge(edgeId);
          });
          setSelectedEdges([]);
          setShowEdgeOptions(null);
          return;
        }

        // Delete selected edge if edge options are open (single edge)
        if (showEdgeOptions) {
          event.preventDefault();
          handleDeleteEdge(showEdgeOptions.id);
          return;
        }

        // Delete all selected nodes
        if (selectedNodes.length > 0) {
          event.preventDefault();
          const currentFlow = flowRef.current;
          selectedNodes.forEach((nodeId) => {
            if (currentFlow) {
              removeNodeFromFlow(currentFlow.id, nodeId);
            }
            setNodes((nds) => nds.filter((n) => n.id !== nodeId));
            setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
          });
          setSelectedNodes([]);
          setShowNodeOptions(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedNodes, selectedEdges, showEdgeOptions, handleDeleteEdge, setNodes, setEdges]);

  const handleAddNote = (note: Note) => {
    if (!flow) return;

    const newNode: Node<CustomNodeData> = {
      id: `node-${note.id}-${Date.now()}`,
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 400 + 100,
      },
      data: {
        label: note.title,
        color: defaultNodeColor,
        tags: [],
        noteId: note.id,
        isDeleted: false,
        completed: false,
      },
      type: 'default',
    };

    setNodes((nds) => [...nds, newNode]);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearch(false);
  };

  const handleCreateNewNode = () => {
    if (!flow) return;

    // Create a new note
    const newNote = createNote('Untitled', '');
    
    // Add it to the flow
    handleAddNote(newNote);
  };

  const handleNodeDoubleClick = (_: React.MouseEvent, node: Node<CustomNodeData>) => {
    // Don't open preview for deleted notes
    if (node.data.isDeleted) {
      return;
    }
    setSelectedNode(node);
    setShowPreview(true);
  };

  const handleDeleteNode = (nodeId: string) => {
    if (flow) {
      removeNodeFromFlow(flow.id, nodeId);
    }
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setShowNodeOptions(null);
  };

  const handleChangeNodeColor = (nodeId: string, color: string, closeOptions: boolean = true) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: { ...node.data, color },
            style: { ...node.style, background: color },
          };
        }
        return node;
      })
    );
    if (closeOptions) {
      setShowNodeOptions(null);
    }
  };

  const handleChangeSelectedNodesColor = (color: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (selectedNodes.includes(node.id)) {
          return {
            ...node,
            data: { ...node.data, color },
            style: { ...node.style, background: color },
          };
        }
        return node;
      })
    );
    setSelectedNodes([]);
  };

  const handleNodeClick = (event: React.MouseEvent, node: Node<CustomNodeData>) => {
    // Check if click was on the checkbox
    const target = event.target as HTMLElement;
    const isCheckboxClick = target.closest('[data-node-checkbox="true"]') !== null;
    
    if (isCheckboxClick) {
      // Toggle completed status instead of selecting
      event.stopPropagation();
      handleToggleCompleted(node.id);
      return;
    }

    // Clear edge selection when selecting nodes
    setSelectedEdges([]);
    setShowEdgeOptions(null);

    if (event.ctrlKey || event.metaKey) {
      // Multi-select with Ctrl/Cmd
      setSelectedNodes((prev) =>
        prev.includes(node.id) ? prev.filter((id) => id !== node.id) : [...prev, node.id]
      );
    } else {
      // Single select - select this node
      setSelectedNodes([node.id]);
    }
  };

  const handleEdgeClick = (event: React.MouseEvent, edge: Edge) => {
    // Clear node selection when selecting edges
    setSelectedNodes([]);
    setShowNodeOptions(null);

    if (event.ctrlKey || event.metaKey) {
      // Multi-select with Ctrl/Cmd
      setSelectedEdges((prev) =>
        prev.includes(edge.id) ? prev.filter((id) => id !== edge.id) : [...prev, edge.id]
      );
    } else {
      // Single select - select this edge
      setSelectedEdges([edge.id]);
    }
  };

  const handleChangeEdgeColor = (edgeId: string, color: string) => {
    setEdges((eds) =>
      eds.map((edge) => {
        if (edge.id === edgeId) {
          return { ...edge, style: { ...edge.style, stroke: color, strokeWidth: 2 } };
        }
        return edge;
      })
    );
    setShowEdgeOptions(null);
  };

  const handleChangeSelectedEdgesColor = (color: string) => {
    setEdges((eds) =>
      eds.map((edge) => {
        if (selectedEdges.includes(edge.id)) {
          return { ...edge, style: { ...edge.style, stroke: color, strokeWidth: 2 } };
        }
        return edge;
      })
    );
    setSelectedEdges([]);
    setShowEdgeOptions(null);
  };

  const handleAddTagToNode = (nodeId: string, tag: string) => {
    if (!tag.trim()) return;
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          const existingTags = node.data.tags || [];
          if (!existingTags.includes(tag.trim())) {
            return {
              ...node,
              data: { ...node.data, tags: [...existingTags, tag.trim()] },
            };
          }
        }
        return node;
      })
    );
    setNewTag('');
  };

  const handleRemoveTagFromNode = (nodeId: string, tag: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              tags: (node.data.tags || []).filter((t) => t !== tag),
            },
          };
        }
        return node;
      })
    );
  };

  const handleToggleCompleted = (nodeId: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              completed: !node.data.completed,
            },
          };
        }
        return node;
      })
    );
  };

  const handleToggleSelectedNodesCompleted = () => {
    // Check if all selected nodes are completed
    const allCompleted = selectedNodes.every((nodeId) => {
      const node = nodes.find((n) => n.id === nodeId);
      return node?.data.completed === true;
    });

    // Toggle all to the opposite state
    setNodes((nds) =>
      nds.map((node) => {
        if (selectedNodes.includes(node.id)) {
          return {
            ...node,
            data: {
              ...node.data,
              completed: !allCompleted,
            },
          };
        }
        return node;
      })
    );
    setSelectedNodes([]);
  };

  const handleSaveTitle = () => {
    setEditingTitle(false);
    if (flow && flowTitle.trim()) {
      const updatedFlow = { ...flow, title: flowTitle.trim() };
      saveFlow(updatedFlow);
      setFlow(updatedFlow);
    }
  };

  const filteredNodes = selectedTags.length > 0
    ? nodes.filter((node) => {
        const nodeTags = node.data.tags || [];
        return selectedTags.some((tag) => nodeTags.includes(tag));
      })
    : nodes;

  const allTags = Array.from(new Set(nodes.flatMap((node) => node.data.tags || [])));

  const selectedNote = selectedNode ? getNoteById(selectedNode.data.noteId) : null;

  // Sync note title value when selected note changes (but not while editing)
  useEffect(() => {
    if (selectedNote && !editingNoteTitle) {
      setNoteTitleValue(selectedNote.title);
    }
  }, [selectedNote, editingNoteTitle]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingNoteTitle && noteTitleInputRef.current) {
      // Use setTimeout to ensure the input is fully rendered before focusing
      const timer = setTimeout(() => {
        if (noteTitleInputRef.current) {
          noteTitleInputRef.current.focus();
          noteTitleInputRef.current.select();
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [editingNoteTitle]);

  const handleSaveNoteTitle = () => {
    if (!selectedNote || !selectedNode || !flow) return;
    if (!isEditingRef.current) return; // Don't save if we're not actually editing
    
    const trimmedTitle = noteTitleValue.trim();
    if (!trimmedTitle) {
      setNoteTitleValue(selectedNote.title);
      setEditingNoteTitle(false);
      isEditingRef.current = false;
      return;
    }

    if (trimmedTitle !== selectedNote.title) {
      // Save to note
      saveNote({
        ...selectedNote,
        title: trimmedTitle,
      });

      // Update node label in nodes array
      const updatedNodes = nodes.map((node) =>
        node.id === selectedNode.id
          ? { ...node, data: { ...node.data, label: trimmedTitle } }
          : node
      );
      setNodes(updatedNodes);

      // Update selected node reference
      const updatedSelectedNode = {
        ...selectedNode,
        data: { ...selectedNode.data, label: trimmedTitle },
      };
      setSelectedNode(updatedSelectedNode);

      // Update flow storage immediately to ensure sync
      const flowNodes: FlowNode[] = updatedNodes.map((node) => ({
        id: node.id,
        noteId: node.data.noteId,
        position: node.position,
        data: {
          label: node.data.label,
          color: node.data.color,
          tags: node.data.tags || [],
          completed: node.data.completed || false,
        },
      }));

      const updatedFlow: Flow = {
        ...flow,
        nodes: flowNodes,
        updated_at: new Date().toISOString(),
      };

      const savedFlow = saveFlow(updatedFlow);
      setFlow(savedFlow);
    }

    setEditingNoteTitle(false);
    isEditingRef.current = false;
  };

  return (
    <div className="min-h-screen bg-[#2c3440]">
      <header className="sticky top-0 z-50 bg-[#2c3440] flex items-center justify-between px-6 py-4 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <button
            onClick={onNavigateToFlows}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            title="Back to Flows"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">Back</span>
          </button>
        </div>
        <div className="flex-1 mx-8">
          {editingTitle ? (
            <input
              type="text"
              value={flowTitle}
              onChange={(e) => setFlowTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveTitle();
                }
              }}
              className="bg-[#3a4450] border border-gray-600 rounded-lg px-4 py-2 text-gray-300 focus:outline-none focus:border-gray-500 w-full"
              autoFocus
            />
          ) : (
            <button
              onClick={() => setEditingTitle(true)}
              className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
            >
              <h2 className="text-xl font-light">{flowTitle}</h2>
              <Edit2 className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleCreateNewNode}
            className="flex items-center gap-2 px-4 py-2 bg-[#6366F1] hover:bg-[#4F46E5] text-white rounded-lg transition-colors"
            title="Create new node"
          >
            <PlusCircle className="w-5 h-5" />
            <span>New Node</span>
          </button>
          <div className="relative" ref={searchRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSearch(!showSearch);
              }}
              className="flex items-center gap-2 px-4 py-2 text-gray-300 hover:text-white transition-colors"
            >
              <Search className="w-5 h-5" />
              <span>Search Notes</span>
            </button>
            {showSearch && (
              <div 
                className="absolute right-0 mt-2 w-96 bg-[#3a4450] border border-gray-600 rounded-lg shadow-xl z-50 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 border-b border-gray-600 bg-[#2c3440]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Search notes..."
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      className="w-full bg-[#3a4450] border border-gray-600 rounded-lg pl-10 pr-4 py-2.5 text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#6366F1] transition-colors text-sm"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto scrollbar-hide">
                  {searchResults.length > 0 ? (
                    <>
                      <div className="px-4 py-2 border-b border-gray-600 bg-[#2c3440]">
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          {searchQuery ? (
                            <>
                              <Search className="w-3 h-3" />
                              <span>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3" />
                              <span>Recent notes</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="p-2">
                        {searchResults.map((note) => {
                          const formatDate = (dateString: string) => {
                            const date = new Date(dateString);
                            const now = new Date();
                            const diffMs = now.getTime() - date.getTime();
                            const diffMins = Math.floor(diffMs / 60000);
                            const diffHours = Math.floor(diffMs / 3600000);
                            const diffDays = Math.floor(diffMs / 86400000);

                            if (diffMins < 1) return 'Just now';
                            if (diffMins < 60) return `${diffMins}m ago`;
                            if (diffHours < 24) return `${diffHours}h ago`;
                            if (diffDays < 7) return `${diffDays}d ago`;
                            return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                          };
                          
                          return (
                            <button
                              key={note.id}
                              onClick={() => handleAddNote(note)}
                              className="w-full text-left px-3 py-3 hover:bg-[#2c3440] rounded-lg transition-colors group mb-1 border border-transparent hover:border-gray-600"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <FileText className="w-4 h-4 text-gray-500 group-hover:text-[#6366F1] transition-colors flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors truncate mb-0.5">
                                      {searchQuery && note.title.toLowerCase().includes(searchQuery.toLowerCase()) ? (
                                        <>
                                          {note.title.substring(0, note.title.toLowerCase().indexOf(searchQuery.toLowerCase()))}
                                          <span className="bg-[#6366F1]/20 text-[#6366F1] px-0.5 rounded">
                                            {note.title.substring(
                                              note.title.toLowerCase().indexOf(searchQuery.toLowerCase()),
                                              note.title.toLowerCase().indexOf(searchQuery.toLowerCase()) + searchQuery.length
                                            )}
                                          </span>
                                          {note.title.substring(
                                            note.title.toLowerCase().indexOf(searchQuery.toLowerCase()) + searchQuery.length
                                          )}
                                        </>
                                      ) : (
                                        note.title
                                      )}
                                    </h4>
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                      <Clock className="w-3 h-3" />
                                      <span>{formatDate(note.updated_at)}</span>
                                    </div>
                                  </div>
                                </div>
                                <PlusCircle className="w-5 h-5 text-gray-500 group-hover:text-[#6366F1] transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : searchQuery ? (
                    <div className="p-8 text-center">
                      <Search className="w-8 h-8 text-gray-500 mx-auto mb-3 opacity-50" />
                      <p className="text-sm text-gray-400 mb-1">No notes found</p>
                      <p className="text-xs text-gray-500">Try a different search term</p>
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <Search className="w-8 h-8 text-gray-500 mx-auto mb-3 opacity-50" />
                      <p className="text-sm text-gray-400 mb-1">Start typing to search</p>
                      <p className="text-xs text-gray-500">or browse recent notes above</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        <div className="w-64 bg-[#3a4450] border-r border-gray-700 p-4 overflow-y-auto">
          <div className="mb-6">
            <div className="mb-3">
              <label className="text-xs font-medium text-gray-400 block leading-tight">Default Node Color</label>
              <span className="text-xs text-gray-500">For new nodes</span>
            </div>
            <div className="grid grid-cols-4 gap-2.5">
              {nodeColors.map((color) => {
                const isSelected = defaultNodeColor === color;
                return (
                  <button
                    key={color}
                    onClick={() => setDefaultNodeColor(color)}
                    className={`relative w-9 h-9 rounded-lg border-2 transition-all hover:scale-105 ${
                      isSelected
                        ? 'border-gray-300 scale-105 ring-2 ring-gray-400/50 ring-offset-2 ring-offset-[#3a4450]'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  >
                    {isSelected && (
                      <Check className="w-4 h-4 text-white absolute inset-0 m-auto drop-shadow-md" strokeWidth={3} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="border-t border-gray-600 mb-4"></div>
          {selectedNodes.length > 0 && (
            <>
              <div className="mb-4 p-3 bg-[#2c3440]/40 rounded border border-gray-700/50">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-medium text-gray-400">
                      {selectedNodes.length} {selectedNodes.length === 1 ? 'node' : 'nodes'} selected
                    </div>
                    {selectedNodes.length === 1 && (
                      <span className="text-xs text-gray-500 truncate max-w-[120px]">
                        • {nodes.find(n => n.id === selectedNodes[0])?.data.label || 'Untitled'}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedNodes([])}
                    className="p-1 hover:bg-gray-700/50 rounded transition-colors"
                    title="Clear selection"
                  >
                    <X className="w-3 h-3 text-gray-500" />
                  </button>
                </div>

                {/* Selected nodes list (if multiple) */}
                {selectedNodes.length > 1 && selectedNodes.length <= 5 && (
                  <div className="mb-3 space-y-1 max-h-24 overflow-y-auto scrollbar-hide">
                    {selectedNodes.map((nodeId) => {
                      const node = nodes.find(n => n.id === nodeId);
                      if (!node) return null;
                      return (
                        <div
                          key={nodeId}
                          className="flex items-center gap-2 px-2 py-1 rounded bg-[#2c3440]/30"
                        >
                          <div
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: node.data.color || '#6366F1' }}
                          />
                          <span className="text-xs text-gray-400 truncate flex-1">
                            {node.data.label || 'Untitled'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-3">
                  {/* Color Picker */}
                  <div>
                    <label className="text-xs text-gray-500 mb-2 block">Color</label>
                    <div className="grid grid-cols-4 gap-2">
                      {nodeColors.map((color) => {
                        const isSelected = selectedNodes.every(nodeId => {
                          const node = nodes.find(n => n.id === nodeId);
                          return node?.data.color === color;
                        });
                        return (
                          <button
                            key={color}
                            onClick={() => handleChangeSelectedNodesColor(color)}
                            className={`relative w-7 h-7 rounded border transition-all ${
                              isSelected
                                ? 'border-gray-400 ring-1 ring-gray-500/50'
                                : 'border-gray-700 hover:border-gray-600'
                            }`}
                            style={{ backgroundColor: color }}
                            title={color}
                          >
                            {isSelected && (
                              <Check className="w-3 h-3 text-white absolute inset-0 m-auto" strokeWidth={2.5} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Completed Toggle */}
                  {(() => {
                    const allCompleted = selectedNodes.every((nodeId) => {
                      const node = nodes.find((n) => n.id === nodeId);
                      return node?.data.completed === true;
                    });
                    return (
                      <div>
                        <button
                          onClick={handleToggleSelectedNodesCompleted}
                          className={`w-full px-2 py-1.5 rounded text-xs transition-all flex items-center justify-center gap-1.5 ${
                            allCompleted
                              ? 'bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 hover:border-green-500/50 text-green-400/80 hover:text-green-400'
                              : 'bg-[#3a4450]/50 hover:bg-[#3a4450] border border-gray-700/50 hover:border-gray-600 text-gray-300 hover:text-white'
                          }`}
                        >
                          <CheckCircle2 className={`w-3 h-3 ${allCompleted ? '' : 'opacity-50'}`} />
                          {allCompleted ? 'Mark Incomplete' : 'Mark Completed'}
                        </button>
                      </div>
                    );
                  })()}

                  {/* Delete Button */}
                  <button
                    onClick={() => {
                      const currentFlow = flowRef.current;
                      selectedNodes.forEach((nodeId) => {
                        if (currentFlow) {
                          removeNodeFromFlow(currentFlow.id, nodeId);
                        }
                        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
                        setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
                      });
                      setSelectedNodes([]);
                      setShowNodeOptions(null);
                    }}
                    className="w-full px-2 py-1.5 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 hover:border-red-500/30 text-red-400/80 hover:text-red-400 rounded text-xs transition-all flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                </div>
              </div>
              <div className="border-t border-gray-600 mb-4"></div>
            </>
          )}
          {selectedEdges.length > 0 && (
            <>
              <div className="mb-4 p-3 bg-[#2c3440]/40 rounded border border-gray-700/50">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-medium text-gray-400">
                      {selectedEdges.length} {selectedEdges.length === 1 ? 'edge' : 'edges'} selected
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedEdges([])}
                    className="p-1 hover:bg-gray-700/50 rounded transition-colors"
                    title="Clear selection"
                  >
                    <X className="w-3 h-3 text-gray-500" />
                  </button>
                </div>

                {/* Selected edges list (if multiple) */}
                {selectedEdges.length > 1 && selectedEdges.length <= 5 && (
                  <div className="mb-3 space-y-1 max-h-24 overflow-y-auto scrollbar-hide">
                    {selectedEdges.map((edgeId) => {
                      const edge = edges.find((e) => e.id === edgeId);
                      if (!edge) return null;
                      const sourceNode = nodes.find((n) => n.id === edge.source);
                      const targetNode = nodes.find((n) => n.id === edge.target);
                      return (
                        <div
                          key={edgeId}
                          className="flex items-center gap-2 px-2 py-1 rounded bg-[#2c3440]/30"
                        >
                          <div
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: edge.style?.stroke || '#6366F1' }}
                          />
                          <span className="text-xs text-gray-400 truncate flex-1">
                            {sourceNode?.data.label || 'Node'} → {targetNode?.data.label || 'Node'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-3">
                  {/* Color Picker */}
                  <div>
                    <label className="text-xs text-gray-500 mb-2 block">Color</label>
                    <div className="grid grid-cols-4 gap-2">
                      {edgeColors.map((color) => {
                        const isSelected = selectedEdges.every((edgeId) => {
                          const edge = edges.find((e) => e.id === edgeId);
                          return edge?.style?.stroke === color;
                        });
                        return (
                          <button
                            key={color}
                            onClick={() => handleChangeSelectedEdgesColor(color)}
                            className={`relative w-7 h-7 rounded border transition-all ${
                              isSelected
                                ? 'border-gray-400 ring-1 ring-gray-500/50'
                                : 'border-gray-700 hover:border-gray-600'
                            }`}
                            style={{ backgroundColor: color }}
                            title={color}
                          >
                            {isSelected && (
                              <Check className="w-3 h-3 text-white absolute inset-0 m-auto" strokeWidth={2.5} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={() => {
                      selectedEdges.forEach((edgeId) => {
                        handleDeleteEdge(edgeId);
                      });
                      setSelectedEdges([]);
                      setShowEdgeOptions(null);
                    }}
                    className="w-full px-2 py-1.5 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 hover:border-red-500/30 text-red-400/80 hover:text-red-400 rounded text-xs transition-all flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                </div>
              </div>
              <div className="border-t border-gray-600 mb-4"></div>
            </>
          )}
          <h3 className="text-sm uppercase tracking-wider text-gray-500 mb-4">Tags</h3>
          {allTags.length > 0 ? (
            <div className="space-y-2">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    setSelectedTags((prev) =>
                      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                    );
                  }}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-[#6366F1] text-white'
                      : 'bg-[#2c3440] text-gray-300 hover:bg-[#2c3440] hover:text-white'
                  }`}
                >
                  {tag}
                </button>
              ))}
              {selectedTags.length > 0 && (
                <button
                  onClick={() => setSelectedTags([])}
                  className="w-full text-left px-3 py-2 rounded text-sm bg-[#2c3440] text-gray-400 hover:text-white transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500">No tags yet</div>
          )}
        </div>

        <div className="flex-1 relative">
          <ReactFlowProvider>
            <ReactFlow
              nodes={filteredNodes.map((node) => ({
                ...node,
                type: 'default',
                selected: selectedNodes.includes(node.id),
              }))}
              edges={edges.map((edge) => ({
                ...edge,
                selected: selectedEdges.includes(edge.id),
              }))}
              nodeTypes={nodeTypes}
              onNodesChange={(changes) => {
                // Clear selection when nodes are deleted
                changes.forEach((change) => {
                  if (change.type === 'remove' && selectedNodes.includes(change.id)) {
                    setSelectedNodes((prev) => prev.filter((id) => id !== change.id));
                  }
                });
                onNodesChange(changes);
              }}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              onNodeContextMenu={(e, node) => {
                e.preventDefault();
                setShowNodeOptions(node as unknown as Node<CustomNodeData>);
                if (!selectedNodes.includes(node.id)) {
                  setSelectedNodes([]);
                }
              }}
              onEdgeClick={handleEdgeClick}
              onEdgeContextMenu={(e, edge) => {
                e.preventDefault();
                setShowEdgeOptions(edge);
                // If edge is not in selected edges, clear selection
                if (!selectedEdges.includes(edge.id)) {
                  setSelectedEdges([]);
                }
                setSelectedNodes([]);
              }}
              onPaneClick={() => {
                setSelectedNodes([]);
                setSelectedEdges([]);
                setShowNodeOptions(null);
                setShowEdgeOptions(null);
              }}
              fitView
            >
              <Background color="#4a5560" gap={16} />
              <Controls 
                style={{ backgroundColor: '#3a4450', color: '#9ca3af' } as React.CSSProperties}
              />
              <MiniMap 
                nodeColor={(node) => {
                  const nodeData = node.data as unknown as CustomNodeData;
                  return nodeData.color || '#6366F1';
                }}
                maskColor="rgba(44, 52, 64, 0.6)"
                style={{
                  backgroundColor: '#3a4450',
                  border: '1px solid #4a5560',
                  borderRadius: '8px',
                }}
              />
            </ReactFlow>
          </ReactFlowProvider>

          {showNodeOptions && (
            <div className="absolute top-4 right-4 bg-[#2c3440] border border-gray-700 rounded-lg shadow-xl p-5 z-50 w-72 backdrop-blur-sm">
              {/* Header */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-700/50">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-200 truncate">
                    {showNodeOptions.data.label || 'Untitled Node'}
                  </h4>
                  <p className="text-xs text-gray-500">Node options</p>
                </div>
                <button
                  onClick={() => setShowNodeOptions(null)}
                  className="p-1.5 hover:bg-gray-700/50 rounded transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4 text-gray-400 hover:text-gray-300" />
                </button>
              </div>

              {showNodeOptions.data.isDeleted && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <div className="flex items-center gap-2 text-red-400 text-xs">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span className="font-medium">Note deleted</span>
                  </div>
                  <p className="text-xs text-red-300/80 mt-1">
                    This node references a note that has been deleted.
                  </p>
                </div>
              )}

              <div className="space-y-4">
                {/* Color Picker */}
                <div>
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-400 mb-3">
                    <Palette className="w-3.5 h-3.5" />
                    Color
                  </label>
                  <div className="grid grid-cols-4 gap-2.5">
                    {nodeColors.map((color) => {
                      const isCurrentColor = showNodeOptions.data.color === color;
                      return (
                        <button
                          key={color}
                          onClick={() => handleChangeNodeColor(showNodeOptions.id, color)}
                          className={`relative w-9 h-9 rounded-lg border-2 transition-all hover:scale-105 ${
                            isCurrentColor
                              ? 'border-gray-300 scale-105 ring-2 ring-gray-400/50 ring-offset-2 ring-offset-[#2c3440]'
                              : 'border-gray-700 hover:border-gray-600'
                          }`}
                          style={{ backgroundColor: color }}
                          title={color}
                        >
                          {isCurrentColor && (
                            <Check className="w-4 h-4 text-white absolute inset-0 m-auto drop-shadow-md" strokeWidth={3} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Tags Section */}
                <div>
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-400 mb-2">
                    <Tag className="w-3.5 h-3.5" />
                    Tags
                  </label>
                  {(showNodeOptions.data.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {(showNodeOptions.data.tags || []).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#3a4450]/50 border border-gray-700/50 text-gray-300 text-xs rounded-md hover:bg-[#3a4450] transition-colors"
                        >
                          {tag}
                          <button
                            onClick={() => handleRemoveTagFromNode(showNodeOptions.id, tag)}
                            className="hover:text-red-400 transition-colors p-0.5 -mr-1"
                            title="Remove tag"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newTag.trim()) {
                          handleAddTagToNode(showNodeOptions.id, newTag);
                        }
                      }}
                      placeholder="Add tag..."
                      className="flex-1 bg-[#3a4450]/50 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#6366F1]/50 focus:bg-[#3a4450] transition-colors"
                    />
                    <button
                      onClick={() => handleAddTagToNode(showNodeOptions.id, newTag)}
                      disabled={!newTag.trim()}
                      className="px-3 py-1.5 bg-[#6366F1] hover:bg-[#4F46E5] text-white rounded-md text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center h-[34px] w-[34px]"
                      title="Add tag"
                    >
                      <PlusCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Completed Toggle */}
                <div className="pt-2 border-t border-gray-700/50">
                  <button
                    onClick={() => handleToggleCompleted(showNodeOptions.id)}
                    className={`w-full px-3 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                      showNodeOptions.data.completed
                        ? 'bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 hover:border-green-500/50 text-green-400 hover:text-green-300'
                        : 'bg-[#3a4450]/50 hover:bg-[#3a4450] border border-gray-700/50 hover:border-gray-600 text-gray-300 hover:text-white'
                    }`}
                  >
                    <CheckCircle2 className={`w-4 h-4 ${showNodeOptions.data.completed ? '' : 'opacity-50'}`} />
                    {showNodeOptions.data.completed ? 'Completed' : 'Mark as Completed'}
                  </button>
                </div>

                {/* Delete Button */}
                <div className="pt-2 border-t border-gray-700/50">
                  <button
                    onClick={() => handleDeleteNode(showNodeOptions.id)}
                    className="w-full px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 text-red-400 hover:text-red-300 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Node
                  </button>
                </div>
              </div>
            </div>
          )}

          {showEdgeOptions && (
            <div
              ref={edgeOptionsRef}
              className="absolute top-4 right-4 bg-[#2c3440] border border-gray-700 rounded-lg shadow-xl p-5 z-50 w-72 backdrop-blur-sm"
            >
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-700/50">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-200">Edge Options</h4>
                  <p className="text-xs text-gray-500">Connection settings</p>
                </div>
                <button
                  onClick={() => setShowEdgeOptions(null)}
                  className="p-1.5 hover:bg-gray-700/50 rounded transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4 text-gray-400 hover:text-gray-300" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Color Picker */}
                <div>
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-400 mb-3">
                    <Palette className="w-3.5 h-3.5" />
                    Color
                  </label>
                  <div className="grid grid-cols-4 gap-2.5">
                    {edgeColors.map((color) => {
                      const isCurrentColor = showEdgeOptions.style?.stroke === color;
                      return (
                        <button
                          key={color}
                          onClick={() => handleChangeEdgeColor(showEdgeOptions.id, color)}
                          className={`relative w-9 h-9 rounded-lg border-2 transition-all hover:scale-105 ${
                            isCurrentColor
                              ? 'border-gray-300 scale-105 ring-2 ring-gray-400/50 ring-offset-2 ring-offset-[#2c3440]'
                              : 'border-gray-700 hover:border-gray-600'
                          }`}
                          style={{ backgroundColor: color }}
                          title={color}
                        >
                          {isCurrentColor && (
                            <Check className="w-4 h-4 text-white absolute inset-0 m-auto drop-shadow-md" strokeWidth={3} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Delete Button */}
                <div className="pt-2 border-t border-gray-700/50">
                  <button
                    onClick={() => handleDeleteEdge(showEdgeOptions.id)}
                    className="w-full px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 text-red-400 hover:text-red-300 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Edge
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showPreview && selectedNote && selectedNode && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowPreview(false);
            setSelectedNode(null);
          }}
        >
          <div 
            className="bg-[#2c3440] rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-600"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-[#3a4450] to-[#2c3440] px-6 py-5 border-b border-gray-700">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="mb-2">
                    {editingNoteTitle ? (
                      <input
                        ref={noteTitleInputRef}
                        type="text"
                        value={noteTitleValue}
                        onChange={(e) => setNoteTitleValue(e.target.value)}
                        onBlur={() => {
                          // Add small delay to prevent immediate blur when clicking to edit
                          setTimeout(() => {
                            if (isEditingRef.current) {
                              handleSaveNoteTitle();
                            }
                          }, 200);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveNoteTitle();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setNoteTitleValue(selectedNote.title);
                            setEditingNoteTitle(false);
                          }
                        }}
                        className="text-2xl font-semibold text-gray-100 bg-transparent border-b-2 border-gray-600 focus:border-gray-400 focus:outline-none w-full"
                        autoFocus
                      />
                    ) : (
                      <h2 
                        className="text-2xl font-semibold text-gray-100 cursor-text hover:text-gray-200 transition-colors"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          isEditingRef.current = true;
                          setEditingNoteTitle(true);
                        }}
                        title="Click to edit title"
                      >
                        {selectedNote.title}
                      </h2>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      <span>
                        {new Date(selectedNote.updated_at).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {selectedNode.data.tags && selectedNode.data.tags.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4" />
                        <div className="flex gap-1 flex-wrap">
                          {selectedNode.data.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 bg-[#2c3440] text-gray-300 text-xs rounded border border-gray-600"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onNavigateToEditor(selectedNote.id)}
                    className="px-4 py-2.5 bg-[#6366F1] hover:bg-[#4F46E5] text-white rounded-lg transition-colors flex items-center gap-2 font-medium shadow-lg hover:shadow-xl"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit Note
                  </button>
                  <button
                    onClick={() => {
                      setShowPreview(false);
                      setSelectedNode(null);
                    }}
                    className="p-2.5 text-gray-400 hover:text-white hover:bg-[#3a4450] rounded-lg transition-colors"
                    title="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-hide px-8 py-6 bg-[#2c3440]">
              <div className="prose prose-invert prose-gray max-w-none">
                <WYSIWYGEditor content={selectedNote.content || '*No content yet.*'} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help Button */}
      <button
        onClick={() => setShowHelp(!showHelp)}
        className="fixed bottom-6 left-6 w-12 h-12 bg-[#6366F1] hover:bg-[#4F46E5] text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-40 group"
        title="Help & Navigation Guide"
      >
        <HelpCircle className="w-6 h-6" />
      </button>

      {/* Help Modal */}
      {showHelp && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowHelp(false)}
        >
          <div 
            className="bg-[#2c3440] rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#6366F1]/10 flex items-center justify-center border border-[#6366F1]/20">
                    <HelpCircle className="w-5 h-5 text-[#6366F1]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-200">Navigation Guide</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Keyboard shortcuts and interactions</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowHelp(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-300 hover:bg-gray-700/50 rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto scrollbar-hide px-6 py-6 bg-[#2c3440]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Nodes Section */}
                <div className="bg-[#3a4450]/40 rounded-lg p-5 border border-gray-700/40 hover:border-gray-600/60 transition-all">
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-700/40">
                    <div className="w-8 h-8 rounded-lg bg-[#6366F1]/15 flex items-center justify-center border border-[#6366F1]/20">
                      <FileText className="w-4 h-4 text-[#6366F1]" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-300">Nodes</h3>
                  </div>
                  <ul className="space-y-2.5">
                    <li className="flex items-start gap-2.5 group">
                      <div className="w-5 h-5 rounded-md bg-[#6366F1]/10 border border-[#6366F1]/20 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#6366F1]/15 transition-colors">
                        <span className="text-[#6366F1] text-[10px] font-bold">1</span>
                      </div>
                      <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors"><span className="text-gray-300 font-medium">Click</span> to select</span>
                    </li>
                    <li className="flex items-start gap-2.5 group">
                      <div className="w-5 h-5 rounded-md bg-[#6366F1]/10 border border-[#6366F1]/20 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#6366F1]/15 transition-colors">
                        <span className="text-[#6366F1] text-[10px] font-bold">2</span>
                      </div>
                      <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors"><span className="text-gray-300 font-medium">Cmd/Ctrl + Click</span> to multi-select</span>
                    </li>
                    <li className="flex items-start gap-2.5 group">
                      <div className="w-5 h-5 rounded-md bg-[#6366F1]/10 border border-[#6366F1]/20 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#6366F1]/15 transition-colors">
                        <span className="text-[#6366F1] text-[10px] font-bold">3</span>
                      </div>
                      <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors"><span className="text-gray-300 font-medium">Double-click</span> to preview</span>
                    </li>
                    <li className="flex items-start gap-2.5 group">
                      <div className="w-5 h-5 rounded-md bg-[#6366F1]/10 border border-[#6366F1]/20 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#6366F1]/15 transition-colors">
                        <span className="text-[#6366F1] text-[10px] font-bold">4</span>
                      </div>
                      <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors"><span className="text-gray-300 font-medium">Right-click</span> for options</span>
                    </li>
                    <li className="flex items-start gap-2.5 group">
                      <div className="w-5 h-5 rounded-md bg-[#6366F1]/10 border border-[#6366F1]/20 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#6366F1]/15 transition-colors">
                        <span className="text-[#6366F1] text-[10px] font-bold">5</span>
                      </div>
                      <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors"><span className="text-gray-300 font-medium">Delete/Backspace</span> to remove</span>
                    </li>
                    <li className="flex items-start gap-2.5 group">
                      <div className="w-5 h-5 rounded-md bg-[#6366F1]/10 border border-[#6366F1]/20 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#6366F1]/15 transition-colors">
                        <span className="text-[#6366F1] text-[10px] font-bold">6</span>
                      </div>
                      <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors"><span className="text-gray-300 font-medium">Drag</span> to reposition</span>
                    </li>
                  </ul>
                </div>

                {/* Edges Section */}
                <div className="bg-[#3a4450]/40 rounded-lg p-5 border border-gray-700/40 hover:border-gray-600/60 transition-all">
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-700/40">
                    <div className="w-8 h-8 rounded-lg bg-[#8B5CF6]/15 flex items-center justify-center border border-[#8B5CF6]/20">
                      <GitBranch className="w-4 h-4 text-[#8B5CF6]" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-300">Connections</h3>
                  </div>
                  <ul className="space-y-2.5">
                    <li className="flex items-start gap-2.5 group">
                      <div className="w-5 h-5 rounded-md bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#8B5CF6]/15 transition-colors">
                        <span className="text-[#8B5CF6] text-[10px] font-bold">1</span>
                      </div>
                      <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors"><span className="text-gray-300 font-medium">Drag</span> from handle to create</span>
                    </li>
                    <li className="flex items-start gap-2.5 group">
                      <div className="w-5 h-5 rounded-md bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#8B5CF6]/15 transition-colors">
                        <span className="text-[#8B5CF6] text-[10px] font-bold">2</span>
                      </div>
                      <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors"><span className="text-gray-300 font-medium">Click</span> to select</span>
                    </li>
                    <li className="flex items-start gap-2.5 group">
                      <div className="w-5 h-5 rounded-md bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#8B5CF6]/15 transition-colors">
                        <span className="text-[#8B5CF6] text-[10px] font-bold">3</span>
                      </div>
                      <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors"><span className="text-gray-300 font-medium">Cmd/Ctrl + Click</span> to multi-select</span>
                    </li>
                    <li className="flex items-start gap-2.5 group">
                      <div className="w-5 h-5 rounded-md bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#8B5CF6]/15 transition-colors">
                        <span className="text-[#8B5CF6] text-[10px] font-bold">4</span>
                      </div>
                      <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors"><span className="text-gray-300 font-medium">Right-click</span> for options</span>
                    </li>
                    <li className="flex items-start gap-2.5 group">
                      <div className="w-5 h-5 rounded-md bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#8B5CF6]/15 transition-colors">
                        <span className="text-[#8B5CF6] text-[10px] font-bold">5</span>
                      </div>
                      <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors"><span className="text-gray-300 font-medium">Delete/Backspace</span> to remove</span>
                    </li>
                  </ul>
                </div>

                {/* Sidebar Section */}
                <div className="bg-[#3a4450]/40 rounded-lg p-5 border border-gray-700/40 hover:border-gray-600/60 transition-all">
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-700/40">
                    <div className="w-8 h-8 rounded-lg bg-[#EC4899]/15 flex items-center justify-center border border-[#EC4899]/20">
                      <Palette className="w-4 h-4 text-[#EC4899]" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-300">Sidebar</h3>
                  </div>
                  <ul className="space-y-2.5">
                    <li className="flex items-start gap-2.5 group">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#EC4899] flex-shrink-0 mt-1.5"></div>
                      <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">Bulk change colors via multi-select</span>
                    </li>
                    <li className="flex items-start gap-2.5 group">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#EC4899] flex-shrink-0 mt-1.5"></div>
                      <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">Filter nodes using tags</span>
                    </li>
                    <li className="flex items-start gap-2.5 group">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#EC4899] flex-shrink-0 mt-1.5"></div>
                      <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">Set default node color</span>
                    </li>
                  </ul>
                </div>

                {/* Quick Actions */}
                <div className="bg-[#3a4450]/40 rounded-lg p-5 border border-gray-700/40 hover:border-gray-600/60 transition-all">
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-700/40">
                    <div className="w-8 h-8 rounded-lg bg-[#10B981]/15 flex items-center justify-center border border-[#10B981]/20">
                      <PlusCircle className="w-4 h-4 text-[#10B981]" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-300">Actions</h3>
                  </div>
                  <ul className="space-y-2.5">
                    <li className="flex items-start gap-2.5 group">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10B981] flex-shrink-0 mt-1.5"></div>
                      <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors"><span className="text-gray-300 font-medium">New Node</span> creates note & adds to flow</span>
                    </li>
                    <li className="flex items-start gap-2.5 group">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10B981] flex-shrink-0 mt-1.5"></div>
                      <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors"><span className="text-gray-300 font-medium">Search Notes</span> to add existing notes</span>
                    </li>
                    <li className="flex items-start gap-2.5 group">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10B981] flex-shrink-0 mt-1.5"></div>
                      <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">Click flow title to rename</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

