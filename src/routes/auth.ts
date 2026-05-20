import express from "express";
import argon2 from "argon2";
import { nanoid } from "nanoid";
import jwt from "jsonwebtoken";
import { prisma, Role } from "../db/index.js";
import { authMiddleware, isAdmin } from "../middleware/auth.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"; // Ensure this is in .env

// Admin: Generate Invitation Link
router.post("/invite", authMiddleware, isAdmin, async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({ error: "Email and role are required" });
    }

    if (!["teacher", "student"].includes(role)) {
      return res.status(400).json({ error: "Invalid role. Only teacher or student can be invited." });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(409).json({ error: "User with this email already exists" });
    }

    // Generate short-lived token (5 minutes)
    const token = jwt.sign({ email, role }, JWT_SECRET, { expiresIn: "5m" });

    // In a real app, you'd send an email here. For now, we return the token/link.
    const inviteLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/join?token=${token}`;

    res.status(200).json({
      message: "Invitation generated successfully",
      data: {
        email,
        role,
        token,
        inviteLink
      },
    });
  } catch (error) {
    console.error("Invite error:", error);
    res.status(500).json({ error: "Failed to generate invitation" });
  }
});

// Join: Finalize registration (Set password)
router.post("/join", async (req, res) => {
  try {
    const { token, name, password } = req.body;

    if (!token || !name || !password) {
      return res.status(400).json({ error: "Token, name, and password are required" });
    }

    // Verify token
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired invitation link" });
    }

    const { email, role } = decoded;

    // Double check if user was created in the meantime
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(409).json({ error: "Account already created" });
    }

    // Hash password
    const hashedPassword = await argon2.hash(password);

    // Create user and credentials in a transaction
    const newUser = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          id: nanoid(),
          name,
          email,
          emailVerified: true, // They verified via the invite link
          role: role as Role,
        },
      });

      await tx.account.create({
        data: {
          id: nanoid(),
          userId: u.id,
          providerId: "credentials",
          accountId: email,
          password: hashedPassword,
        },
      });

      return u;
    });

    res.status(201).json({
      message: "Account created successfully",
      data: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error("Join error:", error);
    res.status(500).json({ error: "Failed to create account" });
  }
});

// Verification: Verify email manually
router.get("/verify-email", async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const updatedUser = await prisma.user.update({
      where: { email: email as string },
      data: { emailVerified: true },
    });

    res.status(200).json({
      message: "Email verified successfully",
      data: { email: updatedUser.email, emailVerified: updatedUser.emailVerified },
    });
  } catch (error) {
    console.error("Verify email error:", error);
    res.status(500).json({ error: "Failed to verify email. User may not exist." });
  }
});

// Verification: Verify token and return email/role
router.get("/verify-invite", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    const decoded = jwt.verify(token as string, JWT_SECRET);
    res.status(200).json({ data: decoded });
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired invitation link" });
  }
});

// Login (Manual Auth)
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user and their credentials
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        accounts: {
          where: { providerId: "credentials" },
        },
      },
    });

    if (!user || !user.accounts[0] || !user.accounts[0].password) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Verify password
    const validPassword = await argon2.verify(user.accounts[0].password, password);

    if (!validPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Create session
    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const session = await prisma.session.create({
      data: {
        id: nanoid(),
        userId: user.id,
        token,
        expiresAt,
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      },
    });

    res.status(200).json({
      message: "Logged in successfully",
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        session: {
          token: session.token,
          expiresAt: session.expiresAt,
        },
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Failed to login" });
  }
});

// Admin Login
router.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user and their credentials
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        accounts: {
          where: { providerId: "credentials" },
        },
      },
    });

    if (!user || user.role !== "admin" || !user.accounts[0] || !user.accounts[0].password) {
      return res.status(401).json({ error: "Invalid admin credentials" });
    }

    // Verify password
    const validPassword = await argon2.verify(user.accounts[0].password, password);

    if (!validPassword) {
      return res.status(401).json({ error: "Invalid admin credentials" });
    }

    // Create session
    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const session = await prisma.session.create({
      data: {
        id: nanoid(),
        userId: user.id,
        token,
        expiresAt,
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      },
    });

    res.status(200).json({
      message: "Admin logged in successfully",
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        session: {
          token: session.token,
          expiresAt: session.expiresAt,
        },
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ error: "Failed to login as admin" });
  }
});

// Logout
router.post("/logout", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
      return res.status(400).json({ error: "No token provided" });
    }

    await prisma.session.delete({
      where: { token },
    });

    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Failed to logout" });
  }
});

export default router;
