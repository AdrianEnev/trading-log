import * as React from 'react';
import clsx from 'clsx';
import { Slot } from '@radix-ui/react-slot';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  asChild?: boolean;
};

const base = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
const sizes = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};
const variants = {
  default: 'bg-black text-white hover:bg-black/90 focus:ring-black',
  outline: 'border border-gray-300 bg-white hover:bg-gray-50 focus:ring-gray-300',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-300',
  ghost: 'bg-transparent hover:bg-gray-100',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', asChild = false, ...props }, ref) => {
    const Comp: any = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={clsx(base, sizes[size], variants[variant], className)}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
