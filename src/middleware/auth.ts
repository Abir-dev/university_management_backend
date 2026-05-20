import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/index.js";

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }

    const session = await prisma.session.findUnique({
      where: { token },
      include: {
        user: true,
      },
    });

    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
    }

    req.user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role as "admin" | "teacher" | "student",
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden: Admin access required" });
  }
  next();
};

export const isTeacher = (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== "teacher" && req.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden: Teacher or Admin access required" });
  }
  next();
};

export const isStudent = (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== "student" && req.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden: Student or Admin access required" });
  }
  next();
};
