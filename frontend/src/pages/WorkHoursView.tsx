
import { useState, useEffect } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { type DashboardUser } from '../services/api';
import { Clock, BarChart, AlertTriangle, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DateFilterSelect } from '../components/ui/DateFilterSelect';

const BASE_URL = 'https://track.gallerydigital.in/api';

// Reusing TimeLog structure or fetching aggregated stats?
// Let's fetch raw time logs and aggregate on frontend for now, or use existing dashboard endpoint?
// existing GET /api/dashboard returns users WITH logs for "today".
// We want "Work Hours" view, possibly for ANY date range.
// Let's us fetch users, then for each user fetch their logs. Or better, a new route.
// But to save backend work, let's use `GET /api/time/logs` if it exists?
// We have `GET /api/time/today` (single user).
// We have `GET /api/dashboard` (all users, today).
// Let's just use `fetchDashboardUsers` which calls `GET /api/dashboard`. This gives us TODAY's logs.
// If we want filtering by date, `GET /api/dashboard` accepts ?date=...
// Yes! `dashboard.routes.ts` supports `date` query param.
// So we can reuse `fetchDashboardUsers` but we need to pass date.
// Update `api.ts` to accept date in `fetchDashboardUsers`.

interface TimeLog {
    id: string;
    type: 'START' | 'STOP' | 'BREAK_START' | 'BREAK_END';
    timestamp: string;
    currentTask: string;
}

interface UserWithLogs extends DashboardUser {
    timeLogs: TimeLog[];
}

