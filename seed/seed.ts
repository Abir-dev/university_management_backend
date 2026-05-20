import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import argon2 from "argon2";
import { prisma } from "../src/db/index.js";

type SeedUser = {
  id: string;
  name: string;
  email: string;
  role: "student" | "teacher" | "admin";
  password: string;
  image: string;
};

type SeedDepartment = {
  code: string;
  name: string;
  description: string;
};

type SeedSubject = {
  code: string;
  name: string;
  description: string;
  departmentCode: string;
};

type SeedClass = {
  name: string;
  description: string;
  capacity: number;
  status: "active" | "inactive" | "archived";
  inviteCode: string;
  subjectCode: string;
  teacherId: string;
  bannerUrl: string;
};

type SeedEnrollment = {
  classInviteCode: string;
  studentId: string;
};

type SeedData = {
  users: SeedUser[];
  departments: SeedDepartment[];
  subjects: SeedSubject[];
  classes: SeedClass[];
  enrollments: SeedEnrollment[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadSeedData = async (): Promise<SeedData> => {
  const dataPath = path.join(__dirname, "data.json");
  const raw = await readFile(dataPath, "utf-8");
  return JSON.parse(raw) as SeedData;
};

const ensureMapValue = <T>(map: Map<string, T>, key: string, label: string) => {
  const value = map.get(key);
  if (!value) {
    throw new Error(`Missing ${label} for key: ${key}`);
  }
  return value;
};

const seed = async () => {
  const data = await loadSeedData();

  // Order of deletion matters due to FK constraints
  await prisma.enrollment.deleteMany();
  await prisma.class.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.department.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  if (data.users.length) {
    await prisma.user.createMany({
      data: data.users.map((seedUser) => ({
        id: seedUser.id,
        name: seedUser.name,
        email: seedUser.email,
        emailVerified: true,
        image: seedUser.image,
        role: seedUser.role,
      })),
      skipDuplicates: true,
    });

    // Hash passwords for all users
    const accountData = await Promise.all(
      data.users.map(async (seedUser) => ({
        id: `acc_${seedUser.id}`,
        userId: seedUser.id,
        accountId: seedUser.email,
        providerId: "credentials",
        password: await argon2.hash(seedUser.password),
      }))
    );

    await prisma.account.createMany({
      data: accountData,
      skipDuplicates: true,
    });
  }

  if (data.departments.length) {
    await prisma.department.createMany({
      data: data.departments.map((dept) => ({
        code: dept.code,
        name: dept.name,
        description: dept.description,
      })),
      skipDuplicates: true,
    });
  }

  const departmentRows = await prisma.department.findMany({
    where: {
      code: { in: data.departments.map((dept) => dept.code) },
    },
    select: { id: true, code: true },
  });
  const departmentMap = new Map(
    departmentRows.map((row) => [row.code, row.id])
  );

  if (data.subjects.length) {
    const subjectsToInsert = data.subjects.map((subject) => ({
      code: subject.code,
      name: subject.name,
      description: subject.description,
      departmentId: ensureMapValue(
        departmentMap,
        subject.departmentCode,
        "department"
      ),
    }));

    await prisma.subject.createMany({
      data: subjectsToInsert,
      skipDuplicates: true,
    });
  }

  const subjectRows = await prisma.subject.findMany({
    where: {
      code: { in: data.subjects.map((subject) => subject.code) },
    },
    select: { id: true, code: true },
  });
  const subjectMap = new Map(subjectRows.map((row) => [row.code, row.id]));

  if (data.classes.length) {
    const classesToInsert = data.classes.map((classItem) => ({
      name: classItem.name,
      description: classItem.description,
      capacity: classItem.capacity,
      status: classItem.status,
      inviteCode: classItem.inviteCode,
      subjectId: ensureMapValue(subjectMap, classItem.subjectCode, "subject"),
      teacherId: classItem.teacherId,
      bannerUrl: classItem.bannerUrl,
      bannerCldPubId: null,
      schedules: [],
    }));

    await prisma.class.createMany({
      data: classesToInsert as any, // Json type might need casting
      skipDuplicates: true,
    });
  }

  const classRows = await prisma.class.findMany({
    where: {
      inviteCode: { in: data.classes.map((classItem) => classItem.inviteCode) },
    },
    select: { id: true, inviteCode: true },
  });
  const classMap = new Map(classRows.map((row) => [row.inviteCode, row.id]));

  if (data.enrollments.length) {
    await prisma.enrollment.createMany({
      data: data.enrollments.map((enrollment) => ({
        classId: ensureMapValue(
          classMap,
          enrollment.classInviteCode,
          "class"
        ),
        studentId: enrollment.studentId,
      })),
      skipDuplicates: true,
    });
  }
};

seed()
  .then(() => {
    console.log("Seed completed.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
