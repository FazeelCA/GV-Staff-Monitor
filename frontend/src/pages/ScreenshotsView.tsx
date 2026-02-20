
import { useState, useEffect } from 'react';
import { fetchAllScreenshots, fetchDashboardUsers, deleteScreenshot, type Screenshot, type DashboardUser } from '../services/api';
import { GlassCard, SkeletonGlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { Monitor, Clock, Calendar, Filter, User, AlertTriangle, Trash2 } from 'lucide-react';
// remove useNavigate

type ScreenshotWithUser = Screenshot & { user: { name: string; email: string }; hash?: string };

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string) {
    // Show 'Today', 'Yesterday', or date
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString();
}

import { Lightbox } from '../components/ui/Lightbox';

export default function ScreenshotsView() {
    const [screenshots, setScreenshots] = useState<ScreenshotWithUser[]>([]);
    const [users, setUsers] = useState<DashboardUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<string>('ALL');
    const [selectedDate, setSelectedDate] = useState<string>(''); // YYYY-MM-DD
    const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
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

    useEffect(() => {
        loadData();
    }, [selectedUser, selectedDate]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [shotsData, usersData] = await Promise.all([
                fetchAllScreenshots({ userId: selectedUser, date: selectedDate }),
                // Only fetch users once if possible, but for simplicity fetching every time or use cached?
                // Let's optimize: fetch users only once on mount.
                users.length === 0 ? fetchDashboardUsers() : Promise.resolve(users),
            ]);

            setScreenshots(shotsData);
            if (users.length === 0) setUsers(usersData as DashboardUser[]);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // Group by Date for better visualization? Or just grid?
    // User requested "menu for check entire screenshots of users and add filters by staffs".
    // A grid sorted by time is good.

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mb-2">
                        Global Screenshots
                    </h1>
                    <p className="text-muted-foreground">
                        Monitor activity across all staff members.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
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

                    <button
                        onClick={() => { setSelectedUser('ALL'); setSelectedDate(''); }}
                        className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                        title="Clear Filters"
                    >
                        <Filter size={18} />
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <SkeletonGlassCard key={i} className="aspect-video h-auto" />
                    ))}
                </div>
            ) : (
                <>
                    {screenshots.length === 0 ? (
                        <div className="text-center py-24 text-muted-foreground">
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                                <Monitor size={32} className="opacity-50" />
                            </div>
                            <p className="text-lg font-medium text-foreground">No screenshots found</p>
                            <p className="text-sm">Try adjusting your filters.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {screenshots.map((shot, idx) => {
                                const prevShot = screenshots[idx + 1];
                                // Check for identical hash with previous (older) screenshot
                                const isStatic = shot.hash && prevShot?.hash && shot.hash === prevShot.hash;

                                return (
                                    <GlassCard
                                        key={shot.id}
                                        className={`group p-0 overflow-hidden relative aspect-video transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10 cursor-pointer ${isStatic ? 'ring-2 ring-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : ''}`}
                                        onClick={() => setLightboxIdx(screenshots.indexOf(shot))}
                                    >
                                        <img
                                            src={shot.imageUrl}
                                            alt={shot.taskAtTheTime}
                                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                            loading="lazy"
                                        />

                                        {isStatic && (
                                            <div className="absolute top-2 right-2 z-20 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded shadow-lg flex items-center gap-1 animate-pulse">
                                                <AlertTriangle className="w-3 h-3" />
                                                <span>Static</span>
                                            </div>
                                        )}

                                        {/* Overlay */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-300" />

                                        {/* Top Info (User) */}
                                        <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
                                            <Badge variant="glass" className="bg-black/40 border-white/10 backdrop-blur-md">
                                                {shot.user.name}
                                            </Badge>
                                            <Badge variant="glass" className="bg-black/40 border-white/10 text-[10px]">
                                                {formatDate(shot.timestamp)}
                                            </Badge>
                                        </div>

                                        {/* Bottom Info (Task) */}
                                        <div className="absolute bottom-0 left-0 right-0 p-4 transform translate-y-1 group-hover:translate-y-0 transition-transform duration-300">
                                            <p className="text-xs font-medium text-white/90 line-clamp-1 mb-1">
                                                {shot.taskAtTheTime || 'No task detected'}
                                            </p>
                                            <div className="flex items-center justify-between mt-1">
                                                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                                    <Clock size={10} />
                                                    {formatTime(shot.timestamp)}
                                                </div>

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
                                );
                            })}
                        </div>
                    )}
                </>
            )}

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
        </div>
    );
}
