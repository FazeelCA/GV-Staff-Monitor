import React from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'outline' | 'glass' | 'info';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: BadgeVariant;
    children: React.ReactNode;
}

const VARIANTS = {
    default: 'bg-primary/10 text-primary border-primary/20',
    success: 'bg-green-500/10 text-green-400 border-green-500/20',
    warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    error: 'bg-red-500/10 text-red-400 border-red-500/20',
    info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    outline: 'border-white/20 text-muted-foreground',
    glass: 'bg-white/5 border-white/10 text-foreground backdrop-blur-md',
};

export function Badge({ variant = 'default', className = '', children, ...props }: BadgeProps) {
    return (
        <span
            className={`
                inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border
                ${VARIANTS[variant]}
                ${className}
            `}
            {...props}
        >
            {children}
        </span>
    );
}

export function StatusDot({ className = '' }: { className?: string }) {
    return <span className={`w-1.5 h-1.5 rounded-full ${className}`} />;
}
