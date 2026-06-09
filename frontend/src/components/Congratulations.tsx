import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

interface CongratulationsProps {
  targetRole: string;
}

const Congratulations: React.FC<CongratulationsProps> = ({ targetRole }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
      className="mt-8 p-4 bg-gradient-to-br from-gold-50 to-rust-50 border border-gold-200 rounded-xl"
    >
      <div className="flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-gold-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-gold-800">Congratulations!</p>
          <p className="text-xs text-gold-700 mt-1 font-[450]">
            Completing all steps unlocks your target role as <strong>{targetRole}</strong>. Each completed step refines your path for maximum efficiency.
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default Congratulations;
