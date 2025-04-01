import { 
  users, type User, type InsertUser,
  courses, type Course, type InsertCourse,
  studentCourses, type StudentCourse, type InsertStudentCourse,
  participationRequests, type ParticipationRequest, type InsertParticipationRequest, 
  type ParticipationRequestWithStudent,
  participationRecords, type ParticipationRecord, type InsertParticipationRecord,
  type ParticipationRecordWithStudent
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import session from "express-session";
import { IStorage } from "./storage";
import connectPg from "connect-pg-simple";
import pg from "pg";
const { Pool } = pg;

// Connect to PostgreSQL for session store
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const PostgresSessionStore = connectPg(session);

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;
  
  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    // Ensure role is set to 'student' by default if not provided
    const userWithRole = { 
      ...user, 
      role: user.role || 'student' 
    };
    
    const [createdUser] = await db.insert(users).values(userWithRole).returning();
    return createdUser;
  }
  
  // Course methods
  async getCourse(id: number): Promise<Course | undefined> {
    const [course] = await db.select().from(courses).where(eq(courses.id, id));
    return course;
  }
  
  async getCoursesByAdmin(adminId: number): Promise<Course[]> {
    return await db.select().from(courses).where(eq(courses.adminId, adminId));
  }
  
  async getAllCourses(): Promise<Course[]> {
    return await db.select().from(courses);
  }
  
  async createCourse(course: InsertCourse): Promise<Course> {
    // Handle null description
    const courseWithDescription = {
      ...course,
      description: course.description || null
    };
    
    const [createdCourse] = await db.insert(courses).values(courseWithDescription).returning();
    return createdCourse;
  }
  
  // StudentCourse methods
  async enrollStudent(studentCourse: InsertStudentCourse): Promise<StudentCourse> {
    const [createdStudentCourse] = await db.insert(studentCourses).values(studentCourse).returning();
    return createdStudentCourse;
  }
  
  async getStudentCourses(studentId: number): Promise<Course[]> {
    const enrolledCourses = await db.select({
      course: courses
    })
    .from(studentCourses)
    .innerJoin(courses, eq(studentCourses.courseId, courses.id))
    .where(eq(studentCourses.studentId, studentId));
    
    return enrolledCourses.map(ec => ec.course);
  }
  
  async getEnrolledStudents(courseId: number): Promise<User[]> {
    const enrolledStudents = await db.select({
      student: users
    })
    .from(studentCourses)
    .innerJoin(users, eq(studentCourses.studentId, users.id))
    .where(eq(studentCourses.courseId, courseId));
    
    return enrolledStudents.map(es => es.student);
  }
  
  // ParticipationRequest methods
  async createParticipationRequest(request: InsertParticipationRequest): Promise<ParticipationRequest> {
    // Handle null note
    const requestWithNote = {
      ...request,
      note: request.note || null,
      active: true,
      timestamp: new Date()
    };
    
    const [createdRequest] = await db.insert(participationRequests).values(requestWithNote).returning();
    return createdRequest;
  }
  
  async getActiveParticipationRequests(courseId: number): Promise<ParticipationRequestWithStudent[]> {
    const requests = await db.select({
      id: participationRequests.id,
      studentId: participationRequests.studentId,
      courseId: participationRequests.courseId,
      note: participationRequests.note,
      timestamp: participationRequests.timestamp,
      active: participationRequests.active,
      studentName: users.name,
      studentUsername: users.username
    })
    .from(participationRequests)
    .innerJoin(users, eq(participationRequests.studentId, users.id))
    .where(and(
      eq(participationRequests.courseId, courseId),
      eq(participationRequests.active, true)
    ))
    .orderBy(participationRequests.timestamp);
    
    // Transform to the expected format
    return requests.map(req => ({
      id: req.id,
      studentId: req.studentId,
      courseId: req.courseId,
      note: req.note,
      timestamp: req.timestamp,
      active: req.active,
      student: {
        id: req.studentId,
        name: req.studentName,
        username: req.studentUsername
      }
    }));
  }
  
  async deactivateParticipationRequest(id: number): Promise<ParticipationRequest | undefined> {
    const [updatedRequest] = await db
      .update(participationRequests)
      .set({ active: false })
      .where(eq(participationRequests.id, id))
      .returning();
      
    return updatedRequest;
  }
  
  async getParticipationRequestById(id: number): Promise<ParticipationRequest | undefined> {
    const [request] = await db.select().from(participationRequests).where(eq(participationRequests.id, id));
    return request;
  }
  
  // ParticipationRecord methods
  async createParticipationRecord(record: InsertParticipationRecord): Promise<ParticipationRecord> {
    // Handle null fields
    const recordWithDefaults = {
      ...record,
      note: record.note || null,
      feedback: record.feedback || null,
      timestamp: new Date()
    };
    
    const [createdRecord] = await db.insert(participationRecords).values(recordWithDefaults).returning();
    return createdRecord;
  }
  
  async getParticipationRecordsByCourse(courseId: number): Promise<ParticipationRecordWithStudent[]> {
    const records = await db.select({
      id: participationRecords.id,
      studentId: participationRecords.studentId,
      courseId: participationRecords.courseId,
      points: participationRecords.points,
      note: participationRecords.note,
      feedback: participationRecords.feedback,
      timestamp: participationRecords.timestamp,
      studentName: users.name,
      studentUsername: users.username
    })
    .from(participationRecords)
    .innerJoin(users, eq(participationRecords.studentId, users.id))
    .where(eq(participationRecords.courseId, courseId))
    .orderBy(desc(participationRecords.timestamp));
    
    // Transform to the expected format
    return records.map(rec => ({
      id: rec.id,
      studentId: rec.studentId,
      courseId: rec.courseId,
      points: rec.points,
      note: rec.note,
      feedback: rec.feedback,
      timestamp: rec.timestamp,
      student: {
        id: rec.studentId,
        name: rec.studentName,
        username: rec.studentUsername
      }
    }));
  }
  
  async getParticipationRecordsByStudent(studentId: number, courseId: number): Promise<ParticipationRecord[]> {
    return await db.select()
      .from(participationRecords)
      .where(and(
        eq(participationRecords.studentId, studentId),
        eq(participationRecords.courseId, courseId)
      ))
      .orderBy(desc(participationRecords.timestamp));
  }
  
  async getTotalParticipationPointsByStudent(studentId: number, courseId: number): Promise<number> {
    // Get all participation records for this student in this course
    const records = await this.getParticipationRecordsByStudent(studentId, courseId);
    
    // Calculate the sum manually
    return records.reduce((sum, record) => sum + record.points, 0);
  }
}