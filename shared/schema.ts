import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User model
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("student"), // "admin" or "student"
  name: text("name").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  name: true,
  role: true,
});

// Course model
export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  adminId: integer("admin_id").notNull(), // The professor/TA who owns this course
});

export const insertCourseSchema = createInsertSchema(courses).pick({
  name: true,
  description: true,
  adminId: true,
});

// StudentCourse relation (for enrolling students in courses)
export const studentCourses = pgTable("student_courses", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  courseId: integer("course_id").notNull(),
});

export const insertStudentCourseSchema = createInsertSchema(studentCourses).pick({
  studentId: true,
  courseId: true,
});

// ParticipationRequest model (for raised hands)
export const participationRequests = pgTable("participation_requests", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  courseId: integer("course_id").notNull(),
  note: text("note"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  active: boolean("active").notNull().default(true),
});

export const insertParticipationRequestSchema = createInsertSchema(participationRequests).pick({
  studentId: true,
  courseId: true,
  note: true,
});

// ParticipationRecord model (for assigned points)
export const participationRecords = pgTable("participation_records", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  courseId: integer("course_id").notNull(),
  points: integer("points").notNull(),
  feedback: text("feedback"),
  note: text("note"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertParticipationRecordSchema = createInsertSchema(participationRecords).pick({
  studentId: true,
  courseId: true,
  points: true,
  feedback: true,
  note: true,
});

// Type exports
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof courses.$inferSelect;

export type InsertStudentCourse = z.infer<typeof insertStudentCourseSchema>;
export type StudentCourse = typeof studentCourses.$inferSelect;

export type InsertParticipationRequest = z.infer<typeof insertParticipationRequestSchema>;
export type ParticipationRequest = typeof participationRequests.$inferSelect;

export type InsertParticipationRecord = z.infer<typeof insertParticipationRecordSchema>;
export type ParticipationRecord = typeof participationRecords.$inferSelect;

// Extended types for frontend use
export type ParticipationRequestWithStudent = ParticipationRequest & {
  student: {
    id: number;
    name: string;
    username: string;
  };
};

export type ParticipationRecordWithStudent = ParticipationRecord & {
  student: {
    id: number;
    name: string;
    username: string;
  };
};
