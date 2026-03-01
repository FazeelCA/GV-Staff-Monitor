
import { useState, useEffect } from 'react';
import { fetchAllScreenshots, fetchDashboardUsers, deleteScreenshot, type Screenshot, type DashboardUser } from '../services/api';
import { GlassCard, SkeletonGlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { Monitor, Clock, Filter, AlertTriangle, Trash2, Activity, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

type ScreenshotWithUser = Screenshot & { user: { name: string; email: string }; hash?: string };

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
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

import { DateFilterSelect } from '../components/ui/DateFilterSelect';
import { Lightbox } from '../components/ui/Lightbox';

export default function ScreenshotsView() {
    const [searchParams, setSearchParams] = useSearchParams();
    const initialUser = searchParams.get('userId') || 'ALL';
    const initialDate = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const [screenshots, setScreenshots] = useState<ScreenshotWithUser[]>([]);
    const [users, setUsers] = useState<DashboardUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<string>(initialUser);
    const [dateFilter, setDateFilter] = useState<any>({ option: 'today', startDate: initialDate, endDate: initialDate });
    const [activityFilter, setActivityFilter] = useState<'All' | 'Low Activity'>('All');
    const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
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
        setPage(1);
        setHasMore(true);
        loadData(1);
    }, [selectedUser, dateFilter, activityFilter]);

    const loadData = async (pageNum = page) => {
        if (pageNum === 1) setLoading(true);
        else setLoadingMore(true);
        try {
            const [shotsData, usersData] = await Promise.all([
                fetchAllScreenshots({ userId: selectedUser, startDate: dateFilter.startDate, endDate: dateFilter.endDate, page: pageNum, limit: 20, activityFilter }),
                users.length === 0 ? fetchDashboardUsers() : Promise.resolve(users),
            ]);

            if (pageNum === 1) {
                setScreenshots(shotsData as any);
            } else {
                setScreenshots(prev => [...prev, ...(shotsData as any)]);
            }
            setHasMore(shotsData.length === 20);

            if (users.length === 0) setUsers(usersData as DashboardUser[]);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const handleLoadMore = () => {
        if (!loadingMore && hasMore) {
            const nextPage = page + 1;
            setPage(nextPage);
            loadData(nextPage);
        }
    };

    // Group by Date for better visualization? Or just grid?
    // User requested "menu for check entire screenshots of users and add filters by staffs".
    // A grid sorted by time is good.

    const processedScreenshots = screenshots.map((shot, idx) => {
        const prevShotIndex = screenshots.findIndex((s, i) => i > idx && s.userId === shot.userId);
        const prevShot = prevShotIndex !== -1 ? screenshots[prevShotIndex] : null;
        const isStatic = shot.hash && prevShot?.hash && shot.hash === prevShot.hash;
        const isLowActivity = shot.activityCount !== undefined && shot.activityCount < 50;
        return { ...shot, isStatic, isLowActivity };
    });

    const displayedScreenshots = processedScreenshots.filter(shot => {
        // Enforce Query Parameter Timestamp Filter
        const qStart = searchParams.get('startTime');
        const qEnd = searchParams.get('endTime');
        if (qStart && qEnd) {
            const shotTime = new Date(shot.timestamp).getTime();
            const minTime = new Date(qStart).getTime();
            const maxTime = new Date(qEnd).getTime();
            if (shotTime < minTime || shotTime > maxTime) return false;
        }

        // We no longer filter by activity here because the backend handles it.
        // But we DO still want to show Static shots if they match.
        // Actually, the backend doesn't filter static (unless we add that too). 
        // For now, if activity filter is Low Activity, the backend returns ONLY low activity shots, 
        // so we don't need to filter them redundantly here.
        return true;
    });

    const clearCustomFilters = () => {
        searchParams.delete('userId');
        searchParams.delete('date');
        searchParams.delete('startTime');
        searchParams.delete('endTime');
        setSearchParams(searchParams);
        setSelectedUser('ALL');
        setDateFilter({ option: 'today', startDate: new Date().toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0] });
        setActivityFilter('All');
        setPage(1);
        setHasMore(true);
    };

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

                {searchParams.get('startTime') && searchParams.get('endTime') && (
                    <div className="bg-primary/20 border border-primary/50 text-white px-4 py-2 rounded-xl flex items-center justify-between shadow-lg shadow-primary/10">
                        <span className="text-sm font-medium">
                            Showing screenshots for a specific time window.
                        </span>
                        <button onClick={clearCustomFilters} className="text-white/80 hover:text-white flex items-center gap-1 text-sm bg-white/10 px-2 py-1 rounded-lg transition-colors">
                            <X size={14} /> Clear Selection
                        </button>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
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
                    <div className="relative z-10 w-full sm:w-auto">
                        <DateFilterSelect
                            value={dateFilter}
                            onChange={(val) => setDateFilter(val)}
                        />
                    </div>

                    {/* Activity Filter */}
                    <div className="relative">
                        <Activity className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                        <select
                            className="w-full sm:w-40 pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors appearance-none cursor-pointer"
                            value={activityFilter}
                            onChange={(e) => setActivityFilter(e.target.value as 'All' | 'Low Activity')}
                        >
                            <option value="All" className="bg-[#09090b]">All Activity</option>
                            <option value="Low Activity" className="bg-[#09090b]">Low Activity</option>
                        </select>
                    </div>

                    <button
                        onClick={() => { setSelectedUser('ALL'); setDateFilter({ option: 'today', startDate: new Date().toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0] }); setActivityFilter('All'); }}
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
                    {displayedScreenshots.length === 0 ? (
                        <div className="text-center py-24 text-muted-foreground">
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                                <Monitor size={32} className="opacity-50" />
                            </div>
                            <p className="text-lg font-medium text-foreground">No matching screenshots</p>
                            <p className="text-sm">Try adjusting your filters.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {displayedScreenshots.map((shot, idx) => (
                                <GlassCard
                                    key={`${shot.id}-${idx}`}
                                    className={`group p-0 overflow-hidden relative aspect-video transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10 cursor-pointer ${shot.isStatic ? 'ring-2 ring-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : shot.isLowActivity ? 'ring-2 ring-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)]' : ''}`}
                                    onClick={() => setLightboxIdx(idx)}
                                >
                                    <img
                                        src={shot.thumbnailUrl || shot.imageUrl}
                                        alt={shot.taskAtTheTime || 'Screenshot'}
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 bg-black/20"
                                        loading="lazy"
                                    />

                                    {shot.isStatic ? (
                                        <div className="absolute top-2 right-2 z-20 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded shadow-lg flex items-center gap-1 animate-pulse">
                                            <AlertTriangle className="w-3 h-3" />
                                            <span>Static</span>
                                        </div>
                                    ) : shot.isLowActivity ? (
                                        <div className="absolute top-2 right-2 z-20 bg-yellow-500 text-white text-xs font-bold px-2 py-1 rounded shadow-lg flex items-center gap-1">
                                            <Activity className="w-3 h-3" />
                                            <span>Low Act</span>
                                        </div>
                                    ) : null}

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
                            ))}
                        </div>
                    )}

                    {hasMore && (
                        <div className="flex justify-center mt-8">
                            <button
                                onClick={handleLoadMore}
                                disabled={loadingMore}
                                className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors flex items-center gap-2 text-sm text-foreground disabled:opacity-50"
                            >
                                {loadingMore ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        Loading...
                                    </>
                                ) : (
                                    'Load More'
                                )}
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Lightbox */}
            {lightboxIdx !== null && displayedScreenshots[lightboxIdx] && (
                <Lightbox
                    screenshot={displayedScreenshots[lightboxIdx]}
                    onClose={() => setLightboxIdx(null)}
                    onPrev={() => setLightboxIdx(i => (i !== null && i > 0 ? i - 1 : null))}
                    onNext={() => setLightboxIdx(i => (i !== null && i < displayedScreenshots.length - 1 ? i + 1 : null))}
                    onDelete={(id) => {
                        handleDeleteScreenshot({ stopPropagation: () => { } } as any, id);
                        setLightboxIdx(null);
                    }}
                    hasPrev={lightboxIdx > 0}
                    hasNext={lightboxIdx < displayedScreenshots.length - 1}
                />
            )}
        </div>
    );
}
