import React from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Dashboard from './pages/Dashboard';
import ManualsPage from './pages/ManualsPage';
import AdminPage from './pages/AdminPage';
import TasksPage from './pages/TasksPage';
import MyPage from './pages/MyPage';
import DrivePage from './pages/DrivePage';
import TemplatesPage from './pages/TemplatesPage';
import TaskResponsePage from './pages/TaskResponsePage';
import MonitoringPage from './pages/MonitoringPage';

import ProtectedRoute from './components/ProtectedRoute';
import NavBar from './components/NavBar';

// NavBar를 포함한 레이아웃 래퍼
const AppLayout = () => (
    <>
        <NavBar />
        <Outlet />
    </>
);

function App() {
    return (
        <>
            <Toaster position="top-right" />
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />

                {/* Protected Routes - NavBar 포함 레이아웃 */}
                <Route element={<ProtectedRoute />}>
                    <Route element={<AppLayout />}>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/manuals" element={<ManualsPage />} />
                        <Route path="/manuals/:id" element={<ManualsPage />} />
                        <Route path="/tasks" element={<TasksPage />} />
                        <Route path="/tasks/:taskId/response" element={<TaskResponsePage />} />
                        <Route path="/drive" element={<DrivePage />} />
                        <Route path="/monitoring" element={<MonitoringPage />} />
                        <Route path="/admin" element={<AdminPage />} />
                        <Route path="/templates" element={<TemplatesPage />} />

                        <Route path="/mypage" element={<MyPage />} />
                    </Route>
                </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </>
    );
}

export default App;
