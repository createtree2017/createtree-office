import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

const ProtectedRoute = () => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;

    if (!token || !user) {
        return <Navigate to="/login" replace />;
    }

    // 승인되지 않은 경우 로그아웃 처리하거나 알림 페이지로 이동시킬 수 있으나,
    // 여기서는 로그인 페이지에서 이미 걸러주므로 추가적인 보안 레이어로 작동합니다.
    if (!user.isApproved) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
