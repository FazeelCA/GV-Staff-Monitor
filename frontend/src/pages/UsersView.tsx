import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchUsers, createUser, deleteUser, updateUserRole, type User } from '../services/api';
import { UserPlus, Trash2, Shield, User as UserIcon, X, Mail, Lock, Edit3, Search } from 'lucide-react';
import { GlassCard, SkeletonGlassCard } from '../components/ui/GlassCard';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

export default function UsersView() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const navigate = useNavigate();

    // Form state
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<'STAFF' | 'ADMIN'>('STAFF');
    const [submitting, setSubmitting] = useState(false);

    const loadUsers = async () => {
        try {
            const data = await fetchUsers();
            setUsers(data);
            setError(null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUsers();
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await createUser({ name: newName, email: newEmail, password: newPassword, role: newRole });
            setShowModal(false);
            setNewName(''); setNewEmail(''); setNewPassword(''); setNewRole('STAFF');
            loadUsers();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) return;
        try {
            await deleteUser(id);
            setUsers(u => u.filter(user => user.id !== id));
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleRoleUpdate = async (id: string, currentRole: string) => {
        const newRole = currentRole === 'STAFF' ? 'ADMIN' : 'STAFF';
        if (!confirm(`Are you sure you want to change this user's role to ${newRole}?`)) return;
        try {
            await updateUserRole(id, newRole as 'STAFF' | 'ADMIN');
            setUsers(u => u.map(user => user.id === id ? { ...user, role: newRole as 'STAFF' | 'ADMIN' } : user));
        } catch (e: any) {
            alert(e.message);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mb-2">
                        Staff Management
                    </h1>
                    <p className="text-muted-foreground">
                        Create and manage access for your team.
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="relative w-full sm:w-64 shrink-0">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search staff..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                        />
                    </div>
                    <Button
                        onClick={() => setShowModal(true)}
                        className="shadow-lg shadow-primary/20 shrink-0"
                    >
                        <UserPlus size={18} />
                        Add Member
                    </Button>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-2">
                    <span className="text-lg">⚠️</span>
                    Error loading users: {error}
                </div>
            )}

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <SkeletonGlassCard key={i} className="h-48" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {users.filter(user =>
                        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        user.email.toLowerCase().includes(searchQuery.toLowerCase())
                    ).map(user => (
                        <GlassCard
                            key={user.id}
                            className="group hover:border-primary/30 transition-all duration-300 cursor-pointer"
                            onClick={() => navigate(`/user/${user.id}`)}
                        >
                            <div className="flex items-start justify-between mb-6">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold shadow-lg 
                                    ${user.role === 'ADMIN'
                                        ? 'bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-purple-500/20'
                                        : 'bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-blue-500/20'
                                    }`}>
                                    {user.name.charAt(0)}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleRoleUpdate(user.id, user.role); }}
                                        className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                                        title={`Change Role (Current: ${user.role})`}
                                    >
                                        <Badge variant={user.role === 'ADMIN' ? 'glass' : 'outline'} className={user.role === 'ADMIN' ? 'bg-purple-500/10 text-purple-300 border-purple-500/20 cursor-pointer' : 'cursor-pointer'}>
                                            {user.role} <Edit3 size={10} className="ml-1 opacity-50" />
                                        </Badge>
                                    </button>

                                    {user.role !== 'ADMIN' && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(user.id); }}
                                            className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                            title="Delete User"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-1 mb-6">
                                <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">{user.name}</h3>
                                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                                    <Mail size={12} />
                                    {user.email}
                                </p>
                            </div>

                            <div className="pt-4 border-t border-white/5 flex items-center gap-2 text-xs text-muted-foreground">
                                <Shield size={12} />
                                <span>Joined {new Date(user.createdAt).toLocaleDateString()}</span>
                            </div>
                        </GlassCard>
                    ))}
                </div>
            )}

            {/* Create Modal */}
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
                    <div className="w-full max-w-md animate-in zoom-in-95 duration-200">
                        <GlassCard className="border-white/10 shadow-2xl">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-foreground">Add Team Member</h2>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="text-muted-foreground hover:text-foreground p-1 hover:bg-white/5 rounded-lg transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleCreate} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Full Name</label>
                                    <div className="relative">
                                        <UserIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                        <input
                                            required
                                            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-black/20 border border-white/10 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:outline-none text-foreground placeholder:text-muted-foreground/50 transition-all"
                                            value={newName} onChange={e => setNewName(e.target.value)}
                                            placeholder="John Doe"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Email Address</label>
                                    <div className="relative">
                                        <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                        <input
                                            required
                                            type="email"
                                            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-black/20 border border-white/10 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:outline-none text-foreground placeholder:text-muted-foreground/50 transition-all"
                                            value={newEmail} onChange={e => setNewEmail(e.target.value)}
                                            placeholder="john@example.com"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Password</label>
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
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Role</label>
                                    <div className="relative">
                                        <Shield size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                        <select
                                            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-black/20 border border-white/10 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:outline-none text-foreground transition-all appearance-none"
                                            value={newRole} onChange={e => setNewRole(e.target.value as any)}
                                        >
                                            <option value="STAFF" className="bg-[#09090b]">Staff Member</option>
                                            <option value="ADMIN" className="bg-[#09090b]">Administrator</option>
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                                            ▼
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    loading={submitting}
                                    className="w-full mt-4"
                                    size="lg"
                                >
                                    {submitting ? 'Creating Account...' : 'Create Account'}
                                </Button>
                            </form>
                        </GlassCard>
                    </div>
                </div>
            )}
        </div>
    );
}
