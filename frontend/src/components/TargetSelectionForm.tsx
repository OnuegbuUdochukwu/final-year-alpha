/**
 * TargetSelectionForm.tsx — Goal selector + inline roadmap graph.
 *
 * Calls GET /api/generate?target_role=... to fetch the pre-built roadmap
 * from Neo4j, applies dagre auto-layout, and renders React Flow inline
 * below the form controls.
 *
 * The Budget and Time sliders are preserved for future filtering features.
 */

import React, { useState, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Target, DollarSign, Clock, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
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
import client from '../api/client';
import { getLayoutedElements } from '../utils/layout';

// ─── Form Types ──────────────────────────────────────────────────────────────
interface FormValues {
  targetRole: string;
  maxBudget: number;
  maxHours: number;
}

// ─── Available Roles (must match seeded Neo4j role keys) ─────────────────────
const JOB_ROLES = [
  { value: 'frontend', label: 'Frontend Developer' },
  { value: 'backend', label: 'Backend Developer' },
  { value: 'devops', label: 'DevOps Engineer' },
  { value: 'full-stack', label: 'Full-Stack Developer' },
  { value: 'data-analyst', label: 'Data Analyst' },
  { value: 'cyber-security', label: 'Cyber Security' },
  { value: 'android', label: 'Android Developer' },
];

// ─── Custom Skill Node ───────────────────────────────────────────────────────
function SkillNode({ data }: NodeProps) {
  return (
    <div style={{
      background: '#1E293B',
      border: '1px solid #334155',
      borderRadius: '0.625rem',
      padding: '0.75rem 1.25rem',
      minWidth: '180px',
      maxWidth: '260px',
      boxShadow: '0 2px 12px rgba(0, 0, 0, 0.25)',
      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      cursor: 'grab',
    }}>
      <Handle
        type="target"
        position={Position.Top}
        style={{ width: 8, height: 8, background: '#6366F1', border: '2px solid #0F172A' }}
      />
      <div style={{
        color: '#E2E8F0',
        fontSize: '0.8125rem',
        fontWeight: 600,
        lineHeight: 1.4,
        textAlign: 'center',
        wordBreak: 'break-word',
        letterSpacing: '0.01em',
      }}>
        {(data as any).label}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ width: 8, height: 8, background: '#6366F1', border: '2px solid #0F172A' }}
      />
    </div>
  );
}

const nodeTypes = { default: SkillNode };

