import React, { HTMLAttributes } from 'react';

export interface ChipProps extends HTMLAttributes<HTMLDivElement> {
  active?: boolean;
}

export const Chip: React.FC<ChipProps> = ({ 
  children, 
  active = false, 
  className = '', 
  ...props 
}) => {
  return (
    <div 
      className={`
        inline-flex items-center justify-center
        text-[var(--text-label-sm)]
        px-3 py-1
        rounded-[var(--radius-pill)]
        transition-colors
        ${active 
          ? 'bg-[var(--color-brand-subtle)] text-[var(--color-brand-primary)] font-semibold' 
          : 'bg-transparent border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]'}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
};
