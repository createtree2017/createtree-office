import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_for_dev_only";

export interface AuthRequest extends Request {
    user?: {
        id: number;
        email: string;
        role: string;
        clientId?: number | null;
    };
}

export const authenticateToken = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ success: false, message: "Authentication token required" });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;

        // DB에서 최신 정보 확인 (승인 여부 등)
        const [user] = await db.select().from(users).where(eq(users.id, decoded.id));

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (!user.isApproved) {
            return res.status(403).json({
                success: false,
                message: "승인 대기 중입니다. 관리자에게 승인을 요청하세요.",
                code: "PENDING_APPROVAL"
            });
        }

        req.user = {
            id: user.id,
            email: user.email,
            role: user.role,
            clientId: user.clientId
        };

        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }
};

export const authorizeRole = (roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: "권한이 없습니다." });
        }
        next();
    };
};
