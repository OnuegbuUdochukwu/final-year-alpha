export interface SkillNode {
  id: string;
  label?: string;
  data?: {
    label: string;
  };
}

export interface SkillEdge {
  id: string;
  source: string;
  target: string;
}

/**
 * Topologically sorts nodes based on the provided edges using Kahn's Algorithm.
 */
export function topologicalSort(nodes: SkillNode[], edges: SkillEdge[]): SkillNode[] {
  const inDegree: Record<string, number> = {};
  const adjacencyList: Record<string, string[]> = {};
  const nodeMap: Record<string, SkillNode> = {};

  // Initialize data structures
  for (const node of nodes) {
    inDegree[node.id] = 0;
    adjacencyList[node.id] = [];
    nodeMap[node.id] = node;
  }

  // Populate in-degrees and adjacency list
  for (const edge of edges) {
    if (inDegree[edge.target] !== undefined) {
      inDegree[edge.target] += 1;
    }
    if (adjacencyList[edge.source] !== undefined) {
      adjacencyList[edge.source].push(edge.target);
    }
  }

  // Initialize queue with nodes that have in-degree of 0
  const queue: string[] = [];
  for (const [nodeId, degree] of Object.entries(inDegree)) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  const sortedNodes: SkillNode[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    sortedNodes.push(nodeMap[currentId]);

    const neighbors = adjacencyList[currentId] || [];
    for (const neighborId of neighbors) {
      inDegree[neighborId] -= 1;
      if (inDegree[neighborId] === 0) {
        queue.push(neighborId);
      }
    }
  }

  // If there's a cycle, Kahn's algorithm won't include all nodes.
  // We append any leftover nodes at the end to ensure nothing is dropped.
  if (sortedNodes.length < nodes.length) {
    const sortedIds = new Set(sortedNodes.map(n => n.id));
    for (const node of nodes) {
      if (!sortedIds.has(node.id)) {
        sortedNodes.push(node);
      }
    }
  }

  return sortedNodes;
}
