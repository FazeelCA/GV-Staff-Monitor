import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchUserScreenshots, fetchDashboardUsers, fetchUserTasks, resetUserPassword, type Screenshot, type DashboardUser } from '../services/api';
import { GlassCard, SkeletonGlassCard } from '../components/ui/GlassCard';
import { Badge, StatusDot } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ArrowLeft, Clock, Monitor, Lock, X } from 'lucide-react';

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

import { Lightbox } from '../components/ui/Lightbox';

export default function UserDetailView() {
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();
    const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
    const [user, setUser] = useState<DashboardUser | null>(null);
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]); // Default today

    // Password Reset
    const [showResetModal, setShowResetModal] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [resetting, setResetting] = useState(false);

    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const isAdmin = currentUser?.role === 'ADMIN';

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

    const load = useCallback(async () => {
        if (!userId) return;
        try {
            const [shots, users, userTasks] = await Promise.all([
                fetchUserScreenshots(userId, selectedDate),
                fetchDashboardUsers(),
                fetchUserTasks(userId, selectedDate),
            ]);
            setScreenshots(shots);
            setUser(users.find((u) => u.id === userId) ?? null);
            setTasks(userTasks);
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
                    {screenshots.map((shot, idx) => (
                        <GlassCard
                            key={shot.id}
                            className="group p-0 overflow-hidden cursor-zoom-in relative aspect-video transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10"
                            onClick={() => setLightboxIdx(idx)}
                        >
                            <img
                                src={shot.imageUrl}
                                alt={shot.taskAtTheTime}
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                            />

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
                                </div>
                            </div>
                        </GlassCard>
                    ))}
                </div>
            )}


            {/* Task History */}
            <div className="space-y-4">
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

            {/* Lightbox */}
            {lightboxIdx !== null && screenshots[lightboxIdx] && (
                <Lightbox
                    screenshot={screenshots[lightboxIdx]}
                    onClose={() => setLightboxIdx(null)}
                    onPrev={() => setLightboxIdx(i => (i !== null && i > 0 ? i - 1 : null))}
                    onNext={() => setLightboxIdx(i => (i !== null && i < screenshots.length - 1 ? i + 1 : null))}
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
        </div>
    );
}
