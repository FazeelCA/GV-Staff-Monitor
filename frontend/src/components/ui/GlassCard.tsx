import React from 'react';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    className?: string;
    hoverEffect?: boolean;
}

export function GlassCard({ children, className = '', hoverEffect = false, ...props }: GlassCardProps) {
    return (
        <div
            className={`
                rounded-2xl border p-5 transition-all duration-300
                bg-card/60 backdrop-blur-xl border-white/5
                ${hoverEffect ? 'hover:bg-card/80 hover:border-primary/30 hover:shadow-[0_0_30px_rgba(99,102,241,0.1)]' : ''}
                ${className}
            `}
            {...props}
        >
            {children}
        </div>
    );
}

export function SkeletonGlassCard({ className = '' }: { className?: string }) {
    return (
        <div className={`rounded-2xl border border-white/5 bg-card/30 p-5 ${className}`}>
            <div className="flex items-start justify-between mb-4">
                <div className="bg-white/5 w-14 h-14 rounded-full animate-pulse" />
                <div className="bg-white/5 w-20 h-6 rounded-full animate-pulse" />
            </div>
            <div className="bg-white/5 w-32 h-4 rounded mb-2 animate-pulse" />
            <div className="bg-white/5 w-20 h-3 rounded mb-4 animate-pulse" />
            <div className="bg-white/5 w-full h-12 rounded-xl mb-4 animate-pulse" />
            <div className="bg-white/5 w-16 h-6 rounded animate-pulse" />
        </div>
    );
}
