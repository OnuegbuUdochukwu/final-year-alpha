import React, { HTMLAttributes } from 'react';

export interface GlassNavProps extends HTMLAttributes<HTMLElement> {}

export const GlassNav: React.FC<GlassNavProps> = ({ 
  children, 
  className = '', 
  ...props 
}) => {
  return (
    <nav 
      className={`
        sticky top-0 z-50
        bg-[var(--color-glass-bg)]
        backdrop-blur-[20px]
        border-b border-[var(--color-border-subtle)]
        ${className}
      `}
      {...props}
    >
      <div className="max-w-[1280px] mx-auto px-6 lg:px-8">
        {children}
      </div>
    </nav>
  );
};
