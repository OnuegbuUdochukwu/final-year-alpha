import React from 'react';
import { DollarSign, Clock } from 'lucide-react';

interface ConstraintSelectorProps {
  maxBudget: number;
  setMaxBudget: (val: number) => void;
  maxHours: number;
  setMaxHours: (val: number) => void;
}

const ConstraintSelector: React.FC<ConstraintSelectorProps> = ({
  maxBudget,
  setMaxBudget,
  maxHours,
  setMaxHours,
}) => {
  return (
    <div className="mt-5 pt-5 border-t border-clay-200">
      <h4 className="text-xs font-semibold text-clay-500 uppercase tracking-[0.1em] mb-4">
        Optimization Constraints
      </h4>
      
      <div className="space-y-5">
        {/* Budget Constraint */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-clay-600 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-rust-500" />
              Maximum Budget
            </label>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-clay-400 text-sm font-medium">$</span>
              <input 
                type="number" 
                value={maxBudget}
                onChange={(e) => setMaxBudget(Number(e.target.value))}
                min={0}
                max={10000}
                className="w-24 pl-5 pr-2 py-1 text-sm text-right rounded border border-clay-300 bg-white focus:outline-none focus:ring-1 focus:ring-rust-500 transition-colors"
              />
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={10000}
            step={50}
            value={maxBudget}
            onChange={(e) => setMaxBudget(Number(e.target.value))}
            className="w-full h-1.5 bg-clay-200 rounded-lg appearance-none cursor-pointer accent-rust-500 focus:outline-none"
          />
          <div className="flex justify-between text-[10px] text-clay-400 mt-1 font-medium uppercase tracking-wider">
            <span>$0</span>
            <span>$10,000</span>
          </div>
        </div>

        {/* Time Constraint */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-clay-600 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-rust-500" />
              Maximum Time
            </label>
            <div className="relative">
              <input 
                type="number" 
                value={maxHours}
                onChange={(e) => setMaxHours(Number(e.target.value))}
                min={0}
                max={2000}
                className="w-24 pr-8 pl-2 py-1 text-sm text-right rounded border border-clay-300 bg-white focus:outline-none focus:ring-1 focus:ring-rust-500 transition-colors"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-clay-400 text-sm font-medium">hrs</span>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={2000}
            step={10}
            value={maxHours}
            onChange={(e) => setMaxHours(Number(e.target.value))}
            className="w-full h-1.5 bg-clay-200 rounded-lg appearance-none cursor-pointer accent-rust-500 focus:outline-none"
          />
          <div className="flex justify-between text-[10px] text-clay-400 mt-1 font-medium uppercase tracking-wider">
            <span>0 hrs</span>
            <span>2,000 hrs</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConstraintSelector;
