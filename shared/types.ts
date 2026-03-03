export type UserRole = "ADMIN" | "MANAGER" | "USER";

export interface User {
    id: number;
    email: string;
    name: string;
    role: UserRole;
    isApproved: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface AuthResponse {
    user: Omit<User, "password">;
    token: string;
}

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
}
