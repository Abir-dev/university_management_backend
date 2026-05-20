import express from "express";
import { prisma, Prisma, Role } from "../db/index.js";
import { authMiddleware, isAdmin } from "../middleware/auth.js";

const router = express.Router();

// Get all subjects with optional search, department filter, and pagination
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { search, department, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);
    const offset = (currentPage - 1) * limitPerPage;

    const whereClause: Prisma.SubjectWhereInput = {};

    if (search) {
      whereClause.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { code: { contains: search as string, mode: "insensitive" } },
      ];
    }

    if (department) {
      whereClause.department = {
        name: { contains: department as string, mode: "insensitive" },
      };
    }

    const [totalCount, subjectsList] = await prisma.$transaction([
      prisma.subject.count({ where: whereClause }),
      prisma.subject.findMany({
        where: whereClause,
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
    console.error("GET /subjects error:", error);
    res.status(500).json({ error: "Failed to fetch subjects" });
  }
});

router.post("/", authMiddleware, isAdmin, async (req, res) => {
  try {
    const { departmentId, name, code, description } = req.body;

    const createdSubject = await prisma.subject.create({
      data: { departmentId, name, code, description },
      select: { id: true },
    });

    res.status(201).json({ data: createdSubject });
  } catch (error) {
    console.error("POST /subjects error:", error);
    res.status(500).json({ error: "Failed to create subject" });
  }
});

// Get subject details with counts
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const subjectId = Number(req.params.id);

    if (!Number.isFinite(subjectId)) {
      return res.status(400).json({ error: "Invalid subject id" });
    }

    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      include: {
        department: true,
      },
    });

    if (!subject) {
      return res.status(404).json({ error: "Subject not found" });
    }

    const classesCount = await prisma.class.count({
      where: { subjectId },
    });

    res.status(200).json({
      data: {
        subject,
        totals: {
          classes: classesCount,
        },
      },
    });
  } catch (error) {
    console.error("GET /subjects/:id error:", error);
    res.status(500).json({ error: "Failed to fetch subject details" });
  }
});

// List classes in a subject with pagination
router.get("/:id/classes", authMiddleware, async (req, res) => {
  try {
    const subjectId = Number(req.params.id);
    const { page = 1, limit = 10 } = req.query;

    if (!Number.isFinite(subjectId)) {
      return res.status(400).json({ error: "Invalid subject id" });
    }

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);
    const offset = (currentPage - 1) * limitPerPage;

    const [totalCount, classesList] = await prisma.$transaction([
      prisma.class.count({
        where: { subjectId },
      }),
      prisma.class.findMany({
        where: { subjectId },
        include: {
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
    console.error("GET /subjects/:id/classes error:", error);
    res.status(500).json({ error: "Failed to fetch subject classes" });
  }
});

// List users in a subject by role with pagination
router.get("/:id/users", authMiddleware, async (req, res) => {
  try {
    const subjectId = Number(req.params.id);
    const { role, page = 1, limit = 10 } = req.query;

    if (!Number.isFinite(subjectId)) {
      return res.status(400).json({ error: "Invalid subject id" });
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
                subjectId,
              },
            },
          }
        : {
            role: "student",
            enrollments: {
              some: {
                class: {
                  subjectId,
                },
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
    console.error("GET /subjects/:id/users error:", error);
    res.status(500).json({ error: "Failed to fetch subject users" });
  }
});

export default router;
