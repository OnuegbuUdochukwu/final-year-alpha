import React, { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({ 
  children, 
  className = '', 
  hoverable = false,
  ...props 
}) => {
  return (
    <div 
      className={`
        bg-[var(--color-bg-elevated)]
        border border-[var(--color-border-subtle)]
        rounded-[var(--radius-base)]
        p-6
        transition-all duration-200
        ${hoverable ? 'hover:shadow-ambient hover:-translate-y-0.5' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
};
