import express from "express";
import { prisma } from "../db/index.js";
import { authMiddleware, isAdmin, isStudent } from "../middleware/auth.js";

const router = express.Router();

const getEnrollmentDetails = async (enrollmentId: number) => {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      class: {
        include: {
          subject: {
            include: {
              department: true,
            },
          },
          teacher: true,
        },
      },
    },
  });

  return enrollment;
};

// Create enrollment (Manual by Admin)
router.post("/", authMiddleware, isAdmin, async (req, res) => {
  try {
    const { classId, studentId } = req.body;

    if (!classId || !studentId) {
      return res
        .status(400)
        .json({ error: "classId and studentId are required" });
    }

    const classRecord = await prisma.class.findUnique({
      where: { id: classId },
    });

    if (!classRecord) return res.status(404).json({ error: "Class not found" });

    const student = await prisma.user.findUnique({
      where: { id: studentId },
    });

    if (!student) return res.status(404).json({ error: "Student not found" });

    const existingEnrollment = await prisma.enrollment.findFirst({
      where: {
        classId,
        studentId,
      },
    });

    if (existingEnrollment)
      return res
        .status(409)
        .json({ error: "Student already enrolled in class" });

    const createdEnrollment = await prisma.enrollment.create({
      data: { classId, studentId },
      select: { id: true },
    });

    const enrollment = await getEnrollmentDetails(createdEnrollment.id);

    res.status(201).json({ data: enrollment });
  } catch (error) {
    console.error("POST /enrollments error:", error);
    res.status(500).json({ error: "Failed to create enrollment" });
  }
});

// Join class by invite code (By Student)
router.post("/join", authMiddleware, isStudent, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    let { studentId } = req.body;

    // If user is a student, they can only enroll themselves
    if (req.user?.role === "student") {
      studentId = req.user.id;
    }

    if (!inviteCode || !studentId) {
      return res
        .status(400)
        .json({ error: "inviteCode and studentId are required" });
    }

    // Security check: Admins can enroll anyone, but students can only enroll themselves
    if (req.user?.role !== "admin" && req.user?.id !== studentId) {
      return res.status(403).json({ error: "Forbidden: You can only enroll yourself" });
    }

    const classRecord = await prisma.class.findUnique({
      where: { inviteCode },
    });

    if (!classRecord) return res.status(404).json({ error: "Class not found" });

    const student = await prisma.user.findUnique({
      where: { id: studentId },
    });

    if (!student) return res.status(404).json({ error: "Student not found" });

    const existingEnrollment = await prisma.enrollment.findFirst({
      where: {
        classId: classRecord.id,
        studentId,
      },
    });

    if (existingEnrollment)
      return res
        .status(409)
        .json({ error: "Student already enrolled in class" });

    const createdEnrollment = await prisma.enrollment.create({
      data: { classId: classRecord.id, studentId },
      select: { id: true },
    });

    const enrollment = await getEnrollmentDetails(createdEnrollment.id);

    res.status(201).json({ data: enrollment });
  } catch (error) {
    console.error("POST /enrollments/join error:", error);
    res.status(500).json({ error: "Failed to join class" });
  }
});

export default router;
