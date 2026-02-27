
import { useState, useEffect } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { fetchDashboardUsers, type DashboardUser } from '../services/api';
import { Globe, User, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [filterUnproductive, setFilterUnproductive] = useState(false);
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
    }, [selectedUser, selectedDate]);

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

            if (selectedUser === 'ALL') {
                if (users.length === 0) {
                    // Need users first
                    currentUsers = await fetchDashboardUsers();
                    setUsers(currentUsers);
                    const promises = currentUsers.map((user: any) =>
                        fetch(`${BASE_URL}/activity/${user.id}${selectedDate ? `?date=${selectedDate}` : ''}`, {
                            headers: { Authorization: `Bearer ${token}` }
                        }).then(r => r.json())
                    );
                    const results = await Promise.all(promises);
                    results.forEach((logs: any) => {
                        if (Array.isArray(logs)) allLogs = [...allLogs, ...logs];
                    });
                } else {
                    const promises = currentUsers.map(user =>
                        fetch(`${BASE_URL}/activity/${user.id}${selectedDate ? `?date=${selectedDate}` : ''}`, {
                            headers: { Authorization: `Bearer ${token}` }
                        }).then(r => r.json())
                    );
                    const results = await Promise.all(promises);
                    results.forEach((logs: any) => {
                        if (Array.isArray(logs)) allLogs = [...allLogs, ...logs];
                    });
                }

                // sort by startTime desc
                allLogs.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

            } else {
                if (users.length === 0) {
                    currentUsers = await fetchDashboardUsers();
                    setUsers(currentUsers);
                }
                const res = await fetch(`${BASE_URL}/activity/${selectedUser}${selectedDate ? `?date=${selectedDate}` : ''}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    allLogs = await res.json();
                }
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
                    <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                        <select
                            className="w-full sm:w-48 pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors appearance-none cursor-pointer"
                            value={selectedUser}
                            onChange={(e) => setSelectedUser(e.target.value)}
                        >
                            <option value="ALL" className="bg-[#09090b]">All Staff</option>
                            {users.map(u => (
                                <option key={u.id} value={u.id} className="bg-[#09090b]">{u.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Date Filter */}
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                        <input
                            type="date"
                            className="w-full sm:w-40 pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors cursor-pointer"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                        />
                    </div>
                </div>
            </div>

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
                            ) : activities.filter(log => filterUnproductive ? isUnproductive(log) : true).length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                                        No matching activity logs found.
                                    </td>
                                </tr>
                            ) : (
                                activities.filter(log => filterUnproductive ? isUnproductive(log) : true).map((log) => {
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
        </div>
    );
}
