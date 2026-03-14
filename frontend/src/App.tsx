import { useState } from 'react';
import ResumeUpload from './components/ResumeUpload';
import TimelineRoadmap from './components/TimelineRoadmap';
import PredictedResume from './components/PredictedResume';
import './App.css';

interface ParsedSkill {
  name: string;
  confidence: number;
}

function App() {
  const [pathData, setPathData] = useState<any>(null);
  const [parsedSkills, setParsedSkills] = useState<ParsedSkill[]>([]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-4">
            AI Career Pathfinder
          </h1>
          <p className="max-w-xl mx-auto text-lg text-gray-500 dark:text-gray-400">
            Upload your resume to instantly discover your skill gaps and generate a personalized learning roadmap.
          </p>
        </div>

        {/* Main Components */}
        <ResumeUpload onPathFound={setPathData} onSkillsParsed={setParsedSkills} />

        {/* Timeline + Predicted Resume after path is generated */}
        {pathData && (
          <>
            <TimelineRoadmap pathData={pathData} />
            <PredictedResume currentSkills={parsedSkills} pathData={pathData} />
          </>
        )}
      </div>
    </div>
  );
}

export default App;
