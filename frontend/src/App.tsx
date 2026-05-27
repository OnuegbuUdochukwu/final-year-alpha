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
import { LogOut, FileText } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from './context/AuthContext';
import LoginModal from './components/LoginModal';
import ResumeUpload from './components/ResumeUpload';
import TimelineRoadmap from './components/TimelineRoadmap';
import PredictedResume from './components/PredictedResume';
import ResumeBuilder from './components/ResumeBuilder';
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

  // Resume builder visibility
  const [showResumeBuilder, setShowResumeBuilder] = useState(false);

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
    console.log("Roadmap API Response:", data);
    setPathData(data);
    setCurrentTarget(data.target_skill || data.target_role);
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

      {/* ── App shell ─────────────────────────────────────────────────────── */}
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-2xl">

          {/* ── Header ── */}
          <div className="text-center mb-12 relative">
            {/* Logout button (top-right when logged in) */}
            {token && (
              <button
                onClick={logout}
                className="absolute right-0 top-0 flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out {userId ? `(${userId})` : ''}
              </button>
            )}

            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-4">
              AI Career Pathfinder
            </h1>
            <p className="max-w-xl mx-auto text-lg text-gray-500 dark:text-gray-400">
              Upload your resume → discover skill gaps → generate a personalized learning roadmap → mark milestones complete for a live updated path.
            </p>
          </div>

          {/* ── Main flow ── */}
          <ResumeUpload
            onPathFound={handlePathFound}
            onSkillsParsed={handleSkillsParsed}
            topSkill={currentStart !== 'Foundation' ? currentStart : null}
          />



          {/* Timeline + Predicted Resume + Resume Builder appear after a path is generated */}
          {pathData && (
            <>
              <TimelineRoadmap
                pathData={pathData}
                onStepCompleted={handleStepCompleted}
                isRecalculating={isRecalculating}
                knownSkills={pathData.knownSkills}
              />
              <PredictedResume currentSkills={parsedSkills} pathData={pathData} />

              {/* ── Build Resume CTA ── */}
              {token && (
                <div className="flex justify-center mt-4 mb-12">
                  <button
                    type="button"
                    onClick={() => setShowResumeBuilder(true)}
                    className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold text-sm shadow-lg shadow-indigo-500/25 transition-all hover:scale-[1.02] active:scale-100"
                  >
                    <FileText className="w-4 h-4" />
                    Build &amp; Download Resume
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Resume Builder Modal ────────────────────────────────────────── */}
      <AnimatePresence>
        {showResumeBuilder && token && (
          <ResumeBuilder
            token={token}
            cvSkills={parsedSkills.map(s => s.name)}
            targetRole={pathData?.target_skill ?? ''}
            courses={(pathData?.nodes ?? []).map((node: any) => ({
              name: node.label,
              provider: '',
            }))}
            onClose={() => setShowResumeBuilder(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export default App;
