import { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

export type DateFilterOption = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'last7days' | 'last30days' | 'custom';

export interface DateRange {
    option: DateFilterOption;
    startDate: string;
    endDate: string;
}

interface DateFilterSelectProps {
    value: DateRange;
    onChange: (val: DateRange) => void;
}

const PRESETS: { key: DateFilterOption; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'thisWeek', label: 'This Week' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'thisMonth', label: 'This Month' },
    { key: 'last7days', label: 'Last 7 Days' },
    { key: 'lastMonth', label: 'Last Month' },
    { key: 'lastWeek', label: 'Last Week' },
    { key: 'custom', label: 'Custom' },
];

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function DateFilterSelect({ value, onChange }: DateFilterSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const [tempValue, setTempValue] = useState<DateRange>(value);

    // Calendar view state
    const [viewDate, setViewDate] = useState(new Date());

    useEffect(() => {
        if (isOpen) {
            setTempValue(value);
            if (value.startDate) {
                setViewDate(new Date(value.startDate));
            } else {
                setViewDate(new Date());
            }
        }
    }, [isOpen, value]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getFormattedDate = (date: Date) => {
        // Handle timezone offset to get local YYYY-MM-DD
        const offset = date.getTimezoneOffset();
        const adjustedDate = new Date(date.getTime() - (offset * 60 * 1000));
        return adjustedDate.toISOString().split('T')[0];
    };

    const handlePresetSelect = (opt: DateFilterOption) => {
        const today = new Date();
        const getRelativeDate = (daysAgo: number) => {
            const d = new Date(today);
            d.setDate(d.getDate() - daysAgo);
            return getFormattedDate(d);
        };

        let start = getFormattedDate(today);
        let end = getFormattedDate(today);

        switch (opt) {
            case 'today':
                break;
            case 'yesterday':
                start = getRelativeDate(1);
                end = getRelativeDate(1);
                break;
            case 'thisWeek': {
                const day = today.getDay();
                const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday start
                const startOfWeek = new Date(today);
                startOfWeek.setDate(diff);
                start = getFormattedDate(startOfWeek);
                break;
            }
            case 'lastWeek': {
                const day = today.getDay();
                const diffToStartOfThisWeek = today.getDate() - day + (day === 0 ? -6 : 1);

                const startOfLastWeek = new Date(today);
                startOfLastWeek.setDate(diffToStartOfThisWeek - 7);
                start = getFormattedDate(startOfLastWeek);

                const endOfLastWeek = new Date(today);
                endOfLastWeek.setDate(diffToStartOfThisWeek - 1);
                end = getFormattedDate(endOfLastWeek);
                break;
            }
            case 'thisMonth': {
                const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                start = getFormattedDate(startOfMonth);
                break;
            }
            case 'lastMonth': {
                const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                start = getFormattedDate(startOfLastMonth);
                end = getFormattedDate(endOfLastMonth);
                break;
            }
            case 'last7days':
                start = getRelativeDate(6);
                break;
            case 'last30days':
                start = getRelativeDate(29);
                break;
            case 'custom':
                start = tempValue.startDate || getFormattedDate(today);
                end = tempValue.endDate || getFormattedDate(today);
                break;
        }

        setTempValue({ option: opt, startDate: start, endDate: end });
        setViewDate(new Date(start));
    };

    const handleCalendarDayClick = (dateStr: string) => {
        if (tempValue.option !== 'custom') {
            setTempValue({ option: 'custom', startDate: dateStr, endDate: dateStr });
            return;
        }

        const currentStart = new Date(tempValue.startDate).getTime();
        const currentEnd = new Date(tempValue.endDate).getTime();
        const clickedTime = new Date(dateStr).getTime();

        if (currentStart === currentEnd) {
            if (clickedTime < currentStart) {
                setTempValue({ ...tempValue, startDate: dateStr });
            } else {
                setTempValue({ ...tempValue, endDate: dateStr });
            }
        } else {
            // Reset to a new start date if a range is already selected
            setTempValue({ ...tempValue, startDate: dateStr, endDate: dateStr });
        }
    };

    const handleApply = () => {
        onChange(tempValue);
        setIsOpen(false);
    };

    const handleCancel = () => {
        setIsOpen(false);
    };

    const calendarGrid = useMemo(() => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const grid: { date: string; day: number; isCurrentMonth: boolean }[] = [];

        // Pervious month padding
        const prevMonthDays = new Date(year, month, 0).getDate();
        for (let i = firstDayOfMonth - 1; i >= 0; i--) {
            const d = prevMonthDays - i;
            grid.push({
                date: getFormattedDate(new Date(year, month - 1, d)),
                day: d,
                isCurrentMonth: false
            });
        }

        // Current month
        for (let i = 1; i <= daysInMonth; i++) {
            grid.push({
                date: getFormattedDate(new Date(year, month, i)),
                day: i,
                isCurrentMonth: true
            });
        }

        // Next month padding
        const remainingCells = 42 - grid.length; // 6 rows of 7
        for (let i = 1; i <= remainingCells; i++) {
            grid.push({
                date: getFormattedDate(new Date(year, month + 1, i)),
                day: i,
                isCurrentMonth: false
            });
        }

        return grid;
    }, [viewDate]);

    const isDateInRange = (dateStr: string) => {
        const d = new Date(dateStr).getTime();
        const s = new Date(tempValue.startDate).getTime();
        const e = new Date(tempValue.endDate).getTime();
        return d >= s && d <= e;
    };

    const isDateStartOrEnd = (dateStr: string) => {
        return dateStr === tempValue.startDate || dateStr === tempValue.endDate;
    };

    const getLabel = () => {
        const preset = PRESETS.find(p => p.key === value.option);
        if (preset && value.option !== 'custom') return preset.label;
        if (value.startDate === value.endDate) return value.startDate;
        return `${value.startDate} - ${value.endDate}`;
    };

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full sm:w-56 pl-9 pr-8 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors flex items-center justify-between shadow-sm"
            >
                <Calendar className="absolute left-3 text-muted-foreground" size={16} />
                <span className="truncate">{getLabel()}</span>
                <ChevronDown className="absolute right-3 text-muted-foreground" size={16} />
            </button>

            {isOpen && (
                <div className="absolute top-full mt-2 right-0 sm:right-0 sm:left-auto bg-[#ffffff] dark:bg-[#1a1b1e] border border-gray-200 dark:border-white/10 rounded-2xl shadow-xl z-50 flex flex-col sm:flex-row text-gray-900 dark:text-foreground text-sm font-medium w-max max-w-[90vw] overflow-y-auto max-h-[80vh]">

                    {/* Left Panel: Calendar Grid */}
                    <div className="p-4 border-b sm:border-b-0 sm:border-r border-gray-200 dark:border-white/10 w-full sm:w-[280px]">
                        <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm">
                            <div className="flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-black/20 border-b border-gray-200 dark:border-white/10">
                                <button
                                    onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
                                    className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-colors"
                                >
                                    <ChevronLeft size={16} className="text-gray-500 dark:text-gray-400" />
                                </button>
                                <div className="font-semibold text-gray-800 dark:text-gray-200 text-sm">
                                    {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                                </div>
                                <button
                                    onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
                                    className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-colors"
                                >
                                    <ChevronRight size={16} className="text-gray-500 dark:text-gray-400" />
                                </button>
                            </div>

                            <div className="grid grid-cols-7 gap-0 p-2 text-center text-xs">
                                {DAYS.map(d => (
                                    <div key={d} className="text-gray-500 dark:text-gray-400 font-medium py-1">{d}</div>
                                ))}
                                {calendarGrid.map((cell, idx) => {
                                    const inRange = isDateInRange(cell.date);
                                    const isEdge = isDateStartOrEnd(cell.date);
                                    return (
                                        <button
                                            key={`${cell.date}-${idx}`}
                                            onClick={() => handleCalendarDayClick(cell.date)}
                                            className={`
                                                relative h-8 flex items-center justify-center
                                                ${!cell.isCurrentMonth ? 'text-gray-400 dark:text-gray-600' : 'text-gray-700 dark:text-gray-300'}
                                                ${inRange && !isEdge ? 'bg-blue-50 dark:bg-primary/20' : ''}
                                                ${isEdge ? 'bg-primary text-white font-semibold rounded-md shadow-md z-10' : 'hover:bg-gray-100 dark:hover:bg-white/10 rounded-md'}
                                                 transition-all duration-150
                                            `}
                                        >
                                            {cell.day}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: Options & Actions */}
                    <div className="p-4 flex flex-col justify-between w-full sm:w-[320px] bg-white dark:bg-transparent">
                        <div>
                            <div className="text-gray-500 dark:text-gray-400 mb-3 ml-1 text-sm font-semibold">Filter by Period</div>
                            <div className="grid grid-cols-2 gap-2">
                                {PRESETS.map((preset) => {
                                    const isActive = tempValue.option === preset.key;
                                    return (
                                        <button
                                            key={preset.key}
                                            onClick={() => handlePresetSelect(preset.key)}
                                            className={`
                                                px-3 py-1.5 rounded-full border text-sm transition-all text-center
                                                ${isActive
                                                    ? 'bg-primary/10 border-primary text-primary shadow-sm font-semibold'
                                                    : 'bg-white dark:bg-transparent border-gray-300 dark:border-white/20 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-white/40'}
                                            `}
                                        >
                                            {preset.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 mt-6">
                            <button
                                onClick={handleCancel}
                                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-white/20 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors font-semibold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleApply}
                                className="px-4 py-2 rounded-lg bg-primary text-white shadow-md hover:bg-primary/90 transition-all font-semibold"
                            >
                                Apply
                            </button>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}
