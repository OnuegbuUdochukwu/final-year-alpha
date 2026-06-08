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
  <div className="w-full mt-6 bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-gray-100 dark:border-gray-800 flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
    <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19.5v-4.5l3 3 3-3v4.5M9 4.5v4.5l3-3 3 3V4.5" />
      </svg>
    </div>
    <p className="text-sm font-medium">No skills data available</p>
    <p className="text-xs mt-1">Upload a resume to see your skill analysis</p>
  </div>
);

const SkillRadar: React.FC<SkillRadarProps> = ({ data }) => {
  const chartData = useMemo(() => {
    const skills = data?.current_skills_json?.skills;
    
    if (!skills || !Array.isArray(skills) || skills.length === 0) {
       return []; 
    }
    
    return skills.slice(0, 6).map((skillObj: any, index: number) => ({
      subject: skillObj.name, 
      score: Math.round((skillObj.confidence || 0.95) * 100) - (index * 2), 
      fullMark: 100
    }));
  }, [data]);

  if (!data || !data.current_skills_json || !data.current_skills_json.skills) {
    return <EmptyState />;
  }

  const processedData = [...chartData];
  while (processedData.length < 3) {
    processedData.push({
      subject: `Skill ${processedData.length + 1}`,
      score: 0,
      fullMark: 100,
    });
  }

  return (
    <div className="w-full mt-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 text-center">
        Skill Proficiency Analysis
      </h3>
      <p className="text-xs text-gray-400 dark:text-gray-500 text-center mb-2">
        Confidence scores for your top skills
      </p>
      <div className="w-full h-72 min-h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={processedData}>
            <PolarGrid stroke="#e5e7eb" className="dark:stroke-gray-700" strokeDasharray="3 3" />
            <PolarAngleAxis 
              dataKey="subject" 
              tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 500 }}
              className="dark:fill-gray-400"
            />
            <PolarRadiusAxis 
              angle={30} 
              domain={[0, 100]} 
              tick={{ fill: '#9ca3af', fontSize: 9 }}
              tickCount={5}
              axisLine={false}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderRadius: '10px',
                border: '1px solid #e5e7eb',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                fontSize: '13px'
              }}
              formatter={(value: any) => [`${Number(value).toFixed(0)}%`, 'Proficiency']}
            />
            <Radar
              name="Skills"
              dataKey="score"
              stroke="#6366f1"
              fill="#6366f1"
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SkillRadar;
