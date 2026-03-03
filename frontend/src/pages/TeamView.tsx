import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { fetchDashboardUsers, type DashboardUser, type UserStatus } from '../services/api';
import { GlassCard, SkeletonGlassCard } from '../components/ui/GlassCard';
import { Badge, StatusDot } from '../components/ui/Badge';

const STATUS_VARIANTS: Record<UserStatus, 'success' | 'warning' | 'outline' | 'info'> = {
    Working: 'success',
    'On Break': 'warning',
    Offline: 'outline',
    Online: 'info',
};

function Avatar({ name, status }: { name: string; status: UserStatus }) {
    const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

    return (
        <div className="relative">
            <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-base font-bold text-white shadow-lg"
                style={{ background: 'linear-gradient(135deg, var(--color-primary), #8b5cf6)' }}
            >
                {initials}
            </div>
            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#18181b] flex items-center justify-center ${status === 'Working' ? 'bg-green-500' :
                status === 'On Break' ? 'bg-yellow-500' :
                    status === 'Online' ? 'bg-blue-500' : 'bg-gray-500'
                }`}>
                {status === 'Working' && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
            </div>
        </div>
    );
}

function UserCard({ user, onClick }: { user: DashboardUser; onClick: () => void }) {
    const now = new Date();
    const isLate = user.totalHoursToday === 0 && user.status !== 'Working' && now.getHours() >= 10 && now.getHours() < 13;
    const isAbsent = user.totalHoursToday === 0 && user.status !== 'Working' && now.getHours() >= 13;

    return (
        <GlassCard
            onClick={onClick}
            hoverEffect={true}
            className={`cursor-pointer group h-full flex flex-col relative overflow-hidden transition-all ${isAbsent ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : isLate ? 'border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : ''}`}
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-4 z-10 relative">
                <Avatar name={user.name} status={user.status} />
                <div className="flex flex-col items-end gap-2">
                    <Badge variant={STATUS_VARIANTS[user.status] || 'outline'}>
                        <StatusDot className={user.status === 'Working' ? 'animate-pulse bg-current' : 'bg-current'} />
                        {user.status || 'Unknown'}
                    </Badge>
                    {isAbsent && <Badge variant="outline" className="text-red-400 border-red-500/30 bg-red-500/10 text-[10px] py-0">Absent</Badge>}
                    {isLate && <Badge variant="outline" className="text-amber-400 border-amber-500/30 bg-amber-500/10 text-[10px] py-0">Late Check-in</Badge>}
                </div>
            </div>

            {/* Name & Role */}
            <div className="mb-4 z-10 relative">
                <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors">
                    {user.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                    {user.role}
                </p>
            </div>

            {/* Current Task */}
            <div className="mt-auto z-10 relative">
                {user.currentTask ? (
                    <div className="p-3 rounded-lg bg-white/5 border border-white/5 mb-4">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-primary mb-1">
                            Current Task
                        </span>
                        <span className="text-sm text-gray-300 line-clamp-2 leading-relaxed">
                            {user.currentTask}
                        </span>
                    </div>
                ) : (
                    <div className="h-[74px] mb-4 flex items-center justify-center rounded-lg border border-dashed border-white/10 text-muted-foreground text-xs">
                        No active task
                    </div>
                )}

                {/* Footer */}
                <div className="flex items-end justify-between border-t border-white/5 pt-3">
                    <div className="w-full">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Today's Activity</p>
                        <div className="flex items-center justify-between">
                            <div className="flex gap-4">
                                <div>
                                    <p className="text-xl font-bold text-foreground leading-none">
                                        {user.totalWorkedHoursToday !== undefined ? user.totalWorkedHoursToday.toFixed(1) : user.totalHoursToday.toFixed(1)}
                                        <span className="text-sm font-medium text-muted-foreground ml-1">h</span>
                                    </p>
                                    <p className="text-[9px] text-muted-foreground uppercase mt-1 tracking-wider">Worked</p>
                                </div>
                                <div className="w-px bg-white/10 h-8 self-center" />
                                <div>
                                    <p className="text-xl font-bold text-foreground leading-none">
                                        {user.totalCheckedInHoursToday !== undefined ? user.totalCheckedInHoursToday.toFixed(1) : user.totalHoursToday.toFixed(1)}
                                        <span className="text-sm font-medium text-muted-foreground ml-1">h</span>
                                    </p>
                                    <p className="text-[9px] text-muted-foreground uppercase mt-1 tracking-wider">Checked In</p>
                                </div>
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0 text-primary">
                                →
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/10 transition-colors pointer-events-none" />
        </GlassCard>
    );
}

export default function TeamView() {
    const [users, setUsers] = useState<DashboardUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
    const [statusFilter, setStatusFilter] = useState<UserStatus | 'All' | 'Critical' | 'Late' | 'Absent'>('All');
    const [sortBy, setSortBy] = useState<'hours-asc' | 'hours-desc' | 'name-asc'>('name-asc');
    const [searchQuery, setSearchQuery] = useState('');
    const [visibleCount, setVisibleCount] = useState(20);
    const navigate = useNavigate();

    useEffect(() => {
        setVisibleCount(20);
    }, [searchQuery, statusFilter, sortBy]);

    const load = useCallback(async () => {
        try {
            const data = await fetchDashboardUsers();
            setUsers(data);
            setLastUpdate(new Date());
            setError(null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const interval = setInterval(load, 30_000); // Refresh every 30s
        return () => clearInterval(interval);
    }, [load]);

    const isLate = (u: DashboardUser) => {
        if (!u.expectedStartTime) return false;

        const expected = u.expectedStartTime.split(':').map(Number);
        const expectedTimeMins = expected[0] * 60 + expected[1];

        if (u.firstStartTime) {
            const actual = new Date(u.firstStartTime);
            const actualMins = actual.getHours() * 60 + actual.getMinutes();
            return actualMins > expectedTimeMins + 5; // adding 5 mins grace period
        } else {
            const now = new Date();
            const nowMins = now.getHours() * 60 + now.getMinutes();
            return nowMins > expectedTimeMins + 5;
        }
    };

    const working = users.filter((u) => u.status === 'Working').length;
    const onBreak = users.filter((u) => u.status === 'On Break').length;
    const online = users.filter((u) => u.status === 'Online').length;
    const offline = users.filter((u) => u.status === 'Offline').length;
    const critical = users.filter((u) => u.totalHoursToday < 7).length;
    const lateCount = users.filter(isLate).length;
    const absentCount = users.filter((u) => !u.firstStartTime && u.status !== 'Working').length;

    const handleFilterClick = (status: UserStatus | 'Critical' | 'Late' | 'Absent') => {
        setStatusFilter(prev => prev === status ? 'All' : status);
    };

    let filteredUsers = [...users];
    if (statusFilter === 'Critical') {
        filteredUsers = filteredUsers.filter((u) => u.totalHoursToday < 7);
    } else if (statusFilter === 'Late') {
        filteredUsers = filteredUsers.filter(isLate);
    } else if (statusFilter === 'Absent') {
        filteredUsers = filteredUsers.filter((u) => !u.firstStartTime && u.status !== 'Working');
    } else if (statusFilter !== 'All') {
        filteredUsers = filteredUsers.filter((u) => u.status === statusFilter);
    }

    if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        filteredUsers = filteredUsers.filter((u) =>
            u.name.toLowerCase().includes(query) ||
            u.email.toLowerCase().includes(query)
        );
    }

    const exportToCSV = () => {
        const headers = ["Name", "Email", "Role", "Status", "Current Task", "Hours Today"];
        const rows = filteredUsers.map(u => [
            u.name,
            u.email,
            u.role,
            u.status,
            u.currentTask || "None",
            u.totalHoursToday.toFixed(2)
        ]);
        const csvContent = [headers.join(","), ...rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(","))].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `team_report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (sortBy === 'hours-asc') {
        filteredUsers.sort((a, b) => (a.totalWorkedHoursToday ?? a.totalHoursToday) - (b.totalWorkedHoursToday ?? b.totalHoursToday));
    } else if (sortBy === 'hours-desc') {
        filteredUsers.sort((a, b) => (b.totalWorkedHoursToday ?? b.totalHoursToday) - (a.totalWorkedHoursToday ?? a.totalHoursToday));
    } else {
        filteredUsers.sort((a, b) => a.name.localeCompare(b.name));
    }

    return (
        <div className="space-y-8">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mb-2">
                        Team Overview
                    </h1>
                    <p className="text-muted-foreground">
                        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    {statusFilter !== 'All' && (
                        <button
                            onClick={() => setStatusFilter('All')}
                            className="text-sm text-muted-foreground hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10"
                        >
                            Clear Filter
                        </button>
                    )}

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 h-4 w-4" />
                        <input
                            type="text"
                            placeholder="Search team..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full sm:w-64 appearance-none bg-black/20 border border-white/10 hover:border-white/20 rounded-xl pl-10 pr-4 py-1.5 text-sm font-medium text-foreground focus:outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground/50"
                        />
                    </div>

                    <div className="relative">
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className="appearance-none bg-black/20 border border-white/10 hover:border-white/20 rounded-xl px-4 py-1.5 text-sm font-medium text-foreground focus:outline-none focus:border-primary/50 transition-all cursor-pointer pr-8"
                        >
                            <option value="name-asc" className="bg-[#18181b]">Sort: Name (A-Z)</option>
                            <option value="hours-desc" className="bg-[#18181b]">Sort: Hours (High to Low)</option>
                            <option value="hours-asc" className="bg-[#18181b]">Sort: Hours (Low to High)</option>
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground/50 text-xs">
                            ▼
                        </div>
                    </div>

                    <button
                        onClick={exportToCSV}
                        className="text-sm font-semibold bg-primary hover:bg-primary/80 text-white transition-colors px-4 py-1.5 rounded-lg shadow shadow-primary/20 flex items-center gap-2"
                    >
                        <span>⬇</span> Export CSV
                    </button>

                    <Badge variant="glass" className="self-start md:self-auto py-1.5 px-3">
                        <StatusDot className="bg-green-500 animate-pulse" />
                        Live · Updated {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </Badge>
                </div>
            </div>

            {/* Stats bar */}
            {!loading && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
                    <GlassCard
                        className={`flex items-center justify-between p-6 cursor-pointer transition-all duration-300 ${statusFilter === 'Working' ? 'border-green-500/50 bg-green-500/10' : 'hover:border-green-500/30'}`}
                        onClick={() => handleFilterClick('Working')}
                    >
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1">Working Now</p>
                            <p className="text-3xl font-bold text-green-400">{working}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-500">
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                            </span>
                        </div>
                    </GlassCard>

                    <GlassCard
                        className={`flex items-center justify-between p-6 cursor-pointer transition-all duration-300 ${statusFilter === 'On Break' ? 'border-yellow-500/50 bg-yellow-500/10' : 'hover:border-yellow-500/30'}`}
                        onClick={() => handleFilterClick('On Break')}
                    >
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1">On Break</p>
                            <p className="text-3xl font-bold text-yellow-400">{onBreak}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-500">
                            ☕
                        </div>
                    </GlassCard>

                    <GlassCard
                        className={`flex items-center justify-between p-6 cursor-pointer transition-all duration-300 ${statusFilter === 'Online' ? 'border-blue-500/50 bg-blue-500/10' : 'hover:border-blue-500/30'}`}
                        onClick={() => handleFilterClick('Online')}
                    >
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1">Online</p>
                            <p className="text-3xl font-bold text-blue-400">{online}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                            <span className="relative flex h-3 w-3">
                                <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                            </span>
                        </div>
                    </GlassCard>

                    <GlassCard
                        className={`flex items-center justify-between p-6 cursor-pointer transition-all duration-300 ${statusFilter === 'Offline' ? 'border-gray-500/50 bg-gray-500/10' : 'hover:border-gray-500/30'}`}
                        onClick={() => handleFilterClick('Offline')}
                    >
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1">Offline</p>
                            <p className="text-3xl font-bold text-gray-400">{offline}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400">
                            💤
                        </div>
                    </GlassCard>

                    <GlassCard
                        className={`flex items-center justify-between p-6 cursor-pointer transition-all duration-300 ${statusFilter === 'Critical' ? 'border-red-500/50 bg-red-500/10' : 'hover:border-red-500/30'}`}
                        onClick={() => handleFilterClick('Critical')}
                    >
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <p className="text-sm font-medium text-muted-foreground">Critical</p>
                                <span className="px-1.5 py-0.5 rounded-full bg-red-500/10 text-[10px] font-bold text-red-400 border border-red-500/20">&lt; 7h</span>
                            </div>
                            <p className="text-3xl font-bold text-red-400">{critical}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                            ⚠️
                        </div>
                    </GlassCard>

                    <GlassCard
                        className={`flex items-center justify-between p-6 cursor-pointer transition-all duration-300 ${statusFilter === 'Late' ? 'border-orange-500/50 bg-orange-500/10' : 'hover:border-orange-500/30'}`}
                        onClick={() => handleFilterClick('Late')}
                    >
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1">Late Check-ins</p>
                            <p className="text-3xl font-bold text-orange-400">{lateCount}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500">
                            ⏱️
                        </div>
                    </GlassCard>

                    <GlassCard
                        className={`flex items-center justify-between p-6 cursor-pointer transition-all duration-300 ${statusFilter === 'Absent' ? 'border-red-500/50 bg-red-500/10' : 'hover:border-red-500/30'}`}
                        onClick={() => handleFilterClick('Absent')}
                    >
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1">Absent</p>
                            <p className="text-3xl font-bold text-red-500">{absentCount}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                            🚷
                        </div>
                    </GlassCard>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="rounded-xl p-4 text-sm border border-red-500/30 bg-red-500/10 text-red-300 flex items-center gap-3">
                    <span className="text-lg">⚠️</span>
                    {error} — Make sure the backend is running on port 4000.
                </div>
            )}

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {loading
                    ? Array.from({ length: 6 }).map((_, i) => <SkeletonGlassCard key={i} />)
                    : filteredUsers.slice(0, visibleCount).map((user) => (
                        <UserCard key={user.id} user={user} onClick={() => navigate(`/user/${user.id}`)} />
                    ))}
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

            {!loading && filteredUsers.length === 0 && !error && (
                <div className="text-center py-24 text-muted-foreground">
                    <p className="text-6xl mb-4 opacity-50">👥</p>
                    <p className="text-xl font-medium mb-2 text-foreground">
                        {statusFilter === 'All'
                            ? 'No team members yet'
                            : statusFilter === 'Critical'
                                ? 'No users with critical hours (< 7h)'
                                : `No users are currently ${statusFilter}`
                        }
                    </p>
                    {statusFilter === 'All' && <p className="text-sm">Run the seed script to add mock data.</p>}
                </div>
            )}
        </div>
    );
}
