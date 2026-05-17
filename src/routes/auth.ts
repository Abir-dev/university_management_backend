import express from "express";
import argon2 from "argon2";
import { nanoid } from "nanoid";
import { prisma, Role } from "../db/index.js";

const router = express.Router();

// Register new user (Manual Auth)
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, role = "student" } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(409).json({ error: "User already exists" });
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
          emailVerified: false,
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
      message: "User registered successfully",
      data: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Failed to register user" });
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
