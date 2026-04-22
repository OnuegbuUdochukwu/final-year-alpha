/**
 * App.tsx — Root application shell.
 *
 * Orchestrates the full user journey:
 *   1. LoginModal gate (shows if no JWT present)
 *   2. Resume upload → NLP parse → SkillRadar
 *   3. Target selection → A* pathfinding → TimelineRoadmap
 *   4. Mark step complete → webhook → Dynamic path recalculation (Phase 6.3.2)
 *   5. Future resume preview
 *
 * State flow:
 *   parsedSkills → topSkill → pathData (recalculates on each step completion)
 */

import { useState, useCallback } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import LoginModal from './components/LoginModal';
import ResumeUpload from './components/ResumeUpload';
import TimelineRoadmap from './components/TimelineRoadmap';
import PredictedResume from './components/PredictedResume';
import { GlassNav } from './components/ui/GlassNav';
import client from './api/client';
import './App.css';

interface ParsedSkill {
  name: string;
  confidence: number;
}

function App() {
  const { token, userId, logout } = useAuth();

  // Core data state
  const [pathData, setPathData] = useState<any>(null);
  const [parsedSkills, setParsedSkills] = useState<ParsedSkill[]>([]);

  // Dynamic recalculation state (Phase 6.3.2)
  const [currentStart, setCurrentStart] = useState<string>('Foundation');
  const [currentTarget, setCurrentTarget] = useState<string | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  /**
   * Called by ResumeUpload after a successful parse.
   * Derives `topSkill` as the highest-confidence skill (already sorted by server).
   */
  const handleSkillsParsed = useCallback((skills: ParsedSkill[]) => {
    setParsedSkills(skills);
    if (skills.length > 0) {
      setCurrentStart(skills[0].name);
    }
  }, []);

  /**
   * Called by TargetSelectionForm after the first path is generated.
   * Stores the target so we can re-use it during recalculation.
   */
  const handlePathFound = useCallback((data: any) => {
    setPathData(data);
    setCurrentTarget(data.target_skill);
  }, []);

  /**
   * Phase 6.3.2 — Dynamic Path Recalculation.
   *
   * Called by TimelineRoadmap after a step is marked complete.
   * Updates `currentStart` to the newly acquired skill and re-fetches the
   * optimal path from the graph service.
   */
  const handleStepCompleted = useCallback(async (completedSkill: string) => {
    // Update our local "current position" reference
    setCurrentStart(completedSkill);

    // If we don't yet know the target, nothing more to do
    if (!currentTarget) return;

    setIsRecalculating(true);
    try {
      const response = await client.get('/api/find-path', {
        params: {
          start: completedSkill,
          target: currentTarget,
          // Re-use any previous constraints — for now we leave them open
        },
      });
      setPathData(response.data);
    } catch (err: any) {
      // Surface errors gracefully — the TimelineRoadmap will handle them
      console.error('Recalculation error:', err.response?.data?.detail ?? err.message);
    } finally {
      setIsRecalculating(false);
    }
  }, [currentTarget]);

  return (
    <>
      {/* ── Auth gate ─────────────────────────────────────────────────────── */}
      {!token && <LoginModal />}

      <GlassNav>
        <div className="flex items-center justify-between h-16">
          <div className="font-bold text-xl tracking-tight text-[var(--color-brand-primary)]">
            AfterClass
          </div>
          {token && (
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-red-500 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 rounded px-2 py-1"
            >
              <LogOut className="w-4 h-4" />
              Sign out {userId ? `(${userId})` : ''}
            </button>
          )}
        </div>
      </GlassNav>

      {/* ── App shell ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center py-[var(--spacing-xxl)] px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-[1280px] grid grid-cols-1 md:grid-cols-12 gap-[var(--spacing-xl)]">

          {/* ── Header ── */}
          <div className="col-span-1 md:col-span-12 text-center mb-[var(--spacing-xl)] relative">
            <h1 className="text-display-lg text-[var(--color-text-primary)] mb-4">
              AI Career Pathfinder
            </h1>
            <p className="max-w-xl mx-auto text-body-lg text-[var(--color-text-secondary)]">
              Upload your resume → discover skill gaps → generate a personalized learning roadmap → mark milestones complete for a live updated path.
            </p>
          </div>

          <div className="col-span-1 md:col-start-3 md:col-span-8 flex flex-col gap-[var(--spacing-xxl)]">
            {/* ── Main flow ── */}
            <ResumeUpload
              onPathFound={handlePathFound}
              onSkillsParsed={handleSkillsParsed}
              topSkill={currentStart !== 'Foundation' ? currentStart : null}
            />

            {/* Timeline + Predicted Resume appear after a path is generated */}
            {pathData && (
              <>
                <TimelineRoadmap
                  pathData={pathData}
                  onStepCompleted={handleStepCompleted}
                  isRecalculating={isRecalculating}
                />
                <PredictedResume currentSkills={parsedSkills} pathData={pathData} />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
