
import { useState, useEffect, useMemo } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { fetchDashboardUsers, type DashboardUser } from '../services/api';
import { Globe } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { DateFilterSelect } from '../components/ui/DateFilterSelect';

const COLORS = ["#2DD4BF", "#F87171", "#A78BFA", "#FBBF24", "#60A5FA", "#34D399"];

const BASE_URL = 'https://track.gallerydigital.in/api';

interface ActivityLog {
    id: string;
    userId: string;
    title: string;
    appName: string | null;
    url: string | null;
    startTime: string;
    endTime: string | null;
    duration: number | null;
    user?: {
        name: string;
        email: string;
    };
}

export const UNPRODUCTIVE_KEYWORDS = ['youtube', 'facebook', 'instagram', 'twitter', 'tiktok', 'netflix', 'reddit', 'whatsapp', 'telegram', 'discord'];

export function isUnproductive(log: { appName?: string | null, title?: string, url?: string | null }): boolean {
    const text = (`${log.appName || ''} ${log.title || ''} ${log.url || ''}`).toLowerCase();
    return UNPRODUCTIVE_KEYWORDS.some(kw => text.includes(kw));
}

export default function WebsitesView() {
    const [activities, setActivities] = useState<ActivityLog[]>([]);
    const [users, setUsers] = useState<DashboardUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<string>('ALL');
    const [dateFilter, setDateFilter] = useState<any>({ option: 'today', startDate: new Date().toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0] });
    const [filterUnproductive, setFilterUnproductive] = useState(false);
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
    const [visibleCount, setVisibleCount] = useState(20);
    const navigate = useNavigate();

    useEffect(() => {
        const loadInitial = async () => {
            const usersData = await fetchDashboardUsers();
            setUsers(usersData);
        };
        loadInitial();
    }, []);

    useEffect(() => {
        loadActivities();
        setVisibleCount(20);
    }, [selectedUser, dateFilter, sortOrder]);

    useEffect(() => {
        setVisibleCount(20);
    }, [filterUnproductive]);

    const loadActivities = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            // Since our backend endpoint is /api/activity/:userId, we need to handle "ALL" carefully.
            // If "ALL", ideally backend supports getting all.
            // Currently backend route is: router.get("/:userId", ...)
            // I should modify backend to support "ALL" or handle it here by iterating (bad perf).
            // Let's assume I can iterate or modify backend. 
            // Wait, I designed backend to take userId.
            // Modifying backend to support ALL is better.
            // For now, if "ALL", let's loop or pick first user? 
            // Loop is safer for MVP without backend change, but slow.
            // BUT, usually a specific "all-activity" route is best.
            // Let's try fetching for all users in parallel if selectedUser is ALL.

            let allLogs: ActivityLog[] = [];

            let currentUsers = users;
            const queryParams = `?startDate=${dateFilter.startDate}&endDate=${dateFilter.endDate}`;

            if (selectedUser === 'ALL') {
                if (users.length === 0) {
                    // Need users first
                    currentUsers = await fetchDashboardUsers();
                    setUsers(currentUsers);
                    const promises = currentUsers.map((user: any) =>
                        fetch(`${BASE_URL}/activity/${user.id}${queryParams}`, {
                            headers: { Authorization: `Bearer ${token}` }
                        }).then(r => r.json())
                    );
                    const results = await Promise.all(promises);
                    results.forEach((logs: any) => {
                        if (Array.isArray(logs)) allLogs = [...allLogs, ...logs];
                    });
                } else {
                    const promises = currentUsers.map(user =>
                        fetch(`${BASE_URL}/activity/${user.id}${queryParams}`, {
                            headers: { Authorization: `Bearer ${token}` }
                        }).then(r => r.json())
                    );
                    const results = await Promise.all(promises);
                    results.forEach((logs: any) => {
                        if (Array.isArray(logs)) allLogs = [...allLogs, ...logs];
                    });
                }
            } else {
                if (users.length === 0) {
                    currentUsers = await fetchDashboardUsers();
                    setUsers(currentUsers);
                }
                const res = await fetch(`${BASE_URL}/activity/${selectedUser}${queryParams}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    allLogs = await res.json();
                }
            }

            if (sortOrder === 'asc') {
                allLogs.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
            } else {
                allLogs.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
            }

            // Enrich with user data if missing (backend might not send included user)
            // Backend `include: { user: ... }` wasnt added in `activity.routes.ts`!
            // I should have added it. Front-end mapping fallback:
            const enriched = allLogs.map(log => ({
                ...log,
                user: currentUsers.find(u => u.id === log.userId) || { name: 'Unknown', email: '' }
            }));

            setActivities(enriched);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const formatDuration = (seconds: number | null) => {
        if (!seconds) return 'Active';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h > 0 ? `${h}h ` : ''}${m}m ${s}s`;
    };

    const topApps = useMemo(() => {
        const appMap = new Map<string, number>();
        const filtered = activities.filter(log => filterUnproductive ? isUnproductive(log) : true);

        filtered.forEach(log => {
            const name = log.appName || 'Unknown App';
            if (log.duration) {
                appMap.set(name, (appMap.get(name) || 0) + log.duration);
            }
        });

        return Array.from(appMap.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [activities, filterUnproductive]);

    const filteredActivities = activities.filter(log => filterUnproductive ? isUnproductive(log) : true);
    const hasMore = visibleCount < filteredActivities.length;
    const paginatedActivities = filteredActivities.slice(0, visibleCount);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mb-2">
                        Website Traffic
                    </h1>
                    <p className="text-muted-foreground">
                        Monitor visited websites and applications.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                    {/* Unproductive Toggle */}
                    <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl border border-white/10">
                        <span className="text-sm text-muted-foreground whitespace-nowrap">Show Unproductive</span>
                        <button
                            onClick={() => setFilterUnproductive(!filterUnproductive)}
                            className={`w-10 h-5 rounded-full transition-colors relative ${filterUnproductive ? 'bg-red-500' : 'bg-white/10'}`}
                        >
                            <span className={`block w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${filterUnproductive ? 'left-5' : 'left-1'}`} />
                        </button>
                    </div>
                    {/* User Filter */}
                    <div className="w-full sm:w-48 shrink-0 relative z-10">
                        <SearchableSelect
                            value={selectedUser}
                            onChange={(val) => setSelectedUser(val)}
                            options={[
                                { value: 'ALL', label: 'All Staff' },
                                ...users.map(u => ({ value: u.id, label: u.name }))
                            ]}
                        />
                    </div>

                    {/* Date Filter */}
                    <div className="relative z-10">
                        <DateFilterSelect
                            value={dateFilter}
                            onChange={(val) => setDateFilter(val)}
                        />
                    </div>

                    {/* Sort Filter */}
                    <div className="relative z-10 w-full sm:w-auto">
                        <select
                            className="w-full sm:w-36 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors appearance-none cursor-pointer"
                            value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
                        >
                            <option value="desc" className="bg-[#09090b]">Latest First</option>
                            <option value="asc" className="bg-[#09090b]">Oldest First</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Top Used Apps */}
            {topApps.length > 0 && (
                <GlassCard className="p-6">
                    <h2 className="text-xl font-semibold mb-6">Top Used Apps</h2>
                    <div className="flex flex-col md:flex-row gap-8 items-center h-auto md:h-64">
                        {/* Legend */}
                        <div className="flex-1 flex flex-col gap-3 w-full max-w-md">
                            {topApps.map((entry, index) => (
                                <div key={entry.name} className="flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all hover:scale-[1.02]" style={{ backgroundColor: `${COLORS[index % COLORS.length]}15`, borderColor: `${COLORS[index % COLORS.length]}30`, color: COLORS[index % COLORS.length] }}>
                                    <div
                                        className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm"
                                        style={{ backgroundColor: COLORS[index % COLORS.length], color: '#111' }}
                                    >
                                        {entry.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <span className="text-sm font-medium text-white/90 truncate">{entry.name}</span>
                                </div>
                            ))}
                        </div>
                        {/* Donut */}
                        <div className="flex-1 h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={topApps}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={80}
                                        outerRadius={110}
                                        paddingAngle={2}
                                        dataKey="value"
                                        stroke="none"
                                        cornerRadius={4}
                                    >
                                        {topApps.map((_entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value: any) => formatDuration(Number(value) || 0)}
                                        contentStyle={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                                        itemStyle={{ color: '#fff', fontWeight: 500 }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </GlassCard>
            )}

            {/* Content */}
            <GlassCard className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full table-fixed">
                        <thead>
                            <tr className="border-b border-white/10 text-left">
                                <th className="p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider" style={{ width: '20%' }}>User</th>
                                <th className="p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider" style={{ width: '50%' }}>Application / Title</th>
                                <th className="p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider" style={{ width: '15%' }}>Time</th>
                                <th className="p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider" style={{ width: '15%' }}>Duration</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="border-b border-white/5">
                                        <td className="p-4"><div className="h-4 w-24 bg-white/5 rounded animate-pulse" /></td>
                                        <td className="p-4"><div className="h-4 w-48 bg-white/5 rounded animate-pulse" /></td>
                                        <td className="p-4"><div className="h-4 w-16 bg-white/5 rounded animate-pulse" /></td>
                                        <td className="p-4"><div className="h-4 w-16 bg-white/5 rounded animate-pulse" /></td>
                                    </tr>
                                ))
                            ) : filteredActivities.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                                        No matching activity logs found.
                                    </td>
                                </tr>
                            ) : (
                                paginatedActivities.map((log) => {
                                    const unproductive = isUnproductive(log);
                                    return (
                                        <tr
                                            key={log.id}
                                            className={`border-b border-white/5 transition-colors cursor-pointer ${unproductive ? 'bg-red-500/10 hover:bg-red-500/20' : 'hover:bg-white/5'}`}
                                            onClick={() => {
                                                const date = new Date(log.startTime).toISOString().split('T')[0];
                                                const startTime = new Date(log.startTime).toISOString();
                                                const endMs = new Date(log.startTime).getTime() + (log.duration || 300) * 1000;
                                                const endTime = new Date(endMs).toISOString();
                                                navigate(`/screenshots?userId=${log.userId}&date=${date}&startTime=${startTime}&endTime=${endTime}`);
                                            }}
                                        >
                                            <td className="p-4 overflow-hidden">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="w-6 h-6 shrink-0 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary font-medium">
                                                        {log.user?.name.charAt(0)}
                                                    </div>
                                                    <span className="text-sm truncate">{log.user?.name}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 overflow-hidden">
                                                <div className="flex flex-col min-w-0">
                                                    <div className="flex items-center gap-2 overflow-hidden">
                                                        <span className="text-sm font-medium text-foreground truncate">{log.appName || 'Unknown App'}</span>
                                                        {log.url && (
                                                            <a href={log.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1 shrink-0">
                                                                <Globe size={10} />
                                                                Link
                                                            </a>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-muted-foreground truncate" title={log.title}>
                                                        {log.title}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm text-muted-foreground whitespace-nowrap">
                                                {new Date(log.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                                            </td>
                                            <td className="p-4">
                                                <Badge variant="glass" className="bg-white/5 text-xs">
                                                    {formatDuration(log.duration)}
                                                </Badge>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </GlassCard>

            {hasMore && (
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