const defaultEdgeOptions = {
  type: 'smoothstep' as const,
  animated: true,
  style: { stroke: '#6366F1', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#6366F1', width: 16, height: 16 },
};

// ─── Component Props ─────────────────────────────────────────────────────────
interface TargetSelectionFormProps {
  onPathFound: (pathData: any) => void;
  /** The skill node to use as path start (e.g. top NLP skill or last completed skill). */
  startSkill?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────
const TargetSelectionForm: React.FC<TargetSelectionFormProps> = ({
  onPathFound,
  startSkill = 'Foundation',
}) => {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      targetRole: 'frontend',
      maxBudget: 200,
      maxHours: 40,
    },
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [graphLoaded, setGraphLoaded] = useState(false);
  const [graphMeta, setGraphMeta] = useState<{ role: string; nodeCount: number; edgeCount: number } | null>(null);

  const onSubmit = useCallback(async (data: FormValues) => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch the pre-built roadmap graph from Neo4j via the API Gateway.
      const response = await client.get('/api/generate', {
        params: { target_role: data.targetRole },
      });

      const rawNodes = response.data.nodes || [];
      const rawEdges = response.data.edges || [];

      if (rawNodes.length === 0) {
        setError(`No roadmap data found for "${data.targetRole}". Try a different role.`);
        setNodes([]);
        setEdges([]);
        setGraphLoaded(false);
        return;
      }

      // Apply dagre layout to compute positions
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        rawNodes,
        rawEdges,
        'TB'
      );

      setNodes(layoutedNodes as Node[]);
      setEdges(layoutedEdges as Edge[]);
      setGraphLoaded(true);
      setGraphMeta({
        role: JOB_ROLES.find(r => r.value === data.targetRole)?.label ?? data.targetRole,
        nodeCount: layoutedNodes.length,
        edgeCount: layoutedEdges.length,
      });

      // Notify parent with the raw graph data (for downstream components)
      onPathFound({ nodes: layoutedNodes, edges: layoutedEdges, target_role: data.targetRole });
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(detail || 'Failed to generate roadmap. Please check the service is running.');
    } finally {
      setIsLoading(false);
    }
  }, [onPathFound, setNodes, setEdges]);

  return (
    <>
      {/* ── Goal Form Card ── */}
      <div className="w-full max-w-2xl mx-auto p-6 mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2 flex items-center">
            <Target className="w-6 h-6 mr-2 text-blue-500" />
            Set Your Goal
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Where do you want to go, and what are your constraints?
          </p>
          {startSkill !== 'Foundation' && (
            <div className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-full">
              🚀 Starting from: <span className="font-bold">{startSkill}</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

          {/* Target Role Dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Target Job Role
            </label>
            <div className="relative">
              <Controller
                name="targetRole"
                control={control}
                rules={{ required: true }}
                render={({ field }) => (
                  <select
                    {...field}
                    className="block w-full pl-3 pr-10 py-2.5 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 appearance-none border"
                  >
                    {JOB_ROLES.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                )}
              />
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            {errors.targetRole && (
              <span className="text-red-500 text-xs mt-1">This field is required</span>
            )}
          </div>

          {/* Budget Slider */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                <DollarSign className="w-4 h-4 mr-1 text-green-500" />
                Maximum Budget
              </label>
              <Controller
                name="maxBudget"
                control={control}
                render={({ field }) => (
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">${field.value}</span>
                )}
              />
            </div>
            <Controller
              name="maxBudget"
              control={control}
              render={({ field }) => (
                <input
                  type="range"
                  min="0"
                  max="2000"
                  step="50"
                  {...field}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
                />
              )}
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>$0 (no limit)</span>
              <span>$2000+</span>
            </div>
          </div>

          {/* Time Cap Slider */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                <Clock className="w-4 h-4 mr-1 text-amber-500" />
                Maximum Time
              </label>
              <Controller
                name="maxHours"
                control={control}
                render={({ field }) => (
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{field.value} hrs</span>
                )}
              />
            </div>
            <Controller
              name="maxHours"
              control={control}
              render={({ field }) => (
                <input
                  type="range"
                  min="0"
                  max="200"
                  step="5"
                  {...field}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-amber-500"
                />
              )}
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0 hrs (no limit)</span>
              <span>200+ hrs</span>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-100 dark:border-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={isLoading}
              className={`
                flex items-center space-x-2 px-8 py-3 rounded-lg font-medium text-white transition-all w-full justify-center
                ${isLoading
                  ? 'bg-blue-300 dark:bg-blue-800/50 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md transform hover:-translate-y-0.5'
                }
              `}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Generating Roadmap…</span>
                </>
              ) : (
                <>
                  <span>Generate Learning Path</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* ── React Flow Canvas (appears after generation) ── */}
      {graphLoaded && nodes.length > 0 && (
        <div className="w-full max-w-4xl mx-auto mt-6">
          {/* Canvas header bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1.25rem',
            background: '#0F172A',
            borderTopLeftRadius: '1rem',
            borderTopRightRadius: '1rem',
            borderBottom: '1px solid #1E293B',
          }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0.25rem 0.75rem',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#C7D2FE',
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '9999px',
              textTransform: 'capitalize',
            }}>
              {graphMeta?.role}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 500 }}>
              {graphMeta?.nodeCount} skills · {graphMeta?.edgeCount} connections
            </span>
          </div>

          {/* React Flow canvas */}
          <div style={{
            width: '100%',
            height: '70vh',
            background: '#0F172A',
            borderBottomLeftRadius: '1rem',
            borderBottomRightRadius: '1rem',
            border: '1px solid #1E293B',
            borderTop: 'none',
            overflow: 'hidden',
          }}>
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
              <Controls showInteractive={false} />
              <MiniMap
                nodeColor="#6366F1"
                maskColor="rgba(15, 23, 42, 0.85)"
              />
            </ReactFlow>
          </div>
        </div>
      )}
    </>
  );
};

export default TargetSelectionForm;
