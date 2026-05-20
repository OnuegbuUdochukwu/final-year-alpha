/**
 * layout.ts — Dagre-based auto-layout engine for React Flow graphs.
 *
 * Takes flat nodes (all at 0,0) and edges from the Neo4j API response
 * and calculates optimal tree positions using the dagre graph library.
 */

import dagre from 'dagre';

export interface LayoutNode {
  id: string;
  data: { label: string };
  position: { x: number; y: number };
  type?: string;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  animated?: boolean;
  style?: Record<string, any>;
}

const NODE_WIDTH = 260;
const NODE_HEIGHT = 60;

/**
 * Applies a dagre layout to the given nodes and edges.
 * @param nodes - React Flow nodes (positions will be overwritten)
 * @param edges - React Flow edges
 * @param direction - Layout direction: 'TB' (top-bottom) or 'LR' (left-right)
 * @returns Layouted nodes and edges ready for React Flow
 */
export function getLayoutedElements(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  direction: 'TB' | 'LR' = 'TB'
): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const safeNodes = nodes || [];
  const safeEdges = edges || [];

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 80,
    ranksep: 100,
    marginx: 20,
    marginy: 20,
  });

  // Register nodes with dagre
  safeNodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  // Register edges with dagre
  safeEdges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Run the layout algorithm
  dagre.layout(dagreGraph);

  // Map calculated positions back onto the nodes
  const layoutedNodes = safeNodes.map((node) => {
    const dagreNode = dagreGraph.node(node.id);

    return {
      ...node,
      position: {
        // Dagre returns center coordinates; offset by half dimensions for React Flow
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - NODE_HEIGHT / 2,
      },
    };
  });

  // Style edges for smooth animated rendering
  const layoutedEdges = safeEdges.map((edge) => ({
    ...edge,
    type: 'smoothstep',
    animated: true,
    style: { stroke: '#6366F1', strokeWidth: 2 },
  }));

  return { nodes: layoutedNodes, edges: layoutedEdges };
}
