import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchUserScreenshots, fetchDashboardUsers, fetchUserTasks, resetUserPassword, resetUserHours, deleteScreenshot, fetchUserHistory, pushAdminMessage, type Screenshot, type DashboardUser } from '../services/api';
import { GlassCard, SkeletonGlassCard } from '../components/ui/GlassCard';
import { Badge, StatusDot } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ArrowLeft, Clock, Monitor, Lock, X, Trash2, AlertTriangle, Activity } from 'lucide-react';

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

import { Lightbox } from '../components/ui/Lightbox';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

export default function UserDetailView() {
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();
    const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
    const [user, setUser] = useState<DashboardUser | null>(null);
    const [tasks, setTasks] = useState<any[]>([]);
    const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
    const [activityLogs, setActivityLogs] = useState<any[]>([]);
    const [filterUnproductive, setFilterUnproductive] = useState(false);
    const [loading, setLoading] = useState(true);

    const UNPRODUCTIVE_KEYWORDS = ['youtube', 'facebook', 'instagram', 'twitter', 'tiktok', 'netflix', 'reddit', 'whatsapp', 'telegram', 'discord'];
    const isUnproductive = (log: any) => {
        const text = (`${log.appName || ''} ${log.title || ''} ${log.url || ''}`).toLowerCase();
        return UNPRODUCTIVE_KEYWORDS.some(kw => text.includes(kw));
    };
    const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

    // Pagination for timeline
    const [timelinePage, setTimelinePage] = useState(1);
    const timelineLimit = 20;


    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]); // Default today

    // Password Reset
    const [showResetModal, setShowResetModal] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [resetting, setResetting] = useState(false);
    const [resettingHours, setResettingHours] = useState(false);

    // Push Message Modal
    const [showPushModal, setShowPushModal] = useState(false);
    const [pushMessage, setPushMessage] = useState('');
    const [pushing, setPushing] = useState(false);

    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const isAdmin = currentUser?.role === 'ADMIN';

    const handleDeleteScreenshot = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to delete this screenshot?')) return;
        try {
            await deleteScreenshot(id);
            setScreenshots((prev) => prev.filter((s) => s.id !== id));
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userId) return;
        setResetting(true);
        try {
            await resetUserPassword(userId, newPassword);
            setShowResetModal(false);
            setNewPassword('');
            alert('Password reset successfully.');
        } catch (e: any) {
            alert(e.message);
        } finally {
            setResetting(false);
        }
    };

    const handleResetHours = async () => {
        if (!userId) return;
        if (!window.confirm(`Are you sure you want to completely wipe all tracked hours for ${user?.name} today? This cannot be undone.`)) return;
        setResettingHours(true);
        try {
            await resetUserHours(userId);
            alert('Hours reset successfully.');
            load(); // Reload to reflect changes
        } catch (e: any) {
            alert(e.message);
        } finally {
            setResettingHours(false);
        }
    };

    const handlePushMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userId || !pushMessage.trim()) return;
        setPushing(true);
        try {
            await pushAdminMessage(userId, pushMessage.trim());
            alert('Message pushed successfully.');
            setShowPushModal(false);
            setPushMessage('');
        } catch (err: any) {
            alert(err.message);
        } finally {
            setPushing(false);
        }
    };

    const load = useCallback(async () => {
        if (!userId) return;
        try {
            const [shots, users, userTasks, hist] = await Promise.all([
                fetchUserScreenshots(userId, selectedDate),
                fetchDashboardUsers(),
                fetchUserTasks(userId, selectedDate),
                fetchUserHistory(userId, selectedDate)
            ]);
            setScreenshots(shots);
            setUser(users.find((u) => u.id === userId) ?? null);
            setTasks(userTasks);

            // Build Timeline Events
            const events: any[] = [];
            hist.timeLogs.forEach((l: any) => events.push({ time: new Date(l.timestamp).getTime(), type: 'TIME_LOG', data: l }));
            hist.screenshots.forEach((s: any) => events.push({ time: new Date(s.timestamp).getTime(), type: 'SCREENSHOT', data: s }));
            hist.activityLogs.forEach((a: any) => events.push({ time: new Date(a.startTime).getTime(), type: 'ACTIVITY', data: a }));
            events.sort((a, b) => b.time - a.time); // Newest first
            setTimelineEvents(events);

            setActivityLogs(hist.activityLogs || []);

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [userId, selectedDate]);

    // Load data
    useEffect(() => {
        load();
        const interval = setInterval(load, 30_000);
        return () => clearInterval(interval);
    }, [load]);

    return (
        <div className="space-y-6">
            {/* Header Area */}
            <div className="flex flex-col gap-6">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/')}
                    className="self-start text-muted-foreground hover:text-foreground pl-0 gap-1"
                >
                    <ArrowLeft size={16} /> Back to Team
                </Button>

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div className="flex items-center gap-4">
                        {user && (
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-primary/20">
                                {user.name.charAt(0)}
                            </div>
                        )}
                        <div>
                            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                                {user ? user.name : 'Loading...'}
                                {user && (
                                    <Badge variant={user.status === 'Working' ? 'success' : user.status === 'On Break' ? 'warning' : 'outline'}>
                                        <StatusDot className={user.status === 'Working' ? 'animate-pulse bg-current' : 'bg-current'} />
                                        {user.status}
                                    </Badge>
                                )}
                            </h1>
                            <div className="flex flex-col mt-1 gap-1">
                                <p className="text-muted-foreground uppercase tracking-widest text-sm font-semibold">
                                    {user?.role || 'STAFF'}
                                </p>
                                {user?.status === 'Working' && user?.currentTask && (
                                    <p className="text-foreground text-sm font-medium">
                                        {user.currentTask}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {!loading && (
                        <GlassCard className="px-5 py-3 flex items-center gap-4">
                            <div className="text-right">
                                <p className="text-2xl font-bold text-foreground">{screenshots.length}</p>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Screenshots</p>
                            </div>
                            <div className="h-8 w-px bg-white/10" />
                            <div className="text-right">
                                <p className="text-2xl font-bold text-foreground">{user?.totalHoursToday.toFixed(1) ?? '0.0'}</p>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Hours Today</p>
                            </div>
                        </GlassCard>
                    )}
                </div>

                {/* Admin Actions */}
                {isAdmin && user && (
                    <div className="flex gap-4">
                        <Button variant="outline" size="sm" onClick={handleResetHours} disabled={resettingHours} className="border-red-500/30 text-red-400 hover:bg-red-500/10">
                            <Clock size={16} className="mr-2" />
                            {resettingHours ? 'Resetting...' : 'Reset Hours Today'}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setShowPushModal(true)} className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hidden sm:flex">
                            <AlertTriangle size={16} className="mr-2" />
                            Push Message
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setShowResetModal(true)} className="border-white/10 hover:bg-white/5">
                            <Lock size={16} className="mr-2" />
                            Reset Password
                        </Button>
                    </div>
                )}
            </div>

            {/* Separator */}
            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Activity Log</h2>
                <div className="flex items-center gap-3">
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                    />
                    <Badge variant="outline" className="font-mono hidden sm:inline-flex">{formatDate(selectedDate)}</Badge>
                </div>
            </div>

            {/* Productivity Graph */}
            {!loading && screenshots.length > 0 && (
                <GlassCard className="p-4 h-[250px] w-full mt-4 bg-black/10">
                    <h3 className="text-sm font-semibold text-muted-foreground mb-4 ml-2 uppercase tracking-wide">Productivity Trend (Activity Count)</h3>
                    <ResponsiveContainer width="100%" height="80%">
                        <AreaChart data={[...screenshots].reverse().map(s => ({ time: new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), activity: s.activityCount || 0 }))}>
                            <defs>
                                <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.5} />
                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="time" stroke="#ffffff40" fontSize={11} tickLine={false} axisLine={false} minTickGap={30} />
                            <YAxis stroke="#ffffff40" fontSize={11} tickLine={false} axisLine={false} width={30} />
                            <RechartsTooltip
                                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                itemStyle={{ color: '#fff' }}
                            />
                            <Area type="monotone" dataKey="activity" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorActivity)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </GlassCard>
            )}

            {/* Loading */}
            {loading && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <SkeletonGlassCard key={i} className="aspect-video h-auto" />
                    ))}
                </div>
            )}

            {/* Empty */}
            {!loading && screenshots.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-center rounded-3xl border border-white/5 bg-white/2">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                        <Monitor size={32} className="text-muted-foreground opacity-50" />
                    </div>
                    <p className="text-xl font-medium mb-2 text-foreground">No activity recorded today</p>
                    <p className="text-sm text-muted-foreground max-w-xs">Screenshots will appear here automatically when the user is active.</p>
                </div>
            )}

            {/* Screenshot grid */}
            {!loading && screenshots.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {screenshots.map((shot, idx) => {
                        // UserDetail API sorts ASC, so idx - 1 is the older screenshot it should be compared to
                        const prevShot = idx > 0 ? screenshots[idx - 1] : null;
                        const isStatic = shot.hash && prevShot?.hash && shot.hash === prevShot.hash;
                        const isLowActivity = shot.activityCount !== undefined && shot.activityCount < 50;

                        return (
                            <GlassCard
                                key={shot.id}
                                className={`group p-0 overflow-hidden cursor-zoom-in relative aspect-video transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10 ${isStatic ? 'ring-2 ring-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : isLowActivity ? 'ring-2 ring-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)]' : ''}`}
                                onClick={() => setLightboxIdx(idx)}
                            >
                                <img
                                    src={shot.imageUrl}
                                    alt={shot.taskAtTheTime}
                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                />

                                {isStatic ? (
                                    <div className="absolute top-2 right-2 z-20 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded shadow-lg flex items-center gap-1 animate-pulse">
                                        <AlertTriangle className="w-3 h-3" />
                                        <span>Static</span>
                                    </div>
                                ) : isLowActivity ? (
                                    <div className="absolute top-2 right-2 z-20 bg-yellow-500 text-white text-xs font-bold px-2 py-1 rounded shadow-lg flex items-center gap-1">
                                        <Activity className="w-3 h-3" />
                                        <span>Low Act</span>
                                    </div>
                                ) : null}

                                {/* Gradient Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-300" />

                                {/* Content Overlay */}
                                <div className="absolute bottom-0 left-0 right-0 p-4 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                                    <p className="text-xs font-medium text-white/90 line-clamp-1 mb-1">
                                        {shot.taskAtTheTime || 'No task detected'}
                                    </p>
                                    <div className="flex items-center justify-between">
                                        <Badge variant="glass" className="h-5 px-1.5 text-[10px] gap-1 border-white/10 bg-black/40">
                                            <Clock size={10} />
                                            {formatTime(shot.timestamp)}
                                        </Badge>

                                        {isAdmin && (
                                            <button
                                                onClick={(e) => handleDeleteScreenshot(e, shot.id)}
                                                className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white transition-all border border-red-500/20"
                                                title="Delete Screenshot"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </GlassCard>
                        )
                    })}
                </div>
            )}


            {/* Timeline View */}
            <div className="space-y-4 mt-8">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-foreground">Timeline History</h2>
                </div>

                {loading ? (
                    <div className="space-y-4">
                        <SkeletonGlassCard className="h-20" />
                        <SkeletonGlassCard className="h-20" />
                    </div>
                ) : timelineEvents.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground bg-white/5 rounded-xl border border-white/5">
                        No timeline events available for this day.
                    </div>
                ) : (
                    <div className="relative pl-6 space-y-6 before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
                        {timelineEvents.slice(0, timelinePage * timelineLimit).map((ev, i) => {
                            const dateObj = new Date(ev.time);
                            return (
                                <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                    <div className="flex items-center justify-center w-5 h-5 rounded-full border-2 border-[#080a0f] bg-primary text-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-lg shadow-white/20 absolute left-[-28px] md:static" />

                                    <GlassCard className="w-[calc(100%-1rem)] md:w-[calc(50%-1.5rem)] p-4 hover:shadow-xl hover:shadow-primary/5 transition-all">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold text-primary uppercase tracking-wider">{ev.type.replace('_', ' ')}</span>
                                            <span className="text-xs text-muted-foreground font-mono bg-black/20 px-2 py-0.5 rounded-full border border-white/5">
                                                {formatTime(dateObj.toISOString())}
                                            </span>
                                        </div>

                                        {ev.type === 'TIME_LOG' && (
                                            <div>
                                                <p className={`font-semibold ${ev.data.type === 'START' ? 'text-emerald-400' : ev.data.type === 'STOP' ? 'text-rose-400' : 'text-amber-400'}`}>
                                                    {ev.data.type === 'START' ? 'Started Work' : ev.data.type === 'STOP' ? 'Stopped Work' : ev.data.type === 'BREAK_START' ? 'Took a Break' : 'Returned from Break'}
                                                </p>
                                                {ev.data.currentTask && <p className="text-sm text-foreground mt-1">Task: <span className="opacity-80">{ev.data.currentTask}</span></p>}
                                            </div>
                                        )}

                                        {ev.type === 'SCREENSHOT' && (
                                            <div className="space-y-2 cursor-zoom-in" onClick={() => setLightboxIdx(screenshots.findIndex(s => s.id === ev.data.id))}>
                                                <img src={ev.data.imageUrl} className="w-full h-24 object-cover rounded-lg border border-white/10 hover:border-primary/50 transition-colors" />
                                                <p className="text-xs text-muted-foreground line-clamp-1">{ev.data.taskAtTheTime}</p>
                                            </div>
                                        )}

                                        {ev.type === 'ACTIVITY' && (
                                            <div>
                                                <p className="text-sm font-medium text-foreground line-clamp-1">{ev.data.appName || 'Unknown App'}</p>
                                                {ev.data.title && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ev.data.title}</p>}
                                            </div>
                                        )}
                                    </GlassCard>
                                </div>
                            );
                        })}
                    </div>
                )}

                {timelineEvents.length > timelinePage * timelineLimit && (
                    <div className="flex justify-center mt-6">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setTimelinePage(p => p + 1)}
                            className="bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground"
                        >
                            Load More Events
                        </Button>
                    </div>
                )}
            </div>

            {/* Task History */}
            <div className="space-y-4 pt-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-foreground">Task History</h2>
                </div>

                {loading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <SkeletonGlassCard key={i} className="h-16" />
                        ))}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {tasks?.map(task => (
                            <GlassCard
                                key={task.id}
                                className="flex items-center justify-between p-4"
                            >
                                <div>
                                    <h3 className="font-medium text-foreground">{task.title || 'Untitled Task'}</h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {task.createdAt ? new Date(task.createdAt).toLocaleString() : 'Date unknown'}
                                    </p>
                                </div>
                                {task.status && task.status !== 'UNKNOWN' && (
                                    <Badge variant={task.status === 'COMPLETED' ? 'success' : task.status === 'IN_PROGRESS' ? 'warning' : 'outline'}>
                                        {task.status.replace('_', ' ')}
                                    </Badge>
                                )}
                            </GlassCard>
                        ))}
                        {(!tasks || tasks.length === 0) && (
                            <div className="text-center py-8 text-muted-foreground bg-white/5 rounded-xl border border-white/5">
                                No tasks recorded.
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Websites & Apps History */}
            <div className="space-y-4 pt-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-foreground">Websites & Apps</h2>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Show Unproductive Only</span>
                        <button
                            onClick={() => setFilterUnproductive(!filterUnproductive)}
                            className={`w-10 h-5 rounded-full transition-colors relative ${filterUnproductive ? 'bg-red-500' : 'bg-white/10'}`}
                        >
                            <span className={`block w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${filterUnproductive ? 'left-5' : 'left-1'}`} />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <SkeletonGlassCard className="h-32" />
                ) : (
                    <div className="space-y-3">
                        {activityLogs
                            .filter(log => filterUnproductive ? isUnproductive(log) : true)
                            .map(log => {
                                const bad = isUnproductive(log);
                                return (
                                    <GlassCard
                                        key={log.id}
                                        className={`flex flex-col p-4 transition-colors ${bad ? 'border-red-500/50 bg-red-500/10' : ''}`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="font-semibold text-foreground">{log.appName || 'Unknown App'}</h3>
                                            <span className="text-xs text-muted-foreground font-mono bg-black/20 px-2 py-0.5 rounded border border-white/10">
                                                {formatTime(log.startTime)} {log.duration ? `(${Math.floor(log.duration / 60)}m ${log.duration % 60}s)` : ''}
                                            </span>
                                        </div>
                                        {log.title && <p className="text-sm text-muted-foreground mb-1 line-clamp-1">{log.title}</p>}
                                        {log.url && <a href={log.url} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline line-clamp-1">{log.url}</a>}
                                        {bad && <Badge variant="outline" className="mt-2 self-start text-red-400 border-red-500/30 bg-red-500/10 text-[10px] py-0">Unproductive</Badge>}
                                    </GlassCard>
                                )
                            })}

                        {(activityLogs.length === 0 || (filterUnproductive && !activityLogs.some(isUnproductive))) && (
                            <div className="text-center py-8 text-muted-foreground bg-white/5 rounded-xl border border-white/5">
                                No websites or apps recorded.
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Lightbox */}
            {lightboxIdx !== null && screenshots[lightboxIdx] && (
                <Lightbox
                    screenshot={screenshots[lightboxIdx]}
                    onClose={() => setLightboxIdx(null)}
                    onPrev={() => setLightboxIdx(i => (i !== null && i > 0 ? i - 1 : null))}
                    onNext={() => setLightboxIdx(i => (i !== null && i < screenshots.length - 1 ? i + 1 : null))}
                    onDelete={(id) => {
                        handleDeleteScreenshot({ stopPropagation: () => { } } as any, id);
                        setLightboxIdx(null);
                    }}
                    hasPrev={lightboxIdx > 0}
                    hasNext={lightboxIdx < screenshots.length - 1}
                />
            )}

            {/* Password Reset Modal */}
            {showResetModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
                    <div className="w-full max-w-md animate-in zoom-in-95 duration-200">
                        <GlassCard className="border-white/10 shadow-2xl">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-foreground">Reset Password</h2>
                                <button
                                    onClick={() => setShowResetModal(false)}
                                    className="text-muted-foreground hover:text-foreground p-1 hover:bg-white/5 rounded-lg transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleResetPassword} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">New Password</label>
                                    <div className="relative">
                                        <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                        <input
                                            required
                                            type="password"
                                            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-black/20 border border-white/10 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:outline-none text-foreground placeholder:text-muted-foreground/50 transition-all"
                                            value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                            placeholder="••••••••"
                                        />
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    loading={resetting}
                                    className="w-full mt-4"
                                    size="lg"
                                >
                                    {resetting ? 'Resetting...' : 'Reset Password'}
                                </Button>
                            </form>
                        </GlassCard>
                    </div>
                </div>
            )}

            {/* Push Message Modal */}
            {showPushModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
                    <div className="w-full max-w-md animate-in zoom-in-95 duration-200">
                        <GlassCard className="border-white/10 shadow-2xl">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-foreground">Push Admin Message</h2>
                                <button
                                    onClick={() => setShowPushModal(false)}
                                    className="text-muted-foreground hover:text-foreground p-1 hover:bg-white/5 rounded-lg transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="mb-4">
                                <p className="text-sm text-muted-foreground mb-2">Quick Templates:</p>
                                <div className="flex flex-wrap gap-2">
                                    <button onClick={() => setPushMessage("Late Login - Half Day Cut Applied")} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-3 py-1 text-foreground transition-colors">Half Day Cut</button>
                                    <button onClick={() => setPushMessage("No Activity Detected - Please Resume Work")} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-3 py-1 text-foreground transition-colors">No Activity</button>
                                    <button onClick={() => setPushMessage("Please check your tasks list.")} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-3 py-1 text-foreground transition-colors">Check Tasks</button>
                                </div>
                            </div>

                            <form onSubmit={handlePushMessage} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        Custom Message
                                    </label>
                                    <textarea
                                        value={pushMessage}
                                        onChange={(e) => setPushMessage(e.target.value)}
                                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground resize-none"
                                        placeholder="Type a custom message here..."
                                        rows={4}
                                        required
                                    />
                                    <p className="text-xs text-muted-foreground mt-2">
                                        This message will pop up directly on the user's screen and they must acknowledge it to dismiss it.
                                    </p>
                                </div>

                                <div className="flex justify-end gap-3 mt-6">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setShowPushModal(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={pushing || !pushMessage.trim()}
                                        className="bg-primary text-white hover:bg-primary/90"
                                    >
                                        {pushing ? 'Sending...' : 'Push to Staff'}
                                    </Button>
                                </div>
                            </form>
                        </GlassCard>
                    </div>
                </div>
            )}
        </div>
    );
}
