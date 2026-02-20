
import Sidebar from './Sidebar';

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex text-foreground font-sans">
            <Sidebar />

            {/* Main Content Area - with margin for sidebar */}
            {/* Note: In a real responsive app, we'd use context to adjust margin based on collapsed state. 
                For now, we'll assume default expanded width (w-72) or set a safe left margin. */}
            <main className="flex-1 min-h-screen transition-all duration-300 ml-20 md:ml-72 relative z-0">
                <div className="max-w-7xl mx-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {children}
                </div>
            </main>
        </div>
    );
}
