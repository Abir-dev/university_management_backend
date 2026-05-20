import express from "express";
import { prisma, Prisma, Role } from "../db/index.js";
import { authMiddleware, isTeacher } from "../middleware/auth.js";

const router = express.Router();

// Get all classes with optional search, subject, teacher filters, and pagination
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { search, subject, teacher, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);
    const offset = (currentPage - 1) * limitPerPage;

    const whereClause: Prisma.ClassWhereInput = {};

    if (search) {
      whereClause.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { inviteCode: { contains: search as string, mode: "insensitive" } },
      ];
    }

    if (subject) {
      whereClause.subject = {
        name: { contains: subject as string, mode: "insensitive" },
      };
    }

    if (teacher) {
      whereClause.teacher = {
        name: { contains: teacher as string, mode: "insensitive" },
      };
    }

    const [totalCount, classesList] = await prisma.$transaction([
      prisma.class.count({ where: whereClause }),
      prisma.class.findMany({
        where: whereClause,
        include: {
          subject: true,
          teacher: true,
        },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limitPerPage,
      }),
    ]);

    res.status(200).json({
      data: classesList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (error) {
    console.error("GET /classes error:", error);
    res.status(500).json({ error: "Failed to fetch classes" });
  }
});

router.post("/", authMiddleware, isTeacher, async (req, res) => {
  try {
    const {
      name,
      teacherId,
      subjectId,
      capacity,
      description,
      status,
      bannerUrl,
      bannerCldPubId,
    } = req.body;

    // Teachers can only create classes for themselves unless they are admins
    if (req.user?.id !== teacherId && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Forbidden: You can only create classes for yourself" });
    }

    const createdClass = await prisma.class.create({
      data: {
        subjectId,
        inviteCode: Math.random().toString(36).substring(2, 9),
        name,
        teacherId,
        bannerCldPubId,
        bannerUrl,
        capacity,
        description,
        schedules: [],
        status,
      },
      select: { id: true },
    });

    res.status(201).json({ data: createdClass });
  } catch (error) {
    console.error("POST /classes error:", error);
    res.status(500).json({ error: "Failed to create class" });
  }
});

// Get class details with counts
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const classId = Number(req.params.id);

    if (!Number.isFinite(classId)) {
      return res.status(400).json({ error: "Invalid class id" });
    }

    const classDetails = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        subject: {
          include: {
            department: true,
          },
        },
        teacher: true,
      },
    });

    if (!classDetails) {
      return res.status(404).json({ error: "Class not found" });
    }

    res.status(200).json({ data: classDetails });
  } catch (error) {
    console.error("GET /classes/:id error:", error);
    res.status(500).json({ error: "Failed to fetch class details" });
  }
});

// List users in a class by role with pagination
router.get("/:id/users", authMiddleware, async (req, res) => {
  try {
    const classId = Number(req.params.id);
    const { role, page = 1, limit = 10 } = req.query;

    if (!Number.isFinite(classId)) {
      return res.status(400).json({ error: "Invalid class id" });
    }

    if (role !== "teacher" && role !== "student") {
      return res.status(400).json({ error: "Invalid role" });
    }

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);
    const offset = (currentPage - 1) * limitPerPage;

    const where: Prisma.UserWhereInput =
      role === "teacher"
        ? {
            role: "teacher",
            classes: {
              some: {
                id: classId,
              },
            },
          }
        : {
            role: "student",
            enrollments: {
              some: {
                classId,
              },
            },
          };

    const [totalCount, usersList] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
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
    console.error("GET /classes/:id/users error:", error);
    res.status(500).json({ error: "Failed to fetch class users" });
  }
});

export default router;
