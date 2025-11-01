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
  created_at: string;
  updated_at: string;
}

const STORAGE_KEY = 'pinn.flows';

function readAll(): Flow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Flow[];
    return [];
  } catch {
    return [];
  }
}

export function writeAll(flows: Flow[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(flows));
}

export function getFlows(): Flow[] {
  return readAll();
}

export function getFlowById(id: string): Flow | null {
  return readAll().find((f) => f.id === id) || null;
}

export function saveFlow(flow: Flow): Flow {
  const all = readAll();
  const index = all.findIndex((f) => f.id === flow.id);
  const next: Flow = { ...flow, updated_at: new Date().toISOString() };
  if (index >= 0) {
    all[index] = next;
  } else {
    all.unshift(next);
  }
  writeAll(all);
  return next;
}

export function createFlow(title: string): Flow {
  const now = new Date().toISOString();
  const flow: Flow = {
    id: crypto.randomUUID(),
    title: title || 'Untitled Flow',
    nodes: [],
    edges: [],
    tags: [],
    created_at: now,
    updated_at: now,
  };
  const all = readAll();
  all.unshift(flow);
  writeAll(all);
  return flow;
}

export function deleteFlow(id: string) {
  const all = readAll().filter((f) => f.id !== id);
  writeAll(all);
}

export function addNoteToFlow(flowId: string, noteId: string, noteTitle: string, position?: { x: number; y: number }) {
  const flow = getFlowById(flowId);
  if (!flow) return null;

  // Check if note already exists in flow
  const existingNode = flow.nodes.find((n) => n.noteId === noteId);
  if (existingNode) return flow;

  const newNode: FlowNode = {
    id: `node-${noteId}-${Date.now()}`,
    noteId,
    position: position || { x: Math.random() * 400, y: Math.random() * 400 },
    data: {
      label: noteTitle,
      color: '#e8935f',
    },
  };

  flow.nodes.push(newNode);
  return saveFlow(flow);
}

export function removeNodeFromFlow(flowId: string, nodeId: string) {
  const flow = getFlowById(flowId);
  if (!flow) return null;

  flow.nodes = flow.nodes.filter((n) => n.id !== nodeId);
  flow.edges = flow.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
  return saveFlow(flow);
}

/**
 * Check if a note is used as a node in any flow
 * Returns an array of flows that contain this note
 */
export function getFlowsContainingNote(noteId: string): Array<{ flowId: string; flowTitle: string }> {
  const allFlows = readAll();
  const flowsContainingNote: Array<{ flowId: string; flowTitle: string }> = [];
  
  for (const flow of allFlows) {
    const node = flow.nodes.find((n) => n.noteId === noteId);
    if (node) {
      flowsContainingNote.push({ flowId: flow.id, flowTitle: flow.title });
    }
  }
  
  return flowsContainingNote;
}

