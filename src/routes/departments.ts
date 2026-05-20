import express from "express";
import { prisma, Role, Prisma } from "../db/index.js";
import { authMiddleware, isAdmin } from "../middleware/auth.js";

const router = express.Router();

// Get all departments with optional search and pagination
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);
    const offset = (currentPage - 1) * limitPerPage;

    const whereClause: Prisma.DepartmentWhereInput = {};

    if (search) {
      whereClause.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { code: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const [totalCount, departmentsListRaw] = await prisma.$transaction([
      prisma.department.count({ where: whereClause }),
      prisma.department.findMany({
        where: whereClause,
        include: {
          _count: {
            select: { subjects: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limitPerPage,
      }),
    ]);

    const departmentsList = departmentsListRaw.map((dept) => ({
      ...dept,
      totalSubjects: dept._count.subjects,
    }));

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
    console.error("GET /departments error:", error);
    res.status(500).json({ error: "Failed to fetch departments" });
  }
});

router.post("/", authMiddleware, isAdmin, async (req, res) => {
  try {
    const { code, name, description } = req.body;

    const createdDepartment = await prisma.department.create({
      data: { code, name, description },
      select: { id: true },
    });

    res.status(201).json({ data: createdDepartment });
  } catch (error) {
    console.error("POST /departments error:", error);
    res.status(500).json({ error: "Failed to create department" });
  }
});

// Get department details with counts
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const departmentId = Number(req.params.id);

    if (!Number.isFinite(departmentId)) {
      return res.status(400).json({ error: "Invalid department id" });
    }

    const department = await prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department) {
      return res.status(404).json({ error: "Department not found" });
    }

    const [subjectsCount, classesCount, enrolledStudentsCount] =
      await Promise.all([
        prisma.subject.count({
          where: { departmentId },
        }),
        prisma.class.count({
          where: { subject: { departmentId } },
        }),
        prisma.user.count({
          where: {
            role: "student",
            enrollments: {
              some: {
                class: {
                  subject: {
                    departmentId,
                  },
                },
              },
            },
          },
        }),
      ]);

    res.status(200).json({
      data: {
        department,
        totals: {
          subjects: subjectsCount,
          classes: classesCount,
          enrolledStudents: enrolledStudentsCount,
        },
      },
    });
  } catch (error) {
    console.error("GET /departments/:id error:", error);
    res.status(500).json({ error: "Failed to fetch department details" });
  }
});

// List subjects in a department with pagination
router.get("/:id/subjects", authMiddleware, async (req, res) => {
  try {
    const departmentId = Number(req.params.id);
    const { page = 1, limit = 10 } = req.query;

    if (!Number.isFinite(departmentId)) {
      return res.status(400).json({ error: "Invalid department id" });
    }

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);
    const offset = (currentPage - 1) * limitPerPage;

    const [totalCount, subjectsList] = await prisma.$transaction([
      prisma.subject.count({
        where: { departmentId },
      }),
      prisma.subject.findMany({
        where: { departmentId },
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
    console.error("GET /departments/:id/subjects error:", error);
    res.status(500).json({ error: "Failed to fetch department subjects" });
  }
});

// List classes in a department with pagination
router.get("/:id/classes", authMiddleware, async (req, res) => {
  try {
    const departmentId = Number(req.params.id);
    const { page = 1, limit = 10 } = req.query;

    if (!Number.isFinite(departmentId)) {
      return res.status(400).json({ error: "Invalid department id" });
    }

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);
    const offset = (currentPage - 1) * limitPerPage;

    const where: Prisma.ClassWhereInput = {
      subject: { departmentId },
    };

    const [totalCount, classesList] = await prisma.$transaction([
      prisma.class.count({ where }),
      prisma.class.findMany({
        where,
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
    console.error("GET /departments/:id/classes error:", error);
    res.status(500).json({ error: "Failed to fetch department classes" });
  }
});

// List users in a department by role with pagination
router.get("/:id/users", authMiddleware, async (req, res) => {
  try {
    const departmentId = Number(req.params.id);
    const { role, page = 1, limit = 10 } = req.query;

    if (!Number.isFinite(departmentId)) {
      return res.status(400).json({ error: "Invalid department id" });
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
                subject: {
                  departmentId,
                },
              },
            },
          }
        : {
            role: "student",
            enrollments: {
              some: {
                class: {
                  subject: {
                    departmentId,
                  },
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
    console.error("GET /departments/:id/users error:", error);
    res.status(500).json({ error: "Failed to fetch department users" });
  }
});

export default router;
