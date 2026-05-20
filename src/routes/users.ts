import express from "express";
import { prisma, Role, Prisma } from "../db/index.js";
import { authMiddleware, isAdmin } from "../middleware/auth.js";

const router = express.Router();

// Get all users with optional search, role filter, and pagination
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { search, role, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);
    const offset = (currentPage - 1) * limitPerPage;

    const whereClause: Prisma.UserWhereInput = {};

    // Non-admins can only see teachers (Faculty)
    if (req.user?.role !== "admin") {
      whereClause.role = "teacher";
    } else if (role) {
      whereClause.role = role as Role;
    }

    if (search) {
      whereClause.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { email: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const [totalCount, usersList] = await prisma.$transaction([
      prisma.user.count({ where: whereClause }),
      prisma.user.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limitPerPage,
      }),
    ]);

    res.status(200).json({
      data: usersList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (error) {
    console.error("GET /users error:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Get user details with role-specific data
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.params.id as string;

    // Users can only view their own details unless they are admins
    if (req.user?.id !== userId && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Forbidden: You can only access your own profile" });
    }

    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!userRecord) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({ data: userRecord });
  } catch (error) {
    console.error("GET /users/:id error:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// List departments associated with a user
router.get("/:id/departments", authMiddleware, async (req, res) => {
  try {
    const userId = req.params.id as string;

    // Users can only view their own associated data unless they are admins
    if (req.user?.id !== userId && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Forbidden: You can only access your own data" });
    }

    const { page = 1, limit = 10 } = req.query;

    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!userRecord) {
      return res.status(404).json({ error: "User not found" });
    }

    if (userRecord.role !== "teacher" && userRecord.role !== "student") {
      return res.status(200).json({
        data: [],
        pagination: {
          page: 1,
          limit: 0,
          total: 0,
          totalPages: 0,
        },
      });
    }

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);
    const offset = (currentPage - 1) * limitPerPage;

    let where: Prisma.DepartmentWhereInput;
    if (userRecord.role === "teacher") {
      where = {
        subjects: {
          some: {
            classes: {
              some: {
                teacherId: userId,
              },
            },
          },
        },
      };
    } else {
      where = {
        subjects: {
          some: {
            classes: {
              some: {
                enrollments: {
                  some: {
                    studentId: userId,
                  },
                },
              },
            },
          },
        },
      };
    }

    const [totalCount, departmentsList] = await prisma.$transaction([
      prisma.department.count({ where }),
      prisma.department.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limitPerPage,
      }),
    ]);

    res.status(200).json({
      data: departmentsList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (error) {
    console.error("GET /users/:id/departments error:", error);
    res.status(500).json({ error: "Failed to fetch user departments" });
  }
});

// List subjects associated with a user
router.get("/:id/subjects", authMiddleware, async (req, res) => {
  try {
    const userId = req.params.id as string;

    // Users can only view their own associated data unless they are admins
    if (req.user?.id !== userId && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Forbidden: You can only access your own data" });
    }

    const { page = 1, limit = 10 } = req.query;

    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!userRecord) {
      return res.status(404).json({ error: "User not found" });
    }

    if (userRecord.role !== "teacher" && userRecord.role !== "student") {
      return res.status(200).json({
        data: [],
        pagination: {
          page: 1,
          limit: 0,
          total: 0,
          totalPages: 0,
        },
      });
    }

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);
    const offset = (currentPage - 1) * limitPerPage;

    let where: Prisma.SubjectWhereInput;
    if (userRecord.role === "teacher") {
      where = {
        classes: {
          some: {
            teacherId: userId,
          },
        },
      };
    } else {
      where = {
        classes: {
          some: {
            enrollments: {
              some: {
                studentId: userId,
              },
            },
          },
        },
      };
    }

    const [totalCount, subjectsList] = await prisma.$transaction([
      prisma.subject.count({ where }),
      prisma.subject.findMany({
        where,
        include: {
          department: true,
        },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limitPerPage,
      }),
    ]);

    res.status(200).json({
      data: subjectsList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (error) {
    console.error("GET /users/:id/subjects error:", error);
    res.status(500).json({ error: "Failed to fetch user subjects" });
  }
});

export default router;
