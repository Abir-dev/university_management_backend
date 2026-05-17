import express from "express";
import { prisma } from "../db/index.js";

const router = express.Router();

// Overview counts for core entities
router.get("/overview", async (req, res) => {
  try {
    const [
      usersCount,
      teachersCount,
      adminsCount,
      subjectsCount,
      departmentsCount,
      classesCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "teacher" } }),
      prisma.user.count({ where: { role: "admin" } }),
      prisma.subject.count(),
      prisma.department.count(),
      prisma.class.count(),
    ]);

    res.status(200).json({
      data: {
        users: usersCount,
        teachers: teachersCount,
        admins: adminsCount,
        subjects: subjectsCount,
        departments: departmentsCount,
        classes: classesCount,
      },
    });
  } catch (error) {
    console.error("GET /stats/overview error:", error);
    res.status(500).json({ error: "Failed to fetch overview stats" });
  }
});

// Latest activity summaries
router.get("/latest", async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const limitPerPage = Math.max(1, +limit);

    const [latestClasses, latestTeachers] = await Promise.all([
      prisma.class.findMany({
        include: {
          subject: true,
          teacher: true,
        },
        orderBy: { createdAt: "desc" },
        take: limitPerPage,
      }),
      prisma.user.findMany({
        where: { role: "teacher" },
        orderBy: { createdAt: "desc" },
        take: limitPerPage,
      }),
    ]);

    res.status(200).json({
      data: {
        latestClasses,
        latestTeachers,
      },
    });
  } catch (error) {
    console.error("GET /stats/latest error:", error);
    res.status(500).json({ error: "Failed to fetch latest stats" });
  }
});

// Aggregates for charts
router.get("/charts", async (req, res) => {
  try {
    const [usersByRoleRaw, subjectsByDepartmentRaw, classesBySubjectRaw] =
      await Promise.all([
        prisma.user.groupBy({
          by: ["role"],
          _count: {
            _all: true,
          },
        }),
        prisma.department.findMany({
          select: {
            id: true,
            name: true,
            _count: {
              select: { subjects: true },
            },
          },
        }),
        prisma.subject.findMany({
          select: {
            id: true,
            name: true,
            _count: {
              select: { classes: true },
            },
          },
        }),
      ]);

    const usersByRole = usersByRoleRaw.map((u) => ({
      role: u.role,
      total: u._count._all,
    }));

    const subjectsByDepartment = subjectsByDepartmentRaw.map((d) => ({
      departmentId: d.id,
      departmentName: d.name,
      totalSubjects: d._count.subjects,
    }));

    const classesBySubject = classesBySubjectRaw.map((s) => ({
      subjectId: s.id,
      subjectName: s.name,
      totalClasses: s._count.classes,
    }));

    res.status(200).json({
      data: {
        usersByRole,
        subjectsByDepartment,
        classesBySubject,
      },
    });
  } catch (error) {
    console.error("GET /stats/charts error:", error);
    res.status(500).json({ error: "Failed to fetch chart stats" });
  }
});

export default router;