export default function WorkHoursView() {
    const navigate = useNavigate();
    const [users, setUsers] = useState<UserWithLogs[]>([]);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState<any>({ option: 'today', startDate: new Date().toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0] });
    const [quickFilter, setQuickFilter] = useState<'ALL' | 'ABSENT' | 'LATE' | 'LOW_TIME' | 'OVER_WORKED' | 'CRITICAL' | 'HIGH_TO_LOW'>('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [visibleCount, setVisibleCount] = useState(20);

    useEffect(() => {
        setVisibleCount(20);
    }, [quickFilter, searchQuery, dateFilter]);

    useEffect(() => {
        loadData();
    }, [dateFilter]);

    const loadData = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const params = new URLSearchParams();
            params.append('startDate', dateFilter.startDate);
            params.append('endDate', dateFilter.endDate);

            const url = `${BASE_URL}/dashboard/users?${params.toString()}`;
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store'
            });
            if (res.ok) {
                const data = await res.json();
                setUsers(data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };



    const checkIsLate = (firstLogTime: string | null | undefined, expectedStart: string | null | undefined) => {
        if (!firstLogTime) return false;
        const expected = expectedStart || '09:00';
        const expectedParts = expected.split(':');
        const expectedMins = parseInt(expectedParts[0]) * 60 + parseInt(expectedParts[1]);

        const actualDate = new Date(firstLogTime);
        const actualMins = actualDate.getHours() * 60 + actualDate.getMinutes();

        return actualMins > expectedMins;
    };

    // Calculate derived data for filtering
    const processedUsers = users.map((user: any) => {
        const hours = user.totalHoursToday || 0;
        const totalTimeMs = hours * 3600000;

        const isAbsent = !user.firstStartTime;
        const isLate = checkIsLate(user.firstStartTime, user.expectedStartTime);
        const isLowTime = !isAbsent && hours < 4;
        const isOverWorked = !isAbsent && hours >= 9;
        const isCritical = isAbsent || isLate || isLowTime;

        return {
            ...user,
            totalTimeMs: user.totalCheckedInHoursToday !== undefined ? user.totalCheckedInHoursToday * 3600000 : totalTimeMs,
            workedMs: user.totalWorkedHoursToday !== undefined ? user.totalWorkedHoursToday * 3600000 : totalTimeMs,
            checkedInHours: user.totalCheckedInHoursToday !== undefined ? user.totalCheckedInHoursToday : hours,
            workedHours: user.totalWorkedHoursToday !== undefined ? user.totalWorkedHoursToday : hours,
            hours,
            firstLog: { timestamp: user.firstStartTime },
            isAbsent,
            isLate,
            isLowTime,
            isOverWorked,
            isCritical
        };
    });

    const filteredUsers = processedUsers.filter(user => {
        // Text Search Filter
        if (searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase();
            if (!user.name.toLowerCase().includes(query) && !user.email.toLowerCase().includes(query)) {
                return false;
            }
        }

        // Quick Category Filter
        if (quickFilter === 'ABSENT') return user.isAbsent;
        if (quickFilter === 'LATE') return user.isLate;
        if (quickFilter === 'LOW_TIME') return user.isLowTime;
        if (quickFilter === 'OVER_WORKED') return user.isOverWorked;
        if (quickFilter === 'CRITICAL') return user.isCritical;
        if (quickFilter === 'HIGH_TO_LOW') return true;

        return true;
    });

    if (quickFilter === 'HIGH_TO_LOW') {
        filteredUsers.sort((a, b) => b.workedHours - a.workedHours);
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mb-2">
                        Work Hours
                    </h1>
                    <p className="text-muted-foreground">
                        Daily working hours summary for all staff.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                    {/* Quick Filters */}
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 overflow-x-auto hide-scrollbar max-w-[calc(100vw-2rem)] sm:max-w-none">
                        <button
                            onClick={() => setQuickFilter('ALL')}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${quickFilter === 'ALL' ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            All Staff
                        </button>
                        <button
                            onClick={() => setQuickFilter('ABSENT')}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${quickFilter === 'ABSENT' ? 'bg-red-500 text-white shadow' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            Absent
                        </button>
                        <button
                            onClick={() => setQuickFilter('LATE')}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${quickFilter === 'LATE' ? 'bg-amber-500 text-white shadow' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            Late Checkins
                        </button>
                        <button
                            onClick={() => setQuickFilter('LOW_TIME')}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${quickFilter === 'LOW_TIME' ? 'bg-orange-500 text-white shadow' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            Low Time
                        </button>
                        <button
                            onClick={() => setQuickFilter('CRITICAL')}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${quickFilter === 'CRITICAL' ? 'bg-rose-600 text-white shadow flex items-center gap-1' : 'text-muted-foreground hover:text-foreground flex items-center gap-1'}`}
                        >
                            <AlertTriangle size={12} /> Critical
                        </button>
                        <button
                            onClick={() => setQuickFilter('HIGH_TO_LOW')}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${quickFilter === 'HIGH_TO_LOW' ? 'bg-indigo-500 text-white shadow' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            High to Low Hrs
                        </button>
                    </div>

                    {/* Search Filter */}
                    <div className="relative shrink-0 w-full sm:w-48">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                        <input
                            type="text"
                            placeholder="Search staff..."
                            className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Date Filter */}
                    <div className="relative shrink-0 z-10 w-full sm:w-auto">
                        <DateFilterSelect
                            value={dateFilter}
                            onChange={(val) => setDateFilter(val)}
                        />
                    </div>
                </div>
            </div>

            {/* Summary Stats Container */}
            {!loading && processedUsers.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-2">
                    <GlassCard
                        className={`p-4 flex flex-col justify-center items-center cursor-pointer transition-all duration-300 ${quickFilter === 'ABSENT' ? 'border-red-500/50 bg-red-500/10 shadow-[0_0_15px_rgba(239,68,68,0.15)]' : 'hover:border-red-500/30'}`}
                        onClick={() => setQuickFilter('ABSENT')}
                    >
                        <p className="text-sm font-medium text-muted-foreground mb-1">Absent Staff</p>
                        <p className="text-3xl font-bold text-red-500">{processedUsers.filter((u: any) => u.isAbsent).length}</p>
                    </GlassCard>
                    <GlassCard
                        className={`p-4 flex flex-col justify-center items-center cursor-pointer transition-all duration-300 ${quickFilter === 'LATE' ? 'border-amber-500/50 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.15)]' : 'hover:border-amber-500/30'}`}
                        onClick={() => setQuickFilter('LATE')}
                    >
                        <p className="text-sm font-medium text-muted-foreground mb-1">Late Check-ins</p>
                        <p className="text-3xl font-bold text-amber-500">{processedUsers.filter((u: any) => u.isLate && !u.isAbsent).length}</p>
                    </GlassCard>
                    <GlassCard
                        className={`p-4 flex flex-col justify-center items-center cursor-pointer transition-all duration-300 ${quickFilter === 'LOW_TIME' ? 'border-orange-500/50 bg-orange-500/10 shadow-[0_0_15px_rgba(249,115,22,0.15)]' : 'hover:border-orange-500/30'}`}
                        onClick={() => setQuickFilter('LOW_TIME')}
                    >
                        <p className="text-sm font-medium text-muted-foreground mb-1">Low Work Time</p>
                        <p className="text-3xl font-bold text-orange-500">{processedUsers.filter((u: any) => u.isLowTime && !u.isAbsent).length}</p>
                    </GlassCard>
                    <GlassCard
                        className={`p-4 flex flex-col justify-center items-center cursor-pointer transition-all duration-300 ${quickFilter === 'OVER_WORKED' ? 'border-purple-500/50 bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.15)]' : 'hover:border-purple-500/30'}`}
                        onClick={() => setQuickFilter('OVER_WORKED')}
                    >
                        <p className="text-sm font-medium text-muted-foreground mb-1">Overworked (&gt;9h)</p>
                        <p className="text-3xl font-bold text-purple-500">{processedUsers.filter((u: any) => u.isOverWorked).length}</p>
                    </GlassCard>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-48 rounded-2xl bg-white/5 animate-pulse" />
                    ))
                ) : filteredUsers.length === 0 ? (
                    <div className="col-span-full text-center p-12 text-muted-foreground">No records found.</div>
                ) : (
                    filteredUsers.slice(0, visibleCount).map(user => {
                        const h = Math.floor(user.totalTimeMs / 3600000);
                        const m = Math.floor((user.totalTimeMs % 3600000) / 60000);
                        const totalTimeStr = `${h}h ${m}m`;

                        const wh = Math.floor(user.workedMs / 3600000);
                        const wm = Math.floor((user.workedMs % 3600000) / 60000);
                        const workedTimeStr = `${wh}h ${wm}m`;

                        const startTime = user.firstLog ? new Date(user.firstLog.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '-';

                        return (
                            <GlassCard
                                key={user.id}
                                className="flex flex-col gap-4 cursor-pointer hover:scale-[1.02] transition-transform duration-200 hover:border-white/20"
                                onClick={() => navigate(`/user/${user.id}`)}
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center text-primary font-bold">
                                            {user.name.charAt(0)}
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">{user.name}</h3>
                                            <p className="text-xs text-muted-foreground">{user.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <Badge variant="glass" className="bg-primary/10 text-primary border-primary/20 text-[10px]" title="Worked Hours">
                                            {workedTimeStr} (Worked)
                                        </Badge>
                                        <Badge variant="glass" className="bg-white/5 text-muted-foreground border-white/10 text-[10px]" title="Checked In Hours">
                                            {totalTimeStr} (Checked In)
                                        </Badge>
                                        {user.isAbsent && <Badge variant="glass" className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px]">Absent</Badge>}
                                        {user.isLate && !user.isAbsent && <Badge variant="glass" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]">Late Checkin</Badge>}
                                        {user.isLowTime && !user.isAbsent && <Badge variant="glass" className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px]">Low Hours</Badge>}
                                        {user.isOverWorked && !user.isAbsent && <Badge variant="glass" className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-[10px]">Overworked</Badge>}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mt-2">
                                    <div className="bg-white/5 rounded-xl p-3">
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                            <Clock size={12} />
                                            Started
                                        </div>
                                        <div className="text-sm font-medium">{startTime}</div>
                                    </div>
                                    <div className="bg-white/5 rounded-xl p-3">
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                            <BarChart size={12} />
                                            Logs
                                        </div>
                                        <div className="text-sm font-medium">{user.isAbsent ? 'Absent' : 'Present'}</div>
                                    </div>
                                </div>
                            </GlassCard>
                        );
                    })
                )}
            </div>

            {visibleCount < filteredUsers.length && (
                <div className="flex justify-center mt-6 py-4">
                    <button
                        onClick={() => setVisibleCount(prev => prev + 20)}
                        className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors flex items-center justify-center gap-2 text-sm text-foreground active:scale-95"
                    >
                        Load More
                    </button>
                </div>
            )}
        </div>
    );
}
