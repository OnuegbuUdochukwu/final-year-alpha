import React, { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1 w-full">
        {label && (
          <label className="text-[var(--text-label-md)] text-[var(--color-text-primary)]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            w-full bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]
            px-3 py-2 rounded-[var(--radius-base)]
            border border-[var(--color-border-subtle)]
            transition-all duration-200
            placeholder:text-[var(--color-text-secondary)]
            focus:outline-none focus:border-[var(--color-brand-primary)] focus:ring-2 focus:ring-[var(--color-brand-primary)] focus:ring-opacity-50
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}
            ${className}
          `}
          {...props}
        />
        {error && (
          <span className="text-sm text-red-500 mt-1">{error}</span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
