import React, { useMemo, useState } from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface SkillRadarProps {
  data: any;
}

const SkillRadar: React.FC<SkillRadarProps> = ({ data }) => {
  const [showAll, setShowAll] = useState(false);

  const chartData = useMemo(() => {
    const allSkills = data?.current_skills_json?.skills ?? [];
    const dataMap: Record<string, number> = {};

    allSkills.forEach((s: any) => {
      dataMap[s.name] = Math.max(dataMap[s.name] ?? 0, (s.confidence ?? 0.5) * 100);
    });

    const entries = Object.entries(dataMap).map(([name, value]) => ({
      skill: name,
      proficiency: Math.round(value),
    }));

    entries.sort((a, b) => (a.skill ?? '').localeCompare(b.skill ?? ''));

    if (entries.length <= 8) return entries;
    return showAll ? entries : entries.slice(0, 8);
  }, [data, showAll]);

  return (
    <div className="mb-6">
      <div className="bg-clay-50 rounded-xl p-5 border border-clay-200">
        <h4 className="text-xs font-semibold text-clay-500 uppercase tracking-[0.1em] mb-4">
          Skill Proficiency Radar
        </h4>

        <div className="h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={chartData} margin={{ top: 0, right: 20, bottom: 0, left: 20 }}>
              <PolarGrid stroke="#d1c6bb" />
              <PolarAngleAxis
                dataKey="skill"
                tick={{ fontSize: 11, fill: '#73675d', fontWeight: 500 }}
                tickLine={false}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 10,
                  border: '1px solid #e3dbd2',
                  boxShadow: '0 4px 12px rgba(45,37,32,0.08)',
                  background: '#fff',
                  fontSize: 13,
                }}
                labelStyle={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, color: '#2d2520' }}
                formatter={(value) => [`${value}%`, 'Proficiency']}
              />
              <Radar
                name="Proficiency"
                dataKey="proficiency"
                stroke="#c75146"
                strokeWidth={2}
                fill="#c75146"
                fillOpacity={0.12}
                animationDuration={800}
                animationEasing="ease-out"
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {(data?.current_skills_json?.skills?.length ?? 0) > 8 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="mt-3 text-xs font-semibold text-rust-500 hover:text-rust-600 transition-colors"
          >
            {showAll ? 'Show top 8 skills' : `Show all ${data.current_skills_json.skills.length} skills`}
          </button>
        )}
      </div>
    </div>
  );
};

export default SkillRadar;
