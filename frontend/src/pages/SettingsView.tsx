import { useState } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { User, Bell, Shield, Smartphone, Globe, Save } from 'lucide-react';

export default function SettingsView() {
    const [loading, setLoading] = useState(false);

    const handleSave = () => {
        setLoading(true);
        // Simulate API call
        setTimeout(() => setLoading(false), 1500);
    };

    return (
        <div className="space-y-8 max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mb-2">
                        Settings
                    </h1>
                    <p className="text-muted-foreground">
                        Manage your account settings and application preferences.
                    </p>
                </div>
                <Button
                    onClick={handleSave}
                    loading={loading}
                    className="shadow-lg shadow-primary/20"
                >
                    <Save size={18} />
                    Save Changes
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Sidebar / Navigation for Settings */}
                <div className="space-y-4 lg:col-span-1">
                    <GlassCard className="p-2 space-y-1">
                        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 text-foreground font-medium transition-all border border-white/5">
                            <User size={18} className="text-primary" />
                            Profile
                        </button>
                        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-foreground font-medium transition-all">
                            <Bell size={18} />
                            Notifications
                        </button>
                        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-foreground font-medium transition-all">
                            <Shield size={18} />
                            Security
                        </button>
                    </GlassCard>

                    <GlassCard className="space-y-4">
                        <h3 className="font-semibold text-foreground flex items-center gap-2">
                            <Smartphone size={16} />
                            System Info
                        </h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Version</span>
                                <span className="text-foreground">v1.0.0</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Platform</span>
                                <Badge variant="outline" className="text-[10px]">Tauri / React</Badge>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Last Update</span>
                                <span className="text-foreground">Today</span>
                            </div>
                        </div>
                    </GlassCard>
                </div>

                {/* Main Content Area */}
                <div className="space-y-6 lg:col-span-2">
                    {/* Profile Section */}
                    <GlassCard className="space-y-6">
                        <div className="flex items-center gap-4 pb-6 border-b border-white/5">
                            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-3xl font-bold text-white shadow-xl shadow-indigo-500/20">
                                A
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-foreground">Admin User</h2>
                                <p className="text-sm text-muted-foreground">admin@example.com</p>
                                <Button variant="outline" size="sm" className="mt-2 h-8 text-xs">
                                    Change Avatar
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Full Name</label>
                                <input
                                    type="text"
                                    defaultValue="Admin User"
                                    className="w-full px-4 py-2.5 rounded-xl bg-black/20 border border-white/10 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:outline-none text-foreground transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email Address</label>
                                <input
                                    type="email"
                                    defaultValue="admin@example.com"
                                    className="w-full px-4 py-2.5 rounded-xl bg-black/20 border border-white/10 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:outline-none text-foreground transition-all"
                                />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bio</label>
                                <textarea
                                    rows={3}
                                    defaultValue="System Administrator"
                                    className="w-full px-4 py-2.5 rounded-xl bg-black/20 border border-white/10 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:outline-none text-foreground transition-all resize-none"
                                />
                            </div>
                        </div>
                    </GlassCard>

                    {/* Preferences */}
                    <GlassCard>
                        <h3 className="font-bold text-lg text-foreground mb-4 flex items-center gap-2">
                            <Globe size={18} />
                            Regional Settings
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Language</label>
                                <select className="w-full px-4 py-2.5 rounded-xl bg-black/20 border border-white/10 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:outline-none text-foreground transition-all appearance-none cursor-pointer">
                                    <option className="bg-[#09090b]">English (US)</option>
                                    <option className="bg-[#09090b]">Spanish</option>
                                    <option className="bg-[#09090b]">French</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timezone</label>
                                <select className="w-full px-4 py-2.5 rounded-xl bg-black/20 border border-white/10 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:outline-none text-foreground transition-all appearance-none cursor-pointer">
                                    <option className="bg-[#09090b]">UTC (GMT+00:00)</option>
                                    <option className="bg-[#09090b]">EST (GMT-05:00)</option>
                                    <option className="bg-[#09090b]">PST (GMT-08:00)</option>
                                </select>
                            </div>
                        </div>
                    </GlassCard>
                </div>
            </div>
        </div>
    );
}
