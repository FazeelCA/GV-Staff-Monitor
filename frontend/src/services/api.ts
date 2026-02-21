
const BASE = 'https://track.gallerydigital.in/api';

export type UserRole = 'ADMIN' | 'STAFF';
export type UserStatus = 'Working' | 'On Break' | 'Offline' | 'Online';

export interface DashboardUser {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    currentTask: string;
    totalHoursToday: number;
}

export interface Screenshot {
    id: string;
    userId: string;
    imageUrl: string;
    hash?: string;
    activityCount?: number;
    taskAtTheTime: string;
    timestamp: string;
}

// User Management
export interface User {
    id: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'STAFF';
    createdAt: string;
}

// Helper to get headers with Auth
function getHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
    };
}

export async function login(email: string, password: string) {
    const res = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Login failed');
    }
    const data = await res.json();
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    return data;
}

export async function updateProfile(data: { name: string; email: string; bio?: string }) {
    const res = await fetch(`${BASE}/auth/me`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update profile');
    }
    const updatedUser = await res.json();

    // Update local storage user data
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    localStorage.setItem('user', JSON.stringify({ ...currentUser, ...updatedUser }));

    return updatedUser;
}

export function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}

export async function fetchUsers(): Promise<User[]> {
    const res = await fetch(`${BASE}/users`, { headers: getHeaders() });
    if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
    if (!res.ok) throw new Error('Failed to fetch users');
    return res.json();
}

export async function createUser(data: any): Promise<User> {
    const res = await fetch(`${BASE}/users`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create user');
    }
    return res.json();
}

export async function deleteUser(id: string) {
    const res = await fetch(`${BASE}/users/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete user');
    return res.json();
}

export async function resetUserPassword(id: string, password: string) {
    const res = await fetch(`${BASE}/users/${id}/password`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ password }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to reset password');
    }
    return res.json();
}

export async function resetUserHours(id: string) {
    const res = await fetch(`${BASE}/users/${id}/time-logs/today`, {
        method: 'DELETE',
        headers: getHeaders(),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to reset hours');
    }
    return res.json();
}

export async function fetchDashboardUsers(): Promise<DashboardUser[]> {
    const res = await fetch(`${BASE}/dashboard/users?t=${Date.now()}`, { headers: getHeaders() });
    if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
    if (!res.ok) throw new Error('Failed to fetch users');
    return res.json();
}

export async function fetchUserScreenshots(userId: string, date?: string): Promise<Screenshot[]> {
    const url = date
        ? `${BASE}/dashboard/screenshots/${userId}?date=${date}`
        : `${BASE}/dashboard/screenshots/${userId}`;
    const res = await fetch(url, { headers: getHeaders() });
    if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
    if (!res.ok) throw new Error('Failed to fetch screenshots');
    return res.json();
}

export async function fetchUserHistory(userId: string, date?: string) {
    const url = date
        ? `${BASE}/users/${userId}/history?date=${date}`
        : `${BASE}/users/${userId}/history`;
    const res = await fetch(url, { headers: getHeaders() });
    if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
    if (!res.ok) throw new Error('Failed to fetch history');
    return res.json();
}

export async function logTimeEvent(
    userId: string,
    type: 'START' | 'BREAK_START' | 'BREAK_END' | 'STOP',
    currentTask: string
) {
    const res = await fetch(`${BASE}/time/log`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ userId, type, currentTask }),
    });
    if (!res.ok) throw new Error('Failed to log time event');
    return res.json();
}

export async function uploadScreenshot(
    userId: string,
    file: File,
    taskAtTheTime: string
) {
    const token = localStorage.getItem('token');
    const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};

    const form = new FormData();
    form.append('userId', userId);
    form.append('image', file);
    form.append('taskAtTheTime', taskAtTheTime);

    const res = await fetch(`${BASE}/screenshots/upload`, {
        method: 'POST',
        headers,
        body: form
    });
    if (!res.ok) throw new Error('Failed to upload screenshot');
    return res.json();
}

export interface Task {
    id: string;
    title: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
    userId: string;
    createdAt: string;
    user?: {
        name: string;
        email: string;
    };
}

export async function fetchAllTasks(): Promise<Task[]> {
    const res = await fetch(`${BASE}/tasks`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch tasks');
    return res.json();
}

export const fetchAllScreenshots = async (filters?: { userId?: string; date?: string }): Promise<(Screenshot & { user: { name: string; email: string } })[]> => {
    const params = new URLSearchParams();
    if (filters?.userId && filters.userId !== 'ALL') params.append('userId', filters.userId);
    if (filters?.date) params.append('date', filters.date);

    const token = localStorage.getItem('token');
    const res = await fetch(`${BASE}/dashboard/all-screenshots?${params.toString()}`, {
        headers: {
            'Authorization': token ? `Bearer ${token}` : '',
        },
    });
    if (!res.ok) throw new Error('Failed to fetch screenshots');
    return res.json();
};

export const fetchUserTasks = async (userId: string, date?: string): Promise<Task[]> => {
    const token = localStorage.getItem('token');
    const url = date
        ? `${BASE}/tasks/user/${userId}?date=${date}`
        : `${BASE}/tasks/user/${userId}`;

    const res = await fetch(url, {
        headers: {
            'Authorization': token ? `Bearer ${token}` : '',
        },
    });
    if (!res.ok) throw new Error('Failed to fetch user tasks');
    return res.json();
};

export async function deleteScreenshot(id: string) {
    const res = await fetch(`${BASE}/screenshots/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete screenshot');
    }
    return res.json();
}

export async function pushAdminMessage(userId: string, message: string) {
    const res = await fetch(`${BASE}/messages/push/${userId}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ message }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to send message');
    }
    return res.json();
}

export async function fetchUnreadMessages() {
    const res = await fetch(`${BASE}/messages/unread`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch messages');
    return res.json();
}

export async function markMessageRead(id: string) {
    const res = await fetch(`${BASE}/messages/${id}/read`, {
        method: 'PUT',
        headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to mark message read');
    return res.json();
}
