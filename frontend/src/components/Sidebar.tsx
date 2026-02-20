
import { NavLink, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    CheckSquare,
    Settings,
    LogOut,
    Monitor,
    Globe,
    Clock
} from 'lucide-react';
import { logout } from '../services/api';
import { useState } from 'react';

export default function Sidebar() {
    const navigate = useNavigate();
    const [collapsed, setCollapsed] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <aside
            className={`
                fixed left-0 top-0 h-screen z-50 transition-all duration-300 ease-in-out
                border-r border-white/5 bg-black/20 backdrop-blur-xl
                ${collapsed ? 'w-20' : 'w-72'}
            `}
        >
            {/* Logo Area */}
            <div className="h-20 flex items-center px-6 border-b border-white/5">
                <div className="flex items-center gap-4 overflow-hidden">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex-shrink-0 flex items-center justify-center text-white font-bold text-sm shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                        GV
                    </div>
                    <span className={`font-bold text-lg tracking-tight whitespace-nowrap transition-opacity duration-300 ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
                        Staff Monitor
                    </span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-8 px-4 space-y-2 overflow-y-auto">
                <NavItem to="/" icon={<LayoutDashboard size={22} />} label="Dashboard" collapsed={collapsed} />
                <NavItem to="/users" icon={<Users size={22} />} label="Staff Management" collapsed={collapsed} />
                <NavItem to="/tasks" icon={<CheckSquare size={22} />} label="Tasks" collapsed={collapsed} />
                <NavItem to="/screenshots" icon={<Monitor size={22} />} label="Screenshots" collapsed={collapsed} />

                {/* Monitor Submenu */}
                <div className="pt-2">
                    <div className={`px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider ${collapsed ? 'hidden' : 'block'}`}>
                        Monitor
                    </div>
                    <NavItem to="/monitor/websites" icon={<Globe size={22} />} label="Websites" collapsed={collapsed} />
                    <NavItem to="/monitor/work-hours" icon={<Clock size={22} />} label="Work Hours" collapsed={collapsed} />
                </div>

                <div className="my-6 border-t border-white/5 mx-2" />

                <NavItem to="/settings" icon={<Settings size={22} />} label="Settings" collapsed={collapsed} />
            </nav>

            {/* Footer / User */}
            <div className="p-4 border-t border-white/5 bg-white/2">
                <button
                    onClick={handleLogout}
                    className={`
                        flex items-center gap-3 w-full px-3 py-3 rounded-xl 
                        text-muted-foreground hover:text-white hover:bg-white/5 transition-all group
                        ${collapsed ? 'justify-center' : ''}
                    `}
                >
                    <LogOut size={20} className="group-hover:text-red-400 transition-colors" />
                    <span className={`font-medium whitespace-nowrap transition-all duration-300 ${collapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-auto opacity-100'}`}>
                        Sign Out
                    </span>
                </button>
            </div>

            {/* Collapse Toggle (Optional, mostly for desktop polish) */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="absolute -right-3 top-10 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs border border-[#09090b] shadow-lg hover:scale-110 transition-transform cursor-pointer z-50"
            >
                {collapsed ? '→' : '←'}
            </button>
        </aside>
    );
}

function NavItem({ to, icon, label, collapsed }: { to: string; icon: React.ReactNode; label: string; collapsed: boolean }) {
    return (
        <NavLink
            to={to}
            className={({ isActive }) => `
                flex items-center gap-4 px-3.5 py-3 rounded-xl font-medium transition-all duration-300 group
                ${isActive
                    ? 'bg-primary/10 text-primary shadow-[0_0_20px_rgba(99,102,241,0.15)] border border-primary/20'
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }
                ${collapsed ? 'justify-center' : ''}
            `}
        >
            <div className={`transition-transform duration-300 ${collapsed ? 'scale-110' : ''}`}>
                {icon}
            </div>
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                {label}
            </span>

            {!collapsed && (
                <div className="ml-auto opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                    →
                </div>
            )}
        </NavLink>
    );
}
