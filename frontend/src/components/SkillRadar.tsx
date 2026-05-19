import React, { useMemo } from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip
} from 'recharts';

interface SkillRadarProps {
  data: any;
}

const EmptyState = () => (
  <div className="w-full h-72 mt-6 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
    <p>No skills data available</p>
  </div>
);

const SkillRadar: React.FC<SkillRadarProps> = ({ data }) => {
  // 1. Safely handle empty states early
  if (!data || !data.current_skills_json || !data.current_skills_json.skills) {
    return <EmptyState />;
  }

  const chartData = useMemo(() => {
    const skills = data?.current_skills_json?.skills;
    
    if (!skills || !Array.isArray(skills) || skills.length === 0) {
       return []; 
    }
    
    // 2. Map the agent's object structure into the Radar Chart structure
    return skills.slice(0, 6).map((skillObj: any, index: number) => ({
      subject: skillObj.name, 
      // Convert 0.95 confidence to 95 score, with slight visual variance
      score: Math.round((skillObj.confidence || 0.95) * 100) - (index * 2), 
      fullMark: 100
    }));
  }, [data]);

  // If there are less than 3 skills, add placeholders to make the radar chart look like a polygon
  const processedData = [...chartData];
  while (processedData.length < 3) {
    processedData.push({
      subject: `Skill ${processedData.length + 1}`,
      score: 0,
      fullMark: 100,
    });
  }

  return (
    <div className="w-full h-72 min-h-[300px] mt-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm flex flex-col items-center justify-center">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2 w-full text-center">
        Skill Proficiency Analysis
      </h3>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={processedData}>
          <PolarGrid stroke="#e5e7eb" className="dark:stroke-gray-600" />
          <PolarAngleAxis 
            dataKey="subject" 
            tick={{ fill: '#6b7280', fontSize: 12 }}
            className="dark:fill-gray-400"
          />
          <PolarRadiusAxis 
            angle={30} 
            domain={[0, 100]} 
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            tickCount={6}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.9)', 
              borderRadius: '8px', 
              border: 'none', 
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' 
            }}
            formatter={(value: any) => [`${Number(value).toFixed(0)}%`, 'Score']}
          />
          <Radar
            name="Skills"
            dataKey="score"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.5}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SkillRadar;
