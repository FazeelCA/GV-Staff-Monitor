import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type WorkState = "Online" | "Working" | "OnBreak" | "Offline";
type Screen = "login" | "tracker" | "history";

interface User { id: string; name: string; email: string; role: string; }
interface Task { id: string; title: string; note: string; }
interface DayHistory {
    date: string;
    totalWorkedSeconds: number;
    tasks: Task[];
}

// ─── Config ───────────────────────────────────────────────────────────────────
const API = "http://localhost:4000";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}
function fmtHours(sec: number) {
    if (sec === 0) return "0h";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtDate(iso: string) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const target = new Date(iso); target.setHours(0, 0, 0, 0);
    if (target.getTime() === today.getTime()) return "Today";
    if (target.getTime() === yesterday.getTime()) return "Yesterday";
    return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
function initials(name: string) {
    return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}
function greeting() {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
}

// ─── Safe Tauri invoke ────────────────────────────────────────────────────────
async function tauriCmd(name: string, args?: Record<string, unknown>) {
    try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke(name, args ?? {});
    } catch { /* graceful no-op outside Tauri */ }
}

// ─── API helpers ──────────────────────────────────────────────────────────────
async function apiFetch(path: string, token: string, opts: RequestInit = {}) {
    const res = await fetch(`${API}${path}`, {
        ...opts,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(opts.headers ?? {}),
        },
    });
    if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
    return res.json();
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<WorkState, { label: string; color: string; bg: string; glow: string; dot: string }> = {
    Online: { label: "Online", color: "text-sky-400", bg: "bg-sky-500/15 border-sky-500/30", glow: "shadow-sky-500/20", dot: "bg-sky-400" },
    Working: { label: "Working", color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/30", glow: "shadow-emerald-500/20", dot: "bg-emerald-400 animate-pulse" },
    OnBreak: { label: "On Break", color: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/30", glow: "shadow-amber-500/20", dot: "bg-amber-400 animate-pulse" },
    Offline: { label: "Offline", color: "text-slate-500", bg: "bg-slate-500/10 border-slate-500/20", glow: "", dot: "bg-slate-500" },
};

// ═════════════════════════════════════════════════════════════════════════════
// ROOT
// ═════════════════════════════════════════════════════════════════════════════
export default function TrackerApp() {
    const [screen, setScreen] = useState<Screen>("login");
    const [token, setToken] = useState("");
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        const t = localStorage.getItem("gv_token");
        const u = localStorage.getItem("gv_user");
        if (t && u) {
            const userObj = JSON.parse(u);
            setToken(t); setUser(userObj); setScreen("tracker");
            tauriCmd("set_auth", { token: t, userId: userObj.id });
        }
    }, []);

    function handleLogin(t: string, u: User) {
        localStorage.setItem("gv_token", t);
        localStorage.setItem("gv_user", JSON.stringify(u));
        setToken(t); setUser(u); setScreen("tracker");
        tauriCmd("set_auth", { token: t, userId: u.id });
    }
    function handleLogout() {
        localStorage.removeItem("gv_token");
        localStorage.removeItem("gv_user");
        tauriCmd("set_auth", { token: "", userId: "" });
        setToken(""); setUser(null); setScreen("login");
    }

    if (screen === "login") return <LoginScreen onLogin={handleLogin} />;
    if (screen === "history") return <HistoryScreen token={token} user={user!} onBack={() => setScreen("tracker")} />;
    return <TrackerScreen token={token} user={user!} onLogout={handleLogout} onHistory={() => setScreen("history")} />;
}

