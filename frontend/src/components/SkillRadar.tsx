import React from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip
} from 'recharts';

interface ParsedSkill {
  name: string;
  confidence: number;
}

interface SkillRadarProps {
  skills: ParsedSkill[];
}

const SkillRadar: React.FC<SkillRadarProps> = ({ skills }) => {
  // Process the data for Recharts
  // Ensure we have at least 3 points for a valid radar shape, padding with empty if necessary
  const processedData = skills.map((skill) => ({
    subject: skill.name,
    A: skill.confidence * 100, // map back to 0-100 scale for aesthetics
    fullMark: 100,
  }));

  // If there are less than 3 skills, add placeholders to make the radar chart look like a polygon
  while (processedData.length < 3) {
    processedData.push({
      subject: `Skill ${processedData.length + 1}`,
      A: 0,
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
            formatter={(value: any) => [`${Number(value).toFixed(0)}%`, 'Confidence']}
          />
          <Radar
            name="Skills"
            dataKey="A"
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
