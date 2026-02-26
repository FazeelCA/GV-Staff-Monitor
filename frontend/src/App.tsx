import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import React from 'react';
import TeamView from './pages/TeamView';
import UserDetailView from './pages/UserDetailView';
import LoginView from './pages/LoginView';
import UsersView from './pages/UsersView';
import TasksView from './pages/TasksView';
import SettingsView from './pages/SettingsView';
import ScreenshotsView from './pages/ScreenshotsView';
import WebsitesView from './pages/WebsitesView';
import WorkHoursView from './pages/WorkHoursView';
import Layout from './components/Layout';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  const location = useLocation();

  if (!token || !userStr) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  try {
    const user = JSON.parse(userStr);
    if (user.role !== 'ADMIN') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      return <Navigate to="/login" state={{ from: location }} replace />;
    }
  } catch (e) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginView />} />

          <Route path="/" element={<RequireAuth><TeamView /></RequireAuth>} />
          <Route path="/users" element={<RequireAuth><UsersView /></RequireAuth>} />
          <Route path="/tasks" element={<RequireAuth><TasksView /></RequireAuth>} />
          <Route path="/screenshots" element={<RequireAuth><ScreenshotsView /></RequireAuth>} />

          <Route path="/monitor/websites" element={<RequireAuth><WebsitesView /></RequireAuth>} />
          <Route path="/monitor/work-hours" element={<RequireAuth><WorkHoursView /></RequireAuth>} />

          <Route path="/settings" element={<RequireAuth><SettingsView /></RequireAuth>} />

          <Route path="/user/:userId" element={<RequireAuth><UserDetailView /></RequireAuth>} />
        </Routes>
      </BrowserRouter>
    </>
  );
}
