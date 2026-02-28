import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

export type DateFilterOption = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'custom';

export interface DateRange {
    option: DateFilterOption;
    startDate: string;
    endDate: string;
}

interface DateFilterSelectProps {
    value: DateRange;
    onChange: (val: DateRange) => void;
}

export function DateFilterSelect({ value, onChange }: DateFilterSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const getFormattedDate = (daysAgo: number) => {
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        return d.toISOString().split('T')[0];
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleOptionSelect = (option: DateFilterOption) => {
        const today = getFormattedDate(0);
        let startDate = today;
        let endDate = today;

        if (option === 'yesterday') {
            const yesterday = getFormattedDate(1);
            startDate = yesterday;
            endDate = yesterday;
        } else if (option === 'last7days') {
            startDate = getFormattedDate(7);
        } else if (option === 'last30days') {
            startDate = getFormattedDate(30);
        }

        if (option !== 'custom') {
            onChange({ option, startDate, endDate });
            setIsOpen(false);
        } else {
            // Initialize custom with today if currently not custom
            if (value.option !== 'custom') {
                onChange({ option, startDate: today, endDate: today });
            } else {
                onChange({ option, startDate: value.startDate, endDate: value.startDate });
            }
        }
    };

    const handleCustomDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const date = e.target.value;
        onChange({ option: 'custom', startDate: date, endDate: date });
    };

    const getLabel = () => {
        if (value.option === 'today') return 'Today';
        if (value.option === 'yesterday') return 'Yesterday';
        if (value.option === 'last7days') return 'Last 7 Days';
        if (value.option === 'last30days') return 'Last 30 Days';
        return value.startDate || 'Custom Date';
    };

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full sm:w-48 pl-9 pr-8 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors flex items-center justify-between"
            >
                <Calendar className="absolute left-3 text-muted-foreground" size={16} />
                <span className="truncate">{getLabel()}</span>
                <ChevronDown className="absolute right-3 text-muted-foreground" size={16} />
            </button>

            {isOpen && (
                <div className="absolute top-full mt-2 w-full sm:w-48 bg-[#1a1b1e] border border-white/10 rounded-xl shadow-lg z-50 overflow-hidden">
                    <div className="py-2">
                        {['today', 'yesterday', 'last7days', 'last30days', 'custom'].map((opt) => (
                            <div key={opt}>
                                <button
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-white/5 transition-colors ${value.option === opt ? 'text-primary bg-primary/10' : 'text-foreground'}`}
                                    onClick={() => handleOptionSelect(opt as DateFilterOption)}
                                >
                                    {opt === 'today' && 'Today'}
                                    {opt === 'yesterday' && 'Yesterday'}
                                    {opt === 'last7days' && 'Last 7 Days'}
                                    {opt === 'last30days' && 'Last 30 Days'}
                                    {opt === 'custom' && 'Custom Date'}
                                </button>
                                {opt === 'custom' && value.option === 'custom' && (
                                    <div className="px-4 py-2 bg-black/20">
                                        <input
                                            type="date"
                                            className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                                            value={value.startDate}
                                            onChange={handleCustomDateChange}
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
