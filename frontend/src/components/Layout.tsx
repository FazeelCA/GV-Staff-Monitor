import { useState } from 'react';
import Sidebar from './Sidebar';

export default function Layout({ children }: { children: React.ReactNode }) {
    const [collapsed, setCollapsed] = useState(false);

    return (
        <div className="min-h-screen flex text-foreground font-sans">
            <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />

            {/* Main Content Area - with margin for sidebar */}
            <main className={`flex-1 min-h-screen transition-all duration-300 ${collapsed ? 'ml-20' : 'ml-20 md:ml-72'} relative z-0`}>
                <div className="max-w-7xl mx-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {children}
                </div>
            </main>
        </div>
    );
}
