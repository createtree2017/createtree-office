import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_for_dev_only";

// 회원가입 (승인 대기 상태로 생성)
router.post("/register", async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ success: false, message: "모든 필드를 입력해주세요." });
        }

        const [existingUser] = await db.select().from(users).where(eq(users.email, email));
        if (existingUser) {
            return res.status(400).json({ success: false, message: "이미 가입된 이메일입니다." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [newUser] = await db.insert(users).values({
            email,
            password: hashedPassword,
            name,
            role: "USER",
            isApproved: false, // 기본적으로 미승인 상태
        }).returning();

        res.status(201).json({
            success: true,
            message: "회원가입 요청이 완료되었습니다. 관리자 승인 후 로그인이 가능합니다.",
            data: { id: newUser.id, email: newUser.email, name: newUser.name }
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "서버 오류가 발생했습니다.", error: error.message });
    }
});

// 로그인
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: "이메일과 비밀번호를 입력해주세요." });
        }

        const [user] = await db.select().from(users).where(eq(users.email, email));
        if (!user) {
            return res.status(400).json({ success: false, message: "가입되지 않은 이메일입니다." });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ success: false, message: "비밀번호가 일치하지 않습니다." });
        }

        if (!user.isApproved) {
            return res.status(403).json({
                success: false,
                message: "승인 대기 중입니다. 관리자에게 문의하세요.",
                code: "PENDING_APPROVAL"
            });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            data: {
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                }
            }
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "서버 오류가 발생했습니다.", error: error.message });
    }
});

// 승인된 모든 사용자 목록 조회 (업무 할당용 - 경량 데이터)
router.get("/users", authenticateToken, async (req: AuthRequest, res) => {
    try {
        const approvedUsers = await db.select({
            id: users.id,
            name: users.name,
            role: users.role,
        }).from(users).where(eq(users.isApproved, true));

        res.json({ success: true, data: approvedUsers });
    } catch (error: any) {
        res.status(500).json({ success: false, message: "사용자 목록을 불러오지 못했습니다." });
    }
});

export default router;