// ═════════════════════════════════════════════════════════════════════════════
// LOGIN SCREEN
// ═════════════════════════════════════════════════════════════════════════════
function LoginScreen({ onLogin }: { onLogin: (token: string, user: User) => void }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(""); setLoading(true);
        try {
            const res = await fetch(`${API}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Login failed");
            onLogin(data.token, data.user);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="h-screen w-full bg-[#080a0f] flex flex-col overflow-hidden relative select-none font-sans justify-center">
            {/* Background gradient orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-32 -left-32 w-80 h-80 bg-indigo-600/20 rounded-full blur-3xl opacity-50" />
                <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-violet-600/15 rounded-full blur-3xl opacity-50" />
            </div>

            <div className="relative flex-1 flex flex-col items-center justify-center w-full" style={{ padding: '40px' }}>
                {/* Brand mark */}
                <div className="mb-10 text-center shrink-0">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-xl shadow-indigo-500/30 mx-12">
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">GV Staff Monitor</h1>
                    <p className="text-slate-400 text-sm mt-1.5">Sign in to start your work session</p>
                </div>

                {/* Form card - Full width */}
                <div className="w-full shrink-0">
                    <form onSubmit={handleSubmit} className="w-full space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest pl-1">Email</label>
                            <input
                                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                                placeholder="you@company.com"
                                className="w-full h-11 bg-white/[0.06] border border-white/10 rounded-xl px-4 text-sm text-white placeholder-slate-600
                  focus:outline-none focus:border-indigo-500/70 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest pl-1">Password</label>
                            <input
                                type="password" value={password} onChange={e => setPassword(e.target.value)} required
                                placeholder="••••••••"
                                className="w-full h-11 bg-white/[0.06] border border-white/10 rounded-xl px-4 text-sm text-white placeholder-slate-600
                  focus:outline-none focus:border-indigo-500/70 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                            />
                        </div>

                        {error && (
                            <div className="flex items-center gap-2.5 bg-rose-500/10 border border-rose-500/25 rounded-xl px-4 py-3">
                                <span className="text-rose-400 text-base shrink-0">⚠</span>
                                <p className="text-rose-400 text-xs">{error}</p>
                            </div>
                        )}

                        <button type="submit" disabled={loading}
                            className="w-full h-12 mt-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500
                disabled:opacity-50 text-white font-semibold rounded-xl text-sm
                shadow-xl shadow-indigo-500/30 transition-all duration-200 active:scale-[0.98]">
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Signing in…
                                </span>
                            ) : "Sign In →"}
                        </button>
                    </form>
                </div>
            </div>

            {/* Footer */}
            <div className="relative text-center pb-6 shrink-0">
                <p className="text-slate-600 text-[10px] font-medium tracking-wide">Secure Work Tracking</p>
            </div>
        </div>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// TRACKER SCREEN
// ═════════════════════════════════════════════════════════════════════════════
function TrackerScreen({ token, user, onLogout, onHistory }: {
    token: string; user: User; onLogout: () => void; onHistory: () => void;
}) {
    const [workState, setWorkState] = useState<WorkState>("Online");
    const [secs, setSecs] = useState(0);
    const [taskInput, setTaskInput] = useState("");
    const [tasks, setTasks] = useState<Task[]>([]);
    const [taskErr, setTaskErr] = useState("");
    const [addingTask, setAddingTask] = useState(false);
    const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        try {
            // Load tasks
            setTasks(await apiFetch("/api/tasks", token));

            // Load today's history to init timer
            const history = await apiFetch("/api/staff/history?days=1", token);
            if (history && history.length > 0 && history[0].totalWorkedSeconds) {
                setSecs(history[0].totalWorkedSeconds);
            }
        } catch { }
    }

    const startTimer = useCallback(() => {
        if (ticker.current) return;
        ticker.current = setInterval(() => setSecs(s => s + 1), 1000);
    }, []);
    const stopTimer = useCallback(() => {
        if (ticker.current) { clearInterval(ticker.current); ticker.current = null; }
    }, []);
    useEffect(() => () => { if (ticker.current) clearInterval(ticker.current); }, []);

    async function logTime(type: string, task = "") {
        try {
            await fetch(`${API}/api/time/log`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ userId: user.id, type, currentTask: task }),
            });
        } catch { }
    }

    async function checkIn() {
        await logTime("START", taskInput);
        await tauriCmd("start_work", { task: taskInput });
        setWorkState("Working"); startTimer();
    }
    async function takeBreak() {
        await logTime("BREAK_START");
        await tauriCmd("take_break");
        setWorkState("OnBreak"); stopTimer();
    }
    async function resumeWork() {
        await logTime("BREAK_END", taskInput);
        await tauriCmd("resume_work");
        setWorkState("Working"); startTimer();
    }
    async function checkOut() {
        await logTime("STOP");
        await tauriCmd("stop_work");
        setWorkState("Online"); stopTimer();
        // Note: We do NOT reset secs to 0 here because "Time Today" should persist visually until new day
    }

    async function addTask() {
        const title = taskInput.trim();
        if (!title) { setTaskErr("Enter a task first"); return; }
        setTaskErr(""); setAddingTask(true);
        try {
            const { task } = await apiFetch("/api/tasks", token, {
                method: "POST", body: JSON.stringify({ title }),
            });
            setTasks(p => [...p, task]);
            setTaskInput("");
        } catch (e: any) { setTaskErr(e.message); }
        finally { setAddingTask(false); }
    }

    async function deleteTask(id: string) {
        try {
            await apiFetch(`/api/tasks/${id}`, token, { method: "DELETE" });
            setTasks(p => p.filter(t => t.id !== id));
        } catch { }
    }

    const st = STATUS_CONFIG[workState];
    const now = new Date();

    return (
        <div className="h-screen w-full bg-[#080a0f] text-white font-sans overflow-hidden relative select-none">
            {/* Background glow */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-[100px] opacity-25 transition-all duration-1000
          ${workState === "Working" ? "bg-emerald-500" : workState === "OnBreak" ? "bg-amber-500" : "bg-indigo-600"}`} />
            </div>

            {/* Main Wrapper with Padding Safe Zone */}
            <div className="relative h-full flex flex-col" style={{ padding: '32px', gap: '20px' }}>

                {/* ── Header ── */}
                <div className="shrink-0 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm font-bold shadow-lg">
                                {initials(user.name)}
                            </div>
                            <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 ${st.dot} rounded-full border-2 border-[#080a0f]`} />
                        </div>
                        <div>
                            <p className="text-white font-semibold text-sm leading-none">{user.name}</p>
                            <p className="text-slate-500 text-[10px] mt-0.5 capitalize">{user.role.toLowerCase()}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold ${st.color} ${st.bg}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                            {st.label}
                        </div>
                        <button onClick={onLogout} title="Sign out"
                            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-all">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── Greeting ── */}
                <div className="shrink-0">
                    <p className="text-slate-500 text-[11px] font-medium tracking-wide uppercase">
                        {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                    </p>
                    <p className="text-white text-xl font-bold mt-0.5 tracking-tight">{greeting()}, {user.name.split(" ")[0]} 👋</p>
                </div>

                {/* ── Timer Block (Full Width) ── */}
                <div className="shrink-0 rounded-2xl overflow-hidden relative group shadow-2xl">
                    <div className={`absolute inset-0 transition-all duration-700
           ${workState === "Working" ? "bg-gradient-to-br from-emerald-600/20 to-emerald-900/10 border border-emerald-500/20"
                            : workState === "OnBreak" ? "bg-gradient-to-br from-amber-600/20 to-amber-900/10 border border-amber-500/20"
                                : "bg-gradient-to-br from-white/[0.04] to-white/[0.02] border border-white/10"}`} />
                    <div className="relative px-6 py-6 text-center">
                        <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 font-bold">
                            {workState === "Working" ? "⏱ Sesssion Running" : workState === "OnBreak" ? "☕ On Break" : "Time Today"}
                        </p>
                        <p className={`text-6xl font-mono font-black tabular-nums tracking-tight transition-colors duration-500 text-shadow-lg
             ${workState === "Working" ? "text-emerald-300" : workState === "OnBreak" ? "text-amber-300" : "text-white/50"}`}>
                            {fmt(secs)}
                        </p>
                    </div>
                </div>

                {/* ── Task Input (Full Width) ── */}
                <div className="shrink-0">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <input
                                type="text" value={taskInput}
                                onChange={e => { setTaskInput(e.target.value); setTaskErr(""); }}
                                onKeyDown={e => e.key === "Enter" && addTask()}
                                placeholder="Add a task…"
                                className="w-full h-11 bg-white/[0.05] border border-white/10 rounded-xl pl-4 pr-4 text-sm text-white placeholder-slate-600
                  focus:outline-none focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/15 transition-all font-medium"
                            />
                        </div>
                        <button onClick={addTask} disabled={addingTask}
                            className="w-11 h-11 shrink-0 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl
                flex items-center justify-center shadow-lg shadow-indigo-500/25 transition-all duration-200 active:scale-95 text-lg font-bold">
                            {addingTask ? (
                                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            ) : "+"}
                        </button>
                    </div>
                    {taskErr && <p className="text-rose-400 text-xs mt-1.5 pl-1">{taskErr}</p>}
                </div>

                {/* ── Task List (Expands) ── */}
                <div className="flex-1 min-h-0 flex flex-col">
                    {tasks.length > 0 ? (
                        <>
                            <div className="flex items-center justify-between mb-2 px-1">
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Today's Tasks</p>
                                <span className="text-[10px] text-slate-600 font-mono bg-white/[0.05] px-1.5 py-0.5 rounded">{tasks.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 pb-1" style={{ scrollbarWidth: "none" }}>
                                {tasks.map((t, i) => (
                                    <div key={t.id}
                                        className="group flex items-center gap-3 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06] rounded-xl px-4 py-3 transition-all"
                                        style={{ animationDelay: `${i * 50}ms` }}>
                                        <div className="w-4 h-4 rounded-full border-2 border-indigo-500/50 flex items-center justify-center shrink-0">
                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                        </div>
                                        <p className="text-sm text-slate-300 flex-1 truncate font-medium">{t.title}</p>
                                        <button onClick={() => deleteTask(t.id)}
                                            className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-700 hover:text-rose-400 hover:bg-rose-500/10
                        opacity-0 group-hover:opacity-100 transition-all shrink-0">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center gap-2 opacity-30 border-2 border-dashed border-white/10 rounded-2xl mx-1">
                            <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            <p className="text-slate-500 text-xs font-medium">No tasks yet</p>
                        </div>
                    )}
                </div>

                {/* ── Action Buttons (Bottom Fixed) ── */}
                <div className="shrink-0 space-y-2.5">
                    {(workState === "Online" || workState === "Offline") && (
                        <button onClick={checkIn}
                            className="w-full h-12 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400
                text-white font-bold rounded-xl text-sm shadow-xl shadow-emerald-500/20 transition-all duration-200 active:scale-[0.98]
                flex items-center justify-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            </svg>
                            Check In — Start Working
                        </button>
                    )}

                    {workState === "Working" && (
                        <div className="flex gap-4">
                            <button onClick={takeBreak}
                                className="flex-1 h-12 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold rounded-xl text-sm
                  transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-1.5 backdrop-blur-sm">
                                <span>☕</span> Take a Break
                            </button>
                            <button onClick={checkOut}
                                className="flex-1 h-12 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-bold rounded-xl text-sm
                  transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-1.5 backdrop-blur-sm">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                                Check Out
                            </button>
                        </div>
                    )}

                    {workState === "OnBreak" && (
                        <div className="flex gap-4">
                            <button onClick={resumeWork}
                                className="flex-1 h-12 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 font-bold rounded-xl text-sm
                  transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-1.5 backdrop-blur-sm">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                </svg>
                                End Break
                            </button>
                            <button onClick={checkOut}
                                className="flex-1 h-12 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-bold rounded-xl text-sm
                  transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-1.5 backdrop-blur-sm">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                                Check Out
                            </button>
                        </div>
                    )}

                    <button onClick={onHistory}
                        className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-white/[0.03] border border-white/[0.07]
              text-slate-500 hover:text-slate-300 hover:bg-white/[0.07] text-xs font-medium transition-all">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        View Work History
                    </button>
                </div>
            </div>
        </div>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// HISTORY SCREEN
// ═════════════════════════════════════════════════════════════════════════════
function HistoryScreen({ token, user, onBack }: { token: string; user: User; onBack: () => void }) {
    const [history, setHistory] = useState<DayHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);

    useEffect(() => {
        apiFetch("/api/staff/history?days=10", token)
            .then(setHistory).catch(console.error).finally(() => setLoading(false));
    }, []);

    const activeDays = history.filter(d => d.totalWorkedSeconds > 0 || d.tasks.length > 0);
    const totalSecs = history.reduce((s, d) => s + d.totalWorkedSeconds, 0);
    const totalTasks = history.reduce((s, d) => s + d.tasks.length, 0);

    return (
        <div className="h-screen w-full bg-[#080a0f] text-white font-sans overflow-hidden relative select-none">
            {/* Background gradient */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl opacity-40" />
            </div>

            {/* Wrapper with Padding */}
            <div className="relative h-full flex flex-col" style={{ padding: '32px', gap: '20px' }}>

                {/* Header */}
                <div className="shrink-0 flex items-center gap-4">
                    <button onClick={onBack}
                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/[0.05] border border-white/10
              text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-95 shadow-lg">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div>
                        <h2 className="text-lg font-bold text-white tracking-tight">Work History</h2>
                        <p className="text-[11px] text-slate-500 font-medium">{user.name} · Last 10 days</p>
                    </div>
                </div>

                {/* Stats row - Full width */}
                {!loading && (
                    <div className="shrink-0 grid grid-cols-2 gap-4">
                        <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl px-12 py-4 shadow-lg">
                            <p className="text-emerald-400 text-2xl font-bold font-mono tracking-tight">{fmtHours(totalSecs)}</p>
                            <p className="text-slate-500 text-[10px] mt-1 uppercase tracking-wider font-bold">Total worked</p>
                        </div>
                        <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl px-12 py-4 shadow-lg">
                            <p className="text-indigo-400 text-2xl font-bold tracking-tight">{totalTasks}</p>
                            <p className="text-slate-500 text-[10px] mt-1 uppercase tracking-wider font-bold">Tasks logged</p>
                        </div>
                    </div>
                )}

                {/* List - expands */}
                <div className="flex-1 min-h-0 overflow-y-auto pr-1 pb-1" style={{ scrollbarWidth: "none" }}>
                    {loading ? (
                        <div className="h-full flex items-center justify-center">
                            <svg className="w-6 h-6 animate-spin text-slate-600" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        </div>
                    ) : activeDays.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center gap-3 opacity-40 border-2 border-dashed border-white/5 rounded-2xl">
                            <svg className="w-10 h-10 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                            </svg>
                            <p className="text-slate-500 text-sm font-medium">No work logged yet</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {activeDays.map(day => (
                                <div key={day.date} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden transition-all hover:bg-white/[0.05]">
                                    <button
                                        onClick={() => setExpanded(expanded === day.date ? null : day.date)}
                                        className="w-full flex items-center justify-between px-12 py-4">
                                        <div className="text-left">
                                            <p className="text-sm font-bold text-white">{fmtDate(day.date)}</p>
                                            <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
                                                {day.tasks.length} task{day.tasks.length !== 1 ? "s" : ""}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <p className="text-emerald-400 font-mono font-bold text-sm tracking-tight">{fmtHours(day.totalWorkedSeconds)}</p>
                                                <p className="text-[10px] text-slate-600 font-medium">worked</p>
                                            </div>
                                            <svg className={`w-4 h-4 text-slate-600 transition-transform duration-200 ${expanded === day.date ? "rotate-180" : ""}`}
                                                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </button>

                                    {expanded === day.date && (
                                        <div className="border-t border-white/[0.06] px-12 py-4 space-y-3 bg-black/20">
                                            {day.tasks.length === 0 ? (
                                                <p className="text-slate-600 text-xs italic">No tasks logged this day.</p>
                                            ) : day.tasks.map(t => (
                                                <div key={t.id} className="flex items-start gap-3">
                                                    <div className="w-4 h-4 rounded-full border-2 border-indigo-500/40 flex items-center justify-center shrink-0 mt-0.5">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/60" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm text-slate-300 font-medium leading-relaxed">{t.title}</p>
                                                        {t.note && <p className="text-xs text-slate-600 mt-0.5">{t.note}</p>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
