/**
 * RoadmapGraph.tsx — Interactive curriculum graph powered by React Flow.
 *
 * Fetches the pre-built roadmap from the graph-service /generate endpoint,
 * applies dagre auto-layout, and renders a beautiful dark-mode skill tree.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Loader2, AlertCircle, Map } from 'lucide-react';
import client from '../api/client';
import { getLayoutedElements } from '../utils/layout';
import './RoadmapGraph.css';

// ─── Available Roles (must match seeded Neo4j roles) ─────────────────────────
const AVAILABLE_ROLES = [
  { value: 'frontend', label: 'Frontend Developer' },
  { value: 'backend', label: 'Backend Developer' },
  { value: 'devops', label: 'DevOps Engineer' },
  { value: 'full-stack', label: 'Full-Stack Developer' },
  { value: 'data-analyst', label: 'Data Analyst' },
  { value: 'cyber-security', label: 'Cyber Security' },
  { value: 'android', label: 'Android Developer' },
];

// ─── Custom Node Component ───────────────────────────────────────────────────
function SkillNode({ data }: NodeProps) {
  return (
    <div className="skill-node">
      <Handle type="target" position={Position.Top} className="skill-handle" />
      <div className="skill-node-label">{(data as any).label}</div>
      <Handle type="source" position={Position.Bottom} className="skill-handle" />
    </div>
  );
}

const nodeTypes = { default: SkillNode };

// ─── Default Edge Options ────────────────────────────────────────────────────
const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: true,
  style: { stroke: '#6366F1', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#6366F1', width: 16, height: 16 },
};

// ─── Component ───────────────────────────────────────────────────────────────
const RoadmapGraph: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedRole, setSelectedRole] = useState<string>('frontend');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchRoadmap = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await client.get('/api/generate', {
        params: { target_role: selectedRole },
      });

      const rawNodes = response.data.nodes || [];
      const rawEdges = response.data.edges || [];

      if (rawNodes.length === 0) {
        setError(`No roadmap data found for "${selectedRole}". Try a different role.`);
        setNodes([]);
        setEdges([]);
        return;
      }

      // Apply dagre layout
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        rawNodes,
        rawEdges,
        'TB'
      );

      setNodes(layoutedNodes as Node[]);
      setEdges(layoutedEdges as Edge[]);
      setHasLoaded(true);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(detail || 'Failed to fetch roadmap. Please check the service is running.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedRole, setNodes, setEdges]);

  const currentRoleLabel = useMemo(
    () => AVAILABLE_ROLES.find((r) => r.value === selectedRole)?.label ?? selectedRole,
    [selectedRole]
  );

  return (
    <div className="roadmap-graph-container">
      {/* ── Header & Controls ── */}
      <div className="roadmap-graph-header">
        <div className="roadmap-graph-title-row">
          <Map className="roadmap-graph-icon" />
          <h2 className="roadmap-graph-title">Skill Roadmap</h2>
        </div>
        <p className="roadmap-graph-subtitle">
          Select a target role and explore the full curriculum tree.
        </p>

        <div className="roadmap-graph-controls">
          <div className="roadmap-select-wrapper">
            <select
              id="role-select"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="roadmap-select"
            >
              {AVAILABLE_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
            <div className="roadmap-select-arrow">
              <svg className="roadmap-select-arrow-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          <button
            onClick={fetchRoadmap}
            disabled={isLoading}
            className="roadmap-generate-btn"
          >
            {isLoading ? (
              <>
                <Loader2 className="roadmap-btn-icon animate-spin" />
                <span>Loading…</span>
              </>
            ) : (
              <span>Generate Roadmap</span>
            )}
          </button>
        </div>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div className="roadmap-error-banner">
          <AlertCircle className="roadmap-error-icon" />
          <span>{error}</span>
        </div>
      )}

      {/* ── React Flow Canvas ── */}
      {hasLoaded && nodes.length > 0 ? (
        <div className="roadmap-canvas-wrapper">
          <div className="roadmap-canvas-label">
            <span className="roadmap-canvas-badge">{currentRoleLabel}</span>
            <span className="roadmap-canvas-count">
              {nodes.length} skills · {edges.length} connections
            </span>
          </div>

          <div className="roadmap-canvas">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.1}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#334155" gap={20} size={1} />
              <Controls
                showInteractive={false}
                className="roadmap-controls"
              />
              <MiniMap
                nodeColor="#6366F1"
                maskColor="rgba(15, 23, 42, 0.85)"
                className="roadmap-minimap"
              />
            </ReactFlow>
          </div>
        </div>
      ) : (
        !isLoading &&
        !error && (
          <div className="roadmap-empty-state">
            <Map className="roadmap-empty-icon" />
            <p className="roadmap-empty-text">
              Select a role above and click <strong>Generate Roadmap</strong> to visualize the skill tree.
            </p>
          </div>
        )
      )}
    </div>
  );
};

export default RoadmapGraph;
