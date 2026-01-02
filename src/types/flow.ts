/**
 * Flow-related type definitions
 */

export interface FlowNode {
  id: string;
  noteId: string;
  position: { x: number; y: number };
  data: {
    label: string;
    color?: string;
    tags?: string[];
    completed?: boolean;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  color?: string;
}

export interface Flow {
  id: string;
  title: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  tags?: string[];
  // Optional category grouping. When undefined or empty, the flow is unfiled
  category?: string;
  created_at: string;
  updated_at: string;
}

