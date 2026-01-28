import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Network, Search, RefreshCw, ChevronDown, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
// @ts-ignore - vis-network types may not be perfect
import { Network as VisNetwork } from 'vis-network/standalone';
// @ts-ignore
import { DataSet } from 'vis-data/standalone';
import { getNotes } from '../lib/storage';

interface GraphViewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToNote: (noteId: string) => void;
}

interface GraphNode {
  id: string;
  label: string;
  type: 'note' | 'tag' | 'folder';
  size?: number;
  color?: string;
  folder?: string;
}

interface GraphLink {
  from: string;
  to: string;
  value?: number;
}

export default function GraphViewDialog({ isOpen, onClose, onNavigateToNote }: GraphViewDialogProps) {
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphLink[] }>({ nodes: [], edges: [] });
  const [filteredGraphData, setFilteredGraphData] = useState<{ nodes: GraphNode[]; edges: GraphLink[] }>({ nodes: [], edges: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const networkRef = useRef<VisNetwork | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<DataSet<any>>(new DataSet());
  const edgesRef = useRef<DataSet<any>>(new DataSet());

  // Filter states
  const [showTags, setShowTags] = useState(true);
  const [showFolders, setShowFolders] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [visibleFolders, setVisibleFolders] = useState<Set<string>>(new Set()); // Folders to show/hide
  const [expandedSections, setExpandedSections] = useState({
    filters: true,
    groups: true,
    display: true,
  });

  // Graph parameter states
  const [textFadeThreshold, setTextFadeThreshold] = useState(0.5);
  const [nodeRepulsion, setNodeRepulsion] = useState(-1000);
  const [springLength, setSpringLength] = useState(450);
  const [springConstant, setSpringConstant] = useState(0.010);
  const [nodeDistance, setNodeDistance] = useState(200); // Distance between note-folder
  const [avoidOverlap, setAvoidOverlap] = useState(5.0); // Overlap prevention - higher default to prevent random overlap
  const [edgeSmoothness, setEdgeSmoothness] = useState(0.5); // Edge curve control: 0 = straight, 3 = very curved
  const [nodeSize, setNodeSize] = useState({ folder: 20, note: 15, tag: 10 });

  // Color palette
  const colorPalette = [
    '#8B5CF6', // Purple
    '#10B981', // Green
    '#6366F1', // Indigo/Blue
    '#EF4444', // Red
    '#F59E0B', // Amber/Yellow
    '#EC4899', // Pink
    '#14B8A6', // Teal
    '#6B7280', // Grey
    '#F97316', // Orange
    '#06B6D4', // Cyan
  ];

  // Get color for a node based on folder or label
  const getNodeColor = (label: string, type: 'note' | 'tag' | 'folder', folder?: string): string => {
    const hashSource = folder && type === 'note' ? folder : label;
    let hash = 0;
    for (let i = 0; i < hashSource.length; i++) {
      hash = hashSource.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colorPalette.length;
    return colorPalette[index];
  };

  // Extract tags from text
  const extractTags = (text: string): string[] => {
    const tagRegex = /#(\w+)/g;
    const matches = text.match(tagRegex);
    return matches ? matches.map(match => match.substring(1)) : [];
  };

  // Handle window resize
  useEffect(() => {
    if (!isOpen) return;

    const updateDimensions = () => {
      if (containerRef.current && networkRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        networkRef.current.setSize(`${rect.width}px`, `${rect.height}px`);
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [isOpen]);

  // Build graph data from notes
  useEffect(() => {
    if (!isOpen) return;

    const notes = getNotes();
    const nodes: GraphNode[] = [];
    const edges: GraphLink[] = [];
    const nodeMap = new Map<string, GraphNode>();

    // Collect all folders
    const folderSet = new Set<string>();
    notes.forEach((note) => {
      if (note.folder && note.folder.trim()) {
        folderSet.add(note.folder.trim());
      }
    });

    // Add folder nodes
    folderSet.forEach((folder) => {
      const nodeId = `folder-${folder}`;
      const node: GraphNode = {
        id: nodeId,
        label: folder,
        type: 'folder',
        color: getNodeColor(folder, 'folder', folder),
      };
      nodes.push(node);
      nodeMap.set(nodeId, node);
    });

    // Add note nodes
    notes.forEach((note) => {
      const nodeId = `note-${note.id}`;
      const label = note.title || 'Untitled';
      const folder = note.folder?.trim();
      const node: GraphNode = {
        id: nodeId,
        label: label,
        type: 'note',
        color: getNodeColor(label, 'note', folder),
        folder: folder,
      };
      nodes.push(node);
      nodeMap.set(nodeId, node);
    });

    // Extract all unique tags
    const tagSet = new Set<string>();
    notes.forEach((note) => {
      const tags = extractTags(note.title + ' ' + note.content);
      tags.forEach((tag) => tagSet.add(tag));
    });

    // Add tag nodes
    tagSet.forEach((tag) => {
      const nodeId = `tag-${tag}`;
      const label = `#${tag}`;
      const node: GraphNode = {
        id: nodeId,
        label: label,
        type: 'tag',
        color: getNodeColor(tag, 'tag'),
      };
      nodes.push(node);
      nodeMap.set(nodeId, node);
    });

    // Create links
    notes.forEach((note) => {
      const noteNodeId = `note-${note.id}`;
      const tags = extractTags(note.title + ' ' + note.content);
      const folder = note.folder?.trim();

      // Link note to folder
      if (folder) {
        const folderNodeId = `folder-${folder}`;
        edges.push({
          from: noteNodeId,
          to: folderNodeId,
        });
      }

      // Link notes to tags
      tags.forEach((tag) => {
        const tagNodeId = `tag-${tag}`;
        edges.push({
          from: noteNodeId,
          to: tagNodeId,
        });
      });
    });

    setGraphData({ nodes, edges });
  }, [isOpen]);

  // Filter graph data based on filters
  useEffect(() => {
    let filteredNodes = [...graphData.nodes];
    let filteredEdges = [...graphData.edges];

    // Filter by node type visibility
    if (!showTags) {
      filteredNodes = filteredNodes.filter(n => n.type !== 'tag');
      filteredEdges = filteredEdges.filter(edge => {
        const sourceNode = filteredNodes.find(n => n.id === edge.from);
        const targetNode = filteredNodes.find(n => n.id === edge.to);
        return sourceNode && targetNode;
      });
    }

    if (!showFolders) {
      filteredNodes = filteredNodes.filter(n => n.type !== 'folder');
      filteredEdges = filteredEdges.filter(edge => {
        const sourceNode = filteredNodes.find(n => n.id === edge.from);
        const targetNode = filteredNodes.find(n => n.id === edge.to);
        return sourceNode && targetNode;
      });
    }

    // Filter by visible folders (toggle groups)
    if (visibleFolders.size > 0) {
      // Hide folders that are not in visibleFolders
      filteredNodes = filteredNodes.filter(n => {
        if (n.type === 'folder') {
          return visibleFolders.has(n.label);
        }
        return true;
      });

      // Also hide notes/tags connected to hidden folders
      const visibleFolderIds = new Set(
        filteredNodes
          .filter(n => n.type === 'folder')
          .map(n => n.id)
      );

      const connectedNodeIds = new Set(visibleFolderIds);
      filteredEdges.forEach(edge => {
        if (visibleFolderIds.has(edge.from)) connectedNodeIds.add(edge.to);
        if (visibleFolderIds.has(edge.to)) connectedNodeIds.add(edge.from);
      });

      filteredNodes = filteredNodes.filter(n => connectedNodeIds.has(n.id));
      filteredEdges = filteredEdges.filter(edge =>
        connectedNodeIds.has(edge.from) && connectedNodeIds.has(edge.to)
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchingNodeIds = new Set(
        filteredNodes
          .filter(n => n.label.toLowerCase().includes(query))
          .map(n => n.id)
      );

      const connectedNodeIds = new Set(matchingNodeIds);
      filteredEdges.forEach(edge => {
        if (matchingNodeIds.has(edge.from)) connectedNodeIds.add(edge.to);
        if (matchingNodeIds.has(edge.to)) connectedNodeIds.add(edge.from);
      });

      filteredNodes = filteredNodes.filter(n => connectedNodeIds.has(n.id));
      filteredEdges = filteredEdges.filter(edge =>
        connectedNodeIds.has(edge.from) && connectedNodeIds.has(edge.to)
      );
    }

    // Filter by selected folders (for filtering, not toggling)
    if (selectedFolders.size > 0) {
      const folderNodeIds = new Set(
        filteredNodes
          .filter(n => n.type === 'folder' && selectedFolders.has(n.label))
          .map(n => n.id)
      );

      if (folderNodeIds.size > 0) {
        const connectedNodeIds = new Set(folderNodeIds);
        filteredEdges.forEach(edge => {
          if (folderNodeIds.has(edge.from)) connectedNodeIds.add(edge.to);
          if (folderNodeIds.has(edge.to)) connectedNodeIds.add(edge.from);
        });

        filteredNodes = filteredNodes.filter(n => connectedNodeIds.has(n.id));
        filteredEdges = filteredEdges.filter(edge =>
          connectedNodeIds.has(edge.from) && connectedNodeIds.has(edge.to)
        );
      }
    }

    setFilteredGraphData({ nodes: filteredNodes, edges: filteredEdges });
  }, [graphData, showTags, showFolders, searchQuery, selectedFolders, visibleFolders]);

  // Memoize vis nodes and edges
  const { visNodes, visEdges } = useMemo(() => {
    if (filteredGraphData.nodes.length === 0) {
      return { visNodes: [], visEdges: [] };
    }

    // Update datasets
    const nodes = filteredGraphData.nodes.map(node => {
      // Use border colors as main node colors with gradients
      const folderColor = '#14B8A6'; // Teal
      const folderColorLight = '#2DD4BF'; // Lighter teal
      const tagColor = '#F59E0B'; // Amber
      const tagColorLight = '#FBBF24'; // Lighter amber
      const noteColor = '#6366F1'; // Indigo/Purple
      const noteColorLight = '#818CF8'; // Lighter indigo

      const nodeColor = node.type === 'folder' ? folderColor : node.type === 'tag' ? tagColor : noteColor;
      const nodeColorLight = node.type === 'folder' ? folderColorLight : node.type === 'tag' ? tagColorLight : noteColorLight;
      const borderColor = node.type === 'folder' ? '#14B8A6' : node.type === 'tag' ? '#F59E0B' : '#6366F1';
      const shadowColor = node.type === 'folder' ? 'rgba(20, 184, 166, 0.4)' : node.type === 'tag' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(99, 102, 241, 0.4)';

      // Use different shapes for different node types
      const nodeShape = node.type === 'folder' ? 'box' : node.type === 'tag' ? 'diamond' : 'dot';

      return {
        id: node.id,
        label: node.label || node.id, // Ensure label is always set
        title: `${node.label}\n${node.type}`,
        color: {
          background: nodeColor,
          border: borderColor,
          highlight: {
            background: nodeColorLight,
            border: borderColor,
          },
          hover: {
            background: nodeColorLight,
            border: borderColor,
          },
        },
        font: {
          color: node.type === 'folder' ? '#ffffff' : node.type === 'tag' ? '#F59E0B' : '#ffffff', // White for folders (teal bg), Amber for tags, White for notes
          size: 15,
          face: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          bold: {
            color: node.type === 'folder' ? '#ffffff' : node.type === 'tag' ? '#F59E0B' : '#ffffff',
          },
        },
        size: node.type === 'folder' ? nodeSize.folder : node.type === 'tag' ? nodeSize.tag : nodeSize.note,
        shape: nodeShape,
        borderWidth: 3,
        borderWidthSelected: 5,
        shadow: {
          enabled: true,
          color: shadowColor,
          size: 8,
          x: 2,
          y: 2,
        },
        labelHighlightBold: true,
        mass: node.type === 'folder' ? 2 : node.type === 'tag' ? 1.5 : 1, // Heavier nodes for better physics
      };
    });

    const edges = filteredGraphData.edges.map(edge => {
      const sourceNode = filteredGraphData.nodes.find(n => n.id === edge.from);
      const targetNode = filteredGraphData.nodes.find(n => n.id === edge.to);

      // Determine edge length based on node types
      let length = 200;
      if (sourceNode && targetNode) {
        if ((sourceNode.type === 'note' && targetNode.type === 'folder') ||
          (sourceNode.type === 'folder' && targetNode.type === 'note')) {
          length = nodeDistance; // Use controlled distance for note-folder
        } else if ((sourceNode.type === 'note' && targetNode.type === 'tag') ||
          (sourceNode.type === 'tag' && targetNode.type === 'note')) {
          length = nodeDistance * 0.4; // Moderate distance for note-tag (40% of note-folder distance)
        }
      }

      // Determine edge color based on connected nodes
      let edgeColor = 'rgba(200, 200, 200, 0.4)';
      if (sourceNode && targetNode) {
        if (sourceNode.type === 'folder' || targetNode.type === 'folder') {
          edgeColor = 'rgba(20, 184, 166, 0.5)'; // Teal for folder connections
        } else if (sourceNode.type === 'tag' || targetNode.type === 'tag') {
          edgeColor = 'rgba(245, 158, 11, 0.5)'; // Amber for tag connections
        } else {
          edgeColor = 'rgba(99, 102, 241, 0.5)'; // Indigo for note-to-note
        }
      }

      return {
        from: edge.from,
        to: edge.to,
        length: length,
        width: 2.5,
        color: {
          color: edgeColor,
          highlight: edgeColor.replace('0.5', '0.9').replace('0.4', '0.9'),
          hover: edgeColor.replace('0.5', '0.7').replace('0.4', '0.7'),
        },
        smooth: edgeSmoothness > 0 ? {
          enabled: true,
          type: 'continuous',
          roundness: edgeSmoothness,
        } : false,
        shadow: {
          enabled: true,
          color: 'rgba(0, 0, 0, 0.4)',
          size: 4,
          x: 1,
          y: 1,
        },
      };
    });

    return { visNodes: nodes, visEdges: edges };
  }, [filteredGraphData, nodeSize, nodeDistance, edgeSmoothness]);

  // Memoize network options
  const networkOptions = useMemo(() => ({
    physics: {
      enabled: true,
      stabilization: {
        enabled: true,
        iterations: 200,
        fit: true,
      },
      barnesHut: {
        gravitationalConstant: nodeRepulsion, // Very strong repulsion
        centralGravity: 0.05,
        springLength: springLength,
        springConstant: springConstant, // Very weak spring to allow large distances
        damping: 0.1,
        avoidOverlap: avoidOverlap, // Strong overlap prevention
      },
    },
    interaction: {
      hover: true,
      tooltipDelay: 200,
      zoomView: true,
      dragView: true,
      hoverConnectedEdges: true,
      zoomSpeed: 1.2, // Smoother zoom speed
      dragNodes: true, // Allow dragging individual nodes
      selectConnectedEdges: true,
    },
    layout: {
      improvedLayout: true,
    },
    nodes: {
      borderWidth: 3,
      borderWidthSelected: 5,
      font: {
        size: 15,
        color: '#ffffff',
      },
      labelHighlightBold: true,
      shadow: {
        enabled: true,
        color: 'rgba(0, 0, 0, 0.6)',
        size: 8,
        x: 2,
        y: 2,
      },
      scaling: {
        min: 10,
        max: 50,
        label: {
          enabled: true,
          min: 12,
          max: 20,
          drawThreshold: 5,
        },
      },
    },
    edges: {
      width: 2.5,
      smooth: edgeSmoothness > 0 ? {
        enabled: true,
        type: 'continuous',
        roundness: edgeSmoothness,
      } : false,
      shadow: {
        enabled: true,
        color: 'rgba(0, 0, 0, 0.4)',
        size: 4,
        x: 1,
        y: 1,
      },
    },
  }
  ), [nodeRepulsion, springLength, springConstant, avoidOverlap, edgeSmoothness]);

  // Initialize vis-network
  useEffect(() => {
    if (!isOpen || !containerRef.current || visNodes.length === 0) return;

    nodesRef.current.clear();
    edgesRef.current.clear();
    nodesRef.current.add(visNodes);
    edgesRef.current.add(visEdges);

    const data = {
      nodes: nodesRef.current,
      edges: edgesRef.current,
    };

    // Check if we need to recreate the network (when physics params change significantly)
    const needsRecreate = networkRef.current && (
      nodeRepulsion !== (networkRef.current as any).__lastRepulsion ||
      springLength !== (networkRef.current as any).__lastSpringLength ||
      springConstant !== (networkRef.current as any).__lastSpringConstant ||
      avoidOverlap !== (networkRef.current as any).__lastAvoidOverlap
    );

    if (!networkRef.current || needsRecreate) {
      // Destroy existing network if it exists
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }

      networkRef.current = new VisNetwork(containerRef.current, data, networkOptions);

      // Store current parameter values
      (networkRef.current as any).__lastRepulsion = nodeRepulsion;
      (networkRef.current as any).__lastSpringLength = springLength;
      (networkRef.current as any).__lastSpringConstant = springConstant;
      (networkRef.current as any).__lastAvoidOverlap = avoidOverlap;

      networkRef.current.on('click', (params: any) => {
        if (params.nodes.length > 0) {
          const nodeId = params.nodes[0];
          const node = filteredGraphData.nodes.find(n => n.id === nodeId);
          if (node) {
            setSelectedNode(node);
            if (node.type === 'note') {
              const noteId = node.id.replace('note-', '');
              onNavigateToNote(noteId);
              onClose();
            }
          }
        } else {
          setSelectedNode(null);
        }
      });

      networkRef.current.on('stabilizationEnd' as any, () => {
        networkRef.current?.fit({
          animation: {
            duration: 400,
            easingFunction: 'easeInOutQuad',
          },
        });
      });
    } else {
      // Update existing network with new data (node sizes, edge lengths)
      networkRef.current.setData(data);
      // Update all options including physics
      networkRef.current.setOptions(networkOptions);
      // Force physics restart by temporarily disabling and re-enabling
      if (networkRef.current) {
        const physicsEnabled = networkOptions.physics?.enabled;
        if (physicsEnabled) {
          (networkRef.current as any).setOptions({ physics: { enabled: false } });
          setTimeout(() => {
            if (networkRef.current) {
              (networkRef.current as any).setOptions({ physics: networkOptions.physics });
            }
          }, 50);
        }
      }
    }

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, [isOpen, visNodes, visEdges, networkOptions, filteredGraphData.nodes, onNavigateToNote, onClose, nodeRepulsion, springLength, springConstant, avoidOverlap]);

  // Get all folders for groups
  const allFolders = Array.from(new Set(
    graphData.nodes
      .filter(n => n.type === 'folder')
      .map(n => n.label)
  )).sort();

  const toggleSection = (section: 'filters' | 'groups' | 'display') => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };


  const toggleFolderVisibility = (folder: string) => {
    setVisibleFolders(prev => {
      const next = new Set(prev);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }
      return next;
    });
  };

  const handleRefresh = () => {
    setSearchQuery('');
    setSelectedFolders(new Set());
    setVisibleFolders(new Set());
    setShowTags(true);
    setShowFolders(true);
    // Reset graph parameters to defaults
    setTextFadeThreshold(0.5);
    setNodeRepulsion(-1000);
    setSpringLength(450);
    setSpringConstant(0.010);
    setNodeDistance(200);
    setAvoidOverlap(5.0);
    setEdgeSmoothness(0.5);
    setNodeSize({ folder: 20, note: 15, tag: 10 });
    if (networkRef.current) {
      networkRef.current.fit({
        animation: {
          duration: 400,
          easingFunction: 'easeInOutQuad',
        },
      });
    }
  };

  // Zoom controls
  const handleZoomIn = () => {
    if (networkRef.current) {
      const scale = networkRef.current.getScale();
      networkRef.current.moveTo({
        scale: Math.min(scale * 1.2, 2), // Max zoom 2x
        animation: {
          duration: 300,
          easingFunction: 'easeInOutQuad',
        },
      });
    }
  };

  const handleZoomOut = () => {
    if (networkRef.current) {
      const scale = networkRef.current.getScale();
      networkRef.current.moveTo({
        scale: Math.max(scale / 1.2, 0.1), // Min zoom 0.1x
        animation: {
          duration: 300,
          easingFunction: 'easeInOutQuad',
        },
      });
    }
  };

  const handleResetView = () => {
    if (networkRef.current) {
      networkRef.current.fit({
        animation: {
          duration: 400,
          easingFunction: 'easeInOutQuad',
        },
      });
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        /* Custom tooltip styling for vis-network */
        .vis-tooltip {
          background: rgba(15, 23, 42, 0.98) !important;
          border: 1px solid rgba(139, 92, 246, 0.5) !important;
          border-radius: 8px !important;
          padding: 10px 12px !important;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(139, 92, 246, 0.2) !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          font-size: 13px !important;
          color: #ffffff !important;
          max-width: 300px !important;
          pointer-events: none !important;
          z-index: 10000 !important;
          backdrop-filter: blur(8px) !important;
        }
        
        .vis-tooltip strong {
          color: #ffffff !important;
          font-weight: 600 !important;
        }
        
        .vis-tooltip span {
          color: rgba(200, 200, 200, 0.8) !important;
          font-size: 11px !important;
        }
        
        /* Improve node selection styling */
        .vis-network canvas {
          cursor: grab !important;
        }
        
        .vis-network canvas:active {
          cursor: grabbing !important;
        }
        
        /* Better hover effects */
        .vis-network .vis-node {
          transition: all 0.2s ease !important;
        }
        
        /* Enhanced node styling with glow effects */
        .vis-network .vis-node.vis-selected {
          filter: drop-shadow(0 0 8px rgba(139, 92, 246, 0.6)) !important;
        }
        
        /* Custom node rendering for better visual appeal */
        .vis-network canvas {
          image-rendering: -webkit-optimize-contrast;
          image-rendering: crisp-edges;
        }
      `}</style>
      <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-theme-bg-primary rounded-xl shadow-2xl w-full max-w-[95vw] h-[90vh] border border-theme-border overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-6 py-5 border-b border-theme-border flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <Network className="w-6 h-6 text-[#e8935f]" />
              <h2 className="text-2xl font-light text-theme-text-primary">Graph View</h2>
            </div>
            <button
              onClick={onClose}
              className="text-theme-text-secondary hover:text-white hover:bg-theme-bg-secondary rounded-lg p-1.5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex overflow-hidden relative">
            {/* Zoom Controls - Outside graph container to ensure visibility */}
            {filteredGraphData.nodes.length > 0 && (
              <div
                className="absolute top-4 left-4 z-[9999] flex flex-col gap-2 bg-theme-bg-secondary border border-theme-border rounded-lg p-1.5 shadow-2xl"
              >
                <button
                  onClick={handleZoomIn}
                  className="bg-theme-bg-primary hover:bg-theme-bg-tertiary rounded-lg p-2.5 text-theme-text-primary hover:text-white transition-colors flex items-center justify-center min-w-[40px] min-h-[40px]"
                  title="Zoom In"
                  type="button"
                >
                  <ZoomIn className="w-5 h-5" />
                </button>
                <button
                  onClick={handleZoomOut}
                  className="bg-theme-bg-primary hover:bg-theme-bg-tertiary rounded-lg p-2.5 text-theme-text-primary hover:text-white transition-colors flex items-center justify-center min-w-[40px] min-h-[40px]"
                  title="Zoom Out"
                  type="button"
                >
                  <ZoomOut className="w-5 h-5" />
                </button>
                <div className="h-px bg-theme-border my-0.5"></div>
                <button
                  onClick={handleResetView}
                  className="bg-theme-bg-primary hover:bg-theme-bg-tertiary rounded-lg p-2.5 text-theme-text-primary hover:text-white transition-colors flex items-center justify-center min-w-[40px] min-h-[40px]"
                  title="Reset View"
                  type="button"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Graph Container */}
            <div
              ref={containerRef}
              className="flex-1 relative overflow-hidden bg-theme-bg-primary"
              id="graph-container"
            >
              {filteredGraphData.nodes.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Network className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                    <p className="text-theme-text-secondary">No notes or tags to display</p>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="w-80 bg-theme-bg-secondary border-l border-theme-border flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Filters Section */}
                <div>
                  <div
                    onClick={() => toggleSection('filters')}
                    className="w-full flex items-center justify-between py-2 text-theme-text-primary hover:text-white transition-colors cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        toggleSection('filters');
                      }
                    }}
                  >
                    <span className="font-medium">Filters</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRefresh();
                        }}
                        className="p-1 hover:bg-theme-bg-primary rounded transition-colors"
                        title="Reset filters"
                      >
                        <RefreshCw className="w-4 h-4 text-theme-text-secondary hover:text-white" />
                      </button>
                      {expandedSections.filters ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                  {expandedSections.filters && (
                    <div className="mt-3 space-y-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                          type="text"
                          placeholder="Search files..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-theme-bg-primary border border-theme-border rounded-lg pl-9 pr-3 py-2 text-sm text-theme-text-primary placeholder-gray-500 focus:outline-none focus:border-[#e8935f]/50"
                        />
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="flex items-center justify-between cursor-pointer" onClick={() => setShowTags(!showTags)}>
                            <span className="text-sm text-theme-text-secondary">Tags</span>
                            <div className={`relative w-10 h-5 rounded-full transition-colors ${showTags ? 'bg-[#8B5CF6]' : 'bg-gray-600'}`}>
                              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${showTags ? 'translate-x-5' : ''}`}></div>
                            </div>
                          </label>
                          <p className="text-xs text-theme-text-tertiary mt-1">Show or hide tag nodes in the graph</p>
                        </div>
                        <div>
                          <label className="flex items-center justify-between cursor-pointer" onClick={() => setShowFolders(!showFolders)}>
                            <span className="text-sm text-theme-text-secondary">Folders</span>
                            <div className={`relative w-10 h-5 rounded-full transition-colors ${showFolders ? 'bg-[#8B5CF6]' : 'bg-gray-600'}`}>
                              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${showFolders ? 'translate-x-5' : ''}`}></div>
                            </div>
                          </label>
                          <p className="text-xs text-theme-text-tertiary mt-1">Show or hide folder nodes in the graph</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Groups Section */}
                <div>
                  <button
                    onClick={() => toggleSection('groups')}
                    className="w-full flex items-center justify-between py-2 text-theme-text-primary hover:text-white transition-colors"
                  >
                    <span className="font-medium">Groups</span>
                    {expandedSections.groups ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                  {expandedSections.groups && (
                    <div className="mt-3 space-y-2">
                      {allFolders.map((folder) => {
                        const folderNode = graphData.nodes.find(n => n.type === 'folder' && n.label === folder);
                        // If visibleFolders is empty, all are visible. Otherwise, check if folder is in the set
                        const isVisible = visibleFolders.size === 0 || visibleFolders.has(folder);
                        return (
                          <div
                            key={folder}
                            className="flex items-center justify-between p-2 rounded-lg transition-colors hover:bg-theme-bg-primary"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer" onClick={() => toggleFolderVisibility(folder)}>
                              <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: folderNode?.color || '#6366F1' }}
                              ></div>
                              <span className="text-sm text-theme-text-secondary truncate">path:{folder}</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFolderVisibility(folder);
                              }}
                              className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${isVisible ? 'bg-[#8B5CF6]' : 'bg-gray-600'}`}
                              title={isVisible ? 'Hide folder' : 'Show folder'}
                            >
                              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${isVisible ? 'translate-x-5' : ''}`}></div>
                            </button>
                          </div>
                        );
                      })}
                      {allFolders.length === 0 && (
                        <p className="text-xs text-theme-text-tertiary">No folders available</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Display Section */}
                <div>
                  <button
                    onClick={() => toggleSection('display')}
                    className="w-full flex items-center justify-between py-2 text-theme-text-primary hover:text-white transition-colors"
                  >
                    <span className="font-medium">Display</span>
                    {expandedSections.display ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                  {expandedSections.display && (
                    <div className="mt-3 space-y-4">
                      <div>
                        <label className="text-xs text-theme-text-secondary mb-1 block">Text fade threshold</label>
                        <p className="text-xs text-theme-text-tertiary mb-2">Controls when labels fade based on zoom level</p>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={textFadeThreshold}
                          onChange={(e) => setTextFadeThreshold(parseFloat(e.target.value))}
                          className="w-full h-2 bg-theme-bg-primary rounded-lg appearance-none cursor-pointer slider"
                          style={{
                            background: `linear-gradient(to right, #8B5CF6 0%, #8B5CF6 ${textFadeThreshold * 100}%, var(--color-bg-secondary) ${textFadeThreshold * 100}%, var(--color-bg-secondary) 100%)`
                          }}
                        />
                        <div className="flex justify-between text-xs text-theme-text-tertiary mt-1">
                          <span>0</span>
                          <span className="text-theme-text-secondary">{textFadeThreshold.toFixed(1)}</span>
                          <span>1</span>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-theme-text-secondary mb-1 block">Node Repulsion</label>
                        <p className="text-xs text-theme-text-tertiary mb-2">Controls how strongly nodes push away from each other</p>
                        <input
                          type="range"
                          min="-20000"
                          max="-1000"
                          step="500"
                          value={nodeRepulsion}
                          onChange={(e) => setNodeRepulsion(parseInt(e.target.value))}
                          className="w-full h-2 bg-theme-bg-primary rounded-lg appearance-none cursor-pointer slider"
                          style={{
                            background: `linear-gradient(to right, #8B5CF6 0%, #8B5CF6 ${((nodeRepulsion - (-20000)) / (-1000 - (-20000))) * 100}%, var(--color-bg-secondary) ${((nodeRepulsion - (-20000)) / (-1000 - (-20000))) * 100}%, var(--color-bg-secondary) 100%)`
                          }}
                        />
                        <div className="flex justify-between text-xs text-theme-text-tertiary mt-1">
                          <span>-20000</span>
                          <span className="text-theme-text-secondary">{nodeRepulsion}</span>
                          <span>-1000</span>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-theme-text-secondary mb-1 block">Spring Length</label>
                        <p className="text-xs text-theme-text-tertiary mb-2">Base distance between connected nodes</p>
                        <input
                          type="range"
                          min="50"
                          max="1000"
                          step="50"
                          value={springLength}
                          onChange={(e) => setSpringLength(parseInt(e.target.value))}
                          className="w-full h-2 bg-theme-bg-primary rounded-lg appearance-none cursor-pointer slider"
                          style={{
                            background: `linear-gradient(to right, #8B5CF6 0%, #8B5CF6 ${((springLength - 50) / (1000 - 50)) * 100}%, var(--color-bg-secondary) ${((springLength - 50) / (1000 - 50)) * 100}%, var(--color-bg-secondary) 100%)`
                          }}
                        />
                        <div className="flex justify-between text-xs text-theme-text-tertiary mt-1">
                          <span>50</span>
                          <span className="text-theme-text-secondary">{springLength}</span>
                          <span>1000</span>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-theme-text-secondary mb-1 block">Spring Constant</label>
                        <p className="text-xs text-theme-text-tertiary mb-2">Strength of connections between nodes</p>
                        <input
                          type="range"
                          min="0.001"
                          max="0.1"
                          step="0.001"
                          value={springConstant}
                          onChange={(e) => setSpringConstant(parseFloat(e.target.value))}
                          className="w-full h-2 bg-theme-bg-primary rounded-lg appearance-none cursor-pointer slider"
                          style={{
                            background: `linear-gradient(to right, #8B5CF6 0%, #8B5CF6 ${((springConstant - 0.001) / (0.1 - 0.001)) * 100}%, var(--color-bg-secondary) ${((springConstant - 0.001) / (0.1 - 0.001)) * 100}%, var(--color-bg-secondary) 100%)`
                          }}
                        />
                        <div className="flex justify-between text-xs text-theme-text-tertiary mt-1">
                          <span>0.001</span>
                          <span>{springConstant.toFixed(3)}</span>
                          <span>0.1</span>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-theme-text-secondary mb-1 block">Node Distance</label>
                        <p className="text-xs text-theme-text-tertiary mb-2">Distance between notes and their folders</p>
                        <input
                          type="range"
                          min="200"
                          max="2000"
                          step="50"
                          value={nodeDistance}
                          onChange={(e) => setNodeDistance(parseInt(e.target.value))}
                          className="w-full h-2 bg-theme-bg-primary rounded-lg appearance-none cursor-pointer slider"
                          style={{
                            background: `linear-gradient(to right, #8B5CF6 0%, #8B5CF6 ${((nodeDistance - 200) / (2000 - 200)) * 100}%, var(--color-bg-secondary) ${((nodeDistance - 200) / (2000 - 200)) * 100}%, var(--color-bg-secondary) 100%)`
                          }}
                        />
                        <div className="flex justify-between text-xs text-theme-text-tertiary mt-1">
                          <span>200</span>
                          <span>{nodeDistance}</span>
                          <span>2000</span>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-theme-text-secondary mb-1 block">Avoid Overlap</label>
                        <p className="text-xs text-theme-text-tertiary mb-2">Prevents nodes from overlapping each other</p>
                        <input
                          type="range"
                          min="0.5"
                          max="5"
                          step="0.1"
                          value={avoidOverlap}
                          onChange={(e) => setAvoidOverlap(parseFloat(e.target.value))}
                          className="w-full h-2 bg-theme-bg-primary rounded-lg appearance-none cursor-pointer slider"
                          style={{
                            background: `linear-gradient(to right, #8B5CF6 0%, #8B5CF6 ${((avoidOverlap - 0.5) / (5 - 0.5)) * 100}%, var(--color-bg-secondary) ${((avoidOverlap - 0.5) / (5 - 0.5)) * 100}%, var(--color-bg-secondary) 100%)`
                          }}
                        />
                        <div className="flex justify-between text-xs text-theme-text-tertiary mt-1">
                          <span>0.5</span>
                          <span>{avoidOverlap.toFixed(1)}</span>
                          <span>5.0</span>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-theme-text-secondary mb-1 block">Edge Curve</label>
                        <p className="text-xs text-theme-text-tertiary mb-2">Controls the curvature of connection lines</p>
                        <input
                          type="range"
                          min="0"
                          max="3"
                          step="0.1"
                          value={edgeSmoothness}
                          onChange={(e) => setEdgeSmoothness(parseFloat(e.target.value))}
                          className="w-full h-2 bg-theme-bg-primary rounded-lg appearance-none cursor-pointer slider"
                          style={{
                            background: `linear-gradient(to right, #8B5CF6 0%, #8B5CF6 ${(edgeSmoothness / 3) * 100}%, var(--color-bg-secondary) ${(edgeSmoothness / 3) * 100}%, var(--color-bg-secondary) 100%)`
                          }}
                        />
                        <div className="flex justify-between text-xs text-theme-text-tertiary mt-1">
                          <span>Straight</span>
                          <span>{edgeSmoothness.toFixed(1)}</span>
                          <span>Very Curved</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs text-theme-text-secondary block">Node Sizes</label>
                        <p className="text-xs text-theme-text-tertiary mb-2">Adjust the size of different node types</p>
                        <div className="space-y-2">
                          <div>
                            <label className="text-xs text-theme-text-tertiary mb-1 block">Folder: {nodeSize.folder}</label>
                            <input
                              type="range"
                              min="10"
                              max="50"
                              step="1"
                              value={nodeSize.folder}
                              onChange={(e) => setNodeSize(prev => ({ ...prev, folder: parseInt(e.target.value) }))}
                              className="w-full h-2 bg-theme-bg-primary rounded-lg appearance-none cursor-pointer slider"
                              style={{
                                background: `linear-gradient(to right, #8B5CF6 0%, #8B5CF6 ${((nodeSize.folder - 10) / (50 - 10)) * 100}%, var(--color-bg-secondary) ${((nodeSize.folder - 10) / (50 - 10)) * 100}%, var(--color-bg-secondary) 100%)`
                              }}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-theme-text-tertiary mb-1 block">Note: {nodeSize.note}</label>
                            <input
                              type="range"
                              min="5"
                              max="40"
                              step="1"
                              value={nodeSize.note}
                              onChange={(e) => setNodeSize(prev => ({ ...prev, note: parseInt(e.target.value) }))}
                              className="w-full h-2 bg-theme-bg-primary rounded-lg appearance-none cursor-pointer slider"
                              style={{
                                background: `linear-gradient(to right, #8B5CF6 0%, #8B5CF6 ${((nodeSize.note - 5) / (40 - 5)) * 100}%, var(--color-bg-secondary) ${((nodeSize.note - 5) / (40 - 5)) * 100}%, var(--color-bg-secondary) 100%)`
                              }}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-theme-text-tertiary mb-1 block">Tag: {nodeSize.tag}</label>
                            <input
                              type="range"
                              min="5"
                              max="30"
                              step="1"
                              value={nodeSize.tag}
                              onChange={(e) => setNodeSize(prev => ({ ...prev, tag: parseInt(e.target.value) }))}
                              className="w-full h-2 bg-theme-bg-primary rounded-lg appearance-none cursor-pointer slider"
                              style={{
                                background: `linear-gradient(to right, #8B5CF6 0%, #8B5CF6 ${((nodeSize.tag - 5) / (30 - 5)) * 100}%, var(--color-bg-secondary) ${((nodeSize.tag - 5) / (30 - 5)) * 100}%, var(--color-bg-secondary) 100%)`
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Node Info */}
              {selectedNode && (
                <div className="border-t border-theme-border p-4">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: selectedNode.color }}
                    ></div>
                    <span className="text-sm text-theme-text-primary truncate">
                      {selectedNode.label}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
