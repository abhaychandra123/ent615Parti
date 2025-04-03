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

// Default course constant - the only course used in the application
export const DEFAULT_COURSE = {
  id: 1,
  name: "ENT615: Strategy and Leadership for Entrepreneurs",
  description: "This course explores the strategic frameworks and leadership principles essential for entrepreneurial success."
};

// ParticipationRequest model (for raised hands)
export const participationRequests = pgTable("participation_requests", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  courseId: integer("course_id").notNull().default(DEFAULT_COURSE.id),
  note: text("note"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  active: boolean("active").notNull().default(true),
});

export const insertParticipationRequestSchema = createInsertSchema(participationRequests)
  .omit({ courseId: true })
  .merge(z.object({
    note: z.string().optional()
  }));

// ParticipationRecord model (for assigned points)
export const participationRecords = pgTable("participation_records", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  courseId: integer("course_id").notNull().default(DEFAULT_COURSE.id),
  points: integer("points").notNull(),
  feedback: text("feedback"),
  note: text("note"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  hidden: boolean("hidden").notNull().default(false),
});

export const insertParticipationRecordSchema = createInsertSchema(participationRecords)
  .omit({ courseId: true })
  .merge(z.object({
    feedback: z.string().optional(),
    note: z.string().optional()
  }));

// Type exports
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// We maintain a Course type for compatibility
export type Course = {
  id: number;
  name: string;
  description: string;
};

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
