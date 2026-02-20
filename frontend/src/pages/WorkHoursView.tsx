
import { useState, useEffect } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { fetchDashboardUsers, type DashboardUser } from '../services/api'; // Reuse existing API
import { User, Calendar, Clock, BarChart } from 'lucide-react';

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
    const [users, setUsers] = useState<UserWithLogs[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState<string>('');

    useEffect(() => {
        loadData();
    }, [selectedDate]);

    const loadData = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            // Manual fetch to pass date param since api.ts wrapper might not support it yet
            // Wait, api.ts `fetchDashboardUsers` does NOT take arguments usually.
            // Let's assume I check api.ts or just use fetch directly.
            const url = `${BASE_URL}/dashboard${selectedDate ? `?date=${selectedDate}` : ''}`;
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
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

    // Helper to calculate total hours from logs
    const calculateTotalTime = (logs: TimeLog[]) => {
        // This logic mimics the one in UserDetailView or Dashboard
        // Simple approximation: Sum (STOP - START) durations
        // Or state machine replay. 
        // For simplicity, let's just show "First Start" and "Last Stop" and "Approx Duration".
        // Better: Reuse the calculation logic if available.
        // Assuming strict pairs: START -> STOP/BREAK.

        let total = 0;
        let lastStart: number | null = null;

        // logs are typically desc or asc? Dashboard route orders logs by timestamp desc.
        // We need asc for replay.
        const sorted = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        for (const log of sorted) {
            const time = new Date(log.timestamp).getTime();
            if (log.type === 'START' || log.type === 'BREAK_END') {
                if (lastStart === null) lastStart = time;
            } else if (log.type === 'STOP' || log.type === 'BREAK_START') {
                if (lastStart !== null) {
                    total += (time - lastStart);
                    lastStart = null;
                }
            }
        }
        // If still ongoing?
        if (lastStart !== null) {
            // total += (Date.now() - lastStart); // Only if today?
            // Don't add live time for historical dates.
            if (!selectedDate || selectedDate === new Date().toISOString().split('T')[0]) {
                total += (Date.now() - lastStart);
            }
        }

        const h = Math.floor(total / 3600000);
        const m = Math.floor((total % 3600000) / 60000);
        return `${h}h ${m}m`;
    };

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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <GlassCard key={i} className="h-48 animate-pulse" />
                    ))
                ) : users.length === 0 ? (
                    <div className="col-span-full text-center p-12 text-muted-foreground">No records found.</div>
                ) : (
                    users.map(user => {
                        const totalTime = calculateTotalTime(user.timeLogs);
                        const firstLog = user.timeLogs[user.timeLogs.length - 1]; // sorted desc in API
                        const startTime = firstLog ? new Date(firstLog.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';

                        return (
                            <GlassCard key={user.id} className="flex flex-col gap-4">
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
                                    <Badge variant="glass" className="bg-primary/10 text-primary border-primary/20">
                                        {totalTime}
                                    </Badge>
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
                                        <div className="text-sm font-medium">{user.timeLogs.length} events</div>
                                    </div>
                                </div>
                            </GlassCard>
                        );
                    })
                )}
            </div>
        </div>
    );
}
