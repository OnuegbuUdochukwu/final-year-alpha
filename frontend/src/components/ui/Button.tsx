import React, { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-[var(--color-brand-primary)] text-white hover:bg-[var(--color-brand-hover)] rounded-[var(--radius-base)]',
    secondary: 'bg-[var(--color-brand-subtle)] text-[var(--color-brand-primary)] border border-transparent hover:bg-[var(--color-brand-primary)] hover:text-white rounded-[var(--radius-base)]',
    ghost: 'bg-transparent hover:bg-[var(--color-brand-ghost)] text-[var(--color-text-primary)] rounded-[var(--radius-pill)]', // Pill shape for ghost buttons
  };

  const sizes = {
    sm: 'text-[var(--text-label-sm)] px-3 py-1.5',
    md: 'text-[var(--text-label-md)] px-4 py-2',
    lg: 'text-[var(--text-body-md)] px-6 py-3',
  };

  const classes = [
    baseStyles,
    variants[variant],
    sizes[size],
    fullWidth ? 'w-full' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
};
