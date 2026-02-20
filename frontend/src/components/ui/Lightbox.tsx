import { useEffect } from 'react';
import { Button } from './Button';
import { X, ChevronLeft, ChevronRight, Monitor, Clock } from 'lucide-react';
import type { Screenshot } from '../../services/api';

interface LightboxProps {
    screenshot: Screenshot;
    onClose: () => void;
    onPrev: () => void;
    onNext: () => void;
    hasPrev: boolean;
    hasNext: boolean;
}

export function Lightbox({ screenshot, onClose, onPrev, onNext, hasPrev, hasNext }: LightboxProps) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft' && hasPrev) onPrev();
            if (e.key === 'ArrowRight' && hasNext) onNext();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose, onPrev, onNext, hasPrev, hasNext]);

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200"
            style={{ background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(10px)' }}
            onClick={onClose}
        >
            <div
                className="relative max-w-7xl w-full h-full flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="text-white">
                        <h3 className="font-semibold text-lg flex items-center gap-2">
                            <Monitor size={18} className="text-primary" />
                            {screenshot.taskAtTheTime || 'No active task'}
                        </h3>
                        <p className="text-sm text-gray-400 flex items-center gap-1.5 mt-1">
                            <Clock size={14} />
                            {new Date(screenshot.timestamp).toLocaleString()}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex gap-2">
                            <Button variant="secondary" size="sm" onClick={onPrev} disabled={!hasPrev}>
                                <ChevronLeft size={18} />
                            </Button>
                            <Button variant="secondary" size="sm" onClick={onNext} disabled={!hasNext}>
                                <ChevronRight size={18} />
                            </Button>
                        </div>
                        <Button variant="ghost" size="sm" onClick={onClose} className="rounded-full w-10 h-10 p-0">
                            <X size={20} />
                        </Button>
                    </div>
                </div>

                {/* Image Container */}
                <div className="flex-1 flex items-center justify-center min-h-0 bg-black/50 rounded-2xl border border-white/10 overflow-hidden relative group">
                    <img
                        src={screenshot.imageUrl}
                        alt={screenshot.taskAtTheTime}
                        className="max-w-full max-h-full object-contain shadow-2xl"
                    />
                </div>
            </div>
        </div>
    );
}
