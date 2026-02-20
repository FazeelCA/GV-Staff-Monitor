
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/api';

export default function LoginView() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await login(email, password);
            navigate('/');
        } catch (err: any) {
            setError(err.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-primary)' }}>
            <div className="w-full max-w-md p-8 rounded-2xl border bg-black/40 backdrop-blur-xl" style={{ borderColor: 'var(--border)' }}>
                <div className="text-center mb-8">
                    <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center text-white font-bold text-lg mb-4" style={{ background: 'var(--accent)' }}>
                        GV
                    </div>
                    <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Manager Portal</h1>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Sign in to monitor staff activity</p>
                </div>

                {error && (
                    <div className="mb-6 p-4 rounded-xl text-sm bg-red-500/10 border border-red-500/20 text-red-400">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium mb-1.5 ml-1" style={{ color: 'var(--text-secondary)' }}>Email Address</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-white placeholder-white/20"
                            placeholder="admin@example.com"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium mb-1.5 ml-1" style={{ color: 'var(--text-secondary)' }}>Password</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-white placeholder-white/20"
                            placeholder="••••••••"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 rounded-xl font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                        style={{ background: 'var(--accent)' }}
                    >
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>
            </div>
        </div>
    );
}
