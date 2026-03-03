
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
    totalCheckedInHoursToday?: number;
    totalWorkedHoursToday?: number;
    expectedStartTime?: string;
    firstStartTime?: string | null;
}

export interface Screenshot {
    id: string;
    userId: string;
    imageUrl: string;
    thumbnailUrl?: string;
    hash?: string;
    activityCount?: number;
    taskAtTheTime: string | null;
    timestamp: string;
    appName?: string;
    windowTitle?: string;
    user?: { name: string };
}

// User Management
export interface User {
    id: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'STAFF';
    expectedStartTime?: string;
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

    // Web Dashboard Security Check: Block non-admins from entering the Manager Portal
    if (data.user.role !== 'ADMIN') {
        throw new Error("Access denied: You must be an Administrator to access the Manager Portal. Please use the Desktop Tracker App.");
    }

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

export async function updateUserRole(userId: string, role: 'STAFF' | 'ADMIN') {
    const res = await fetch(`${BASE}/users/${userId}/role`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ role }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update user role');
    }
    return res.json();
}

export async function updateUserStartTime(userId: string, expectedStartTime: string) {
    const res = await fetch(`${BASE}/users/${userId}/start-time`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ expectedStartTime }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update expected start time');
    }
    return res.json();
}

export async function updateUserName(id: string, name: string) {
    const res = await fetch(`${BASE}/users/${id}/name`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ name }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update username');
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

export async function fetchDashboardUsers(filters?: { date?: string; startDate?: string; endDate?: string }): Promise<DashboardUser[]> {
    const params = new URLSearchParams();
    params.append('t', Date.now().toString());
    if (filters?.startDate && filters?.endDate) {
        params.append('startDate', filters.startDate);
        params.append('endDate', filters.endDate);
    } else if (filters?.date) {
        params.append('date', filters.date);
    }

    const res = await fetch(`${BASE}/dashboard/users?${params.toString()}`, { headers: getHeaders() });
    if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
    if (!res.ok) throw new Error('Failed to fetch users');
    return res.json();
}

export async function fetchUserScreenshots(userId: string, filters?: { date?: string; startDate?: string; endDate?: string; page?: number; limit?: number } | string): Promise<Screenshot[]> {
    const params = new URLSearchParams();
    if (typeof filters === 'string') {
        params.append('date', filters);
    } else if (filters) {
        if (filters.startDate && filters.endDate) {
            params.append('startDate', filters.startDate);
            params.append('endDate', filters.endDate);
        } else if (filters.date) {
            params.append('date', filters.date);
        }
        if (filters.page) params.append('page', filters.page.toString());
        if (filters.limit) params.append('limit', filters.limit.toString());
    }

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const url = `${BASE}/dashboard/screenshots/${userId}${queryString}`;
    const res = await fetch(url, { headers: getHeaders() });
    if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
    if (!res.ok) throw new Error('Failed to fetch screenshots');
    return res.json();
}

export async function fetchUserHistory(userId: string, filters?: { date?: string; startDate?: string; endDate?: string } | string) {
    const params = new URLSearchParams();
    if (typeof filters === 'string') {
        params.append('date', filters);
    } else if (filters) {
        if (filters.startDate && filters.endDate) {
            params.append('startDate', filters.startDate);
            params.append('endDate', filters.endDate);
        } else if (filters.date) {
            params.append('date', filters.date);
        }
    }

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const url = `${BASE}/users/${userId}/history${queryString}`;
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
    updatedAt?: string;
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

export const fetchAllScreenshots = async (filters?: { userId?: string; date?: string; startDate?: string; endDate?: string; page?: number; limit?: number; activityFilter?: 'All' | 'Low Activity' }): Promise<(Screenshot & { user: { name: string; email: string } })[]> => {
    const params = new URLSearchParams();
    if (filters?.userId && filters.userId !== 'ALL') params.append('userId', filters.userId);
    if (filters?.startDate && filters?.endDate) {
        params.append('startDate', filters.startDate);
        params.append('endDate', filters.endDate);
    } else if (filters?.date) {
        params.append('date', filters.date);
    }
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.activityFilter && filters.activityFilter !== 'All') params.append('activityFilter', filters.activityFilter);

    const token = localStorage.getItem('token');
    const res = await fetch(`${BASE}/dashboard/all-screenshots?${params.toString()}`, {
        headers: {
            'Authorization': token ? `Bearer ${token}` : '',
        },
    });
    if (!res.ok) throw new Error('Failed to fetch screenshots');
    return res.json();
};

export const fetchUserTasks = async (userId: string, filters?: { date?: string; startDate?: string; endDate?: string } | string): Promise<Task[]> => {
    const token = localStorage.getItem('token');
    const params = new URLSearchParams();
    if (typeof filters === 'string') {
        params.append('date', filters);
    } else if (filters) {
        if (filters.startDate && filters.endDate) {
            params.append('startDate', filters.startDate);
            params.append('endDate', filters.endDate);
        } else if (filters.date) {
            params.append('date', filters.date);
        }
    }

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const url = `${BASE}/tasks/user/${userId}${queryString}`;

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
