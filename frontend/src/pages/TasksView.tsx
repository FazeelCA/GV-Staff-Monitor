
import { useState, useEffect } from 'react';
import { fetchAllTasks, type Task } from '../services/api';
import { List, Search, Clock, User, Filter } from 'lucide-react';
import { GlassCard, SkeletonGlassCard } from '../components/ui/GlassCard';
import { Badge, StatusDot } from '../components/ui/Badge';
import { useNavigate } from 'react-router-dom';

export default function TasksView() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'>('ALL');
    const [search, setSearch] = useState('');
    const [visibleCount, setVisibleCount] = useState(20);
    const navigate = useNavigate();

    useEffect(() => {
        setVisibleCount(20);
    }, [filter, search]);

    useEffect(() => {
        loadTasks();
    }, []);

    const loadTasks = async () => {
        try {
            const data = await fetchAllTasks();
            setTasks(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const filteredTasks = tasks.filter(task => {
        const matchesStatus = filter === 'ALL' || task.status === filter;
        const matchesSearch = task.title.toLowerCase().includes(search.toLowerCase()) ||
            (task.user?.name || '').toLowerCase().includes(search.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    const getStatusVariant = (status: string | undefined) => {
        if (!status) return 'outline';
        switch (status) {
            case 'COMPLETED': return 'success';
            case 'IN_PROGRESS': return 'warning';
            default: return 'outline';
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mb-2">
                        Global Tasks
                    </h1>
                    <p className="text-muted-foreground">
                        Monitor all staff assignments and progress.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <div className="relative flex-1 sm:flex-none">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                        <input
                            type="text"
                            placeholder="Search tasks or staff..."
                            className="w-full sm:w-64 pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 overflow-x-auto no-scrollbar">
                        {(['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${filter === f
                                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                                    }`}
                            >
                                {f.replace('_', ' ')}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                        <SkeletonGlassCard key={i} className="h-24" />
                    ))}
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredTasks.slice(0, visibleCount).map(task => (
                        <GlassCard
                            key={task.id}
                            className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 hover:border-primary/30 transition-all hover:bg-white/[0.02] cursor-pointer"
                            onClick={() => {
                                if (!task.userId || !task.createdAt) return;
                                const date = new Date(task.createdAt).toISOString().split('T')[0];
                                const startTime = new Date(task.createdAt).toISOString();
                                const endTime = task.status === 'COMPLETED' && task.updatedAt
                                    ? new Date(task.updatedAt).toISOString()
                                    : new Date().toISOString();
                                navigate(`/screenshots?userId=${task.userId}&date=${date}&startTime=${startTime}&endTime=${endTime}`);
                            }}
                        >
                            <div className="flex items-start sm:items-center gap-4">
                                <div className={`p-3 rounded-xl bg-white/5 text-muted-foreground group-hover:text-primary transition-colors`}>
                                    <List size={20} />
                                </div>
                                <div>
                                    <h3 className="font-medium text-foreground text-lg mb-1">
                                        {task.title}
                                    </h3>
                                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                                        <div
                                            className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                task.userId && navigate(`/user/${task.userId}`);
                                            }}
                                        >
                                            <User size={14} />
                                            <span>{task.user?.name || 'Unknown User'}</span>
                                        </div>
                                        <span className="text-white/10">•</span>
                                        <div className="flex items-center gap-1.5">
                                            <Clock size={14} />
                                            <span>{task.createdAt ? new Date(task.createdAt).toLocaleDateString() : 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <Badge variant={getStatusVariant(task.status)} className="self-start sm:self-center">
                                <StatusDot className={task.status === 'IN_PROGRESS' ? 'animate-pulse bg-current' : 'bg-current'} />
                                {(task.status || 'UNKNOWN').replace('_', ' ')}
                            </Badge>
                        </GlassCard>
                    ))}

                    {visibleCount < filteredTasks.length && (
                        <div className="flex justify-center mt-6 py-4">
                            <button
                                onClick={() => setVisibleCount(prev => prev + 20)}
                                className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors flex items-center justify-center gap-2 text-sm text-foreground active:scale-95"
                            >
                                Load More
                            </button>
                        </div>
                    )}

                    {filteredTasks.length === 0 && (
                        <div className="text-center py-20 text-muted-foreground">
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                                <Filter size={32} className="opacity-50" />
                            </div>
                            <p className="text-lg font-medium text-foreground">No tasks found</p>
                            <p className="text-sm">Try adjusting your filters or search query.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
