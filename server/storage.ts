import { 
  users, type User, type InsertUser,
  courses, type Course, type InsertCourse,
  studentCourses, type StudentCourse, type InsertStudentCourse,
  participationRequests, type ParticipationRequest, type InsertParticipationRequest, 
  type ParticipationRequestWithStudent,
  participationRecords, type ParticipationRecord, type InsertParticipationRecord,
  type ParticipationRecordWithStudent
} from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";
import { DatabaseStorage } from './database-storage';

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Course methods
  getCourse(id: number): Promise<Course | undefined>;
  getCoursesByAdmin(adminId: number): Promise<Course[]>;
  getAllCourses(): Promise<Course[]>;
  createCourse(course: InsertCourse): Promise<Course>;
  
  // StudentCourse methods
  enrollStudent(studentCourse: InsertStudentCourse): Promise<StudentCourse>;
  getStudentCourses(studentId: number): Promise<Course[]>;
  getEnrolledStudents(courseId: number): Promise<User[]>;
  
  // ParticipationRequest methods
  createParticipationRequest(request: InsertParticipationRequest): Promise<ParticipationRequest>;
  getActiveParticipationRequests(courseId: number): Promise<ParticipationRequestWithStudent[]>;
  deactivateParticipationRequest(id: number): Promise<ParticipationRequest | undefined>;
  getParticipationRequestById(id: number): Promise<ParticipationRequest | undefined>;
  
  // ParticipationRecord methods
  createParticipationRecord(record: InsertParticipationRecord): Promise<ParticipationRecord>;
  getParticipationRecordsByCourse(courseId: number): Promise<ParticipationRecordWithStudent[]>;
  getParticipationRecordsByStudent(studentId: number, courseId: number): Promise<ParticipationRecord[]>;
  getTotalParticipationPointsByStudent(studentId: number, courseId: number): Promise<number>;
  
  // Session store
  sessionStore: session.Store;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private courses: Map<number, Course>;
  private studentCourses: Map<number, StudentCourse>;
  private participationRequests: Map<number, ParticipationRequest>;
  private participationRecords: Map<number, ParticipationRecord>;
  
  sessionStore: session.Store;
  
  userCurrentId: number;
  courseCurrentId: number;
  studentCourseCurrentId: number;
  participationRequestCurrentId: number;
  participationRecordCurrentId: number;

  constructor() {
    this.users = new Map();
    this.courses = new Map();
    this.studentCourses = new Map();
    this.participationRequests = new Map();
    this.participationRecords = new Map();
    
    this.userCurrentId = 1;
    this.courseCurrentId = 1;
    this.studentCourseCurrentId = 1;
    this.participationRequestCurrentId = 1;
    this.participationRecordCurrentId = 1;
    
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    // Ensure role is set to 'student' by default if not provided
    const userWithRole = { 
      ...insertUser, 
      role: insertUser.role || 'student' 
    };
    const user: User = { ...userWithRole, id };
    this.users.set(id, user);
    return user;
  }
  
  // Course methods
  async getCourse(id: number): Promise<Course | undefined> {
    return this.courses.get(id);
  }
  
  async getCoursesByAdmin(adminId: number): Promise<Course[]> {
    return Array.from(this.courses.values()).filter(
      (course) => course.adminId === adminId,
    );
  }
  
  async getAllCourses(): Promise<Course[]> {
    return Array.from(this.courses.values());
  }
  
  async createCourse(insertCourse: InsertCourse): Promise<Course> {
    const id = this.courseCurrentId++;
    // Handle null description
    const courseWithDescription = {
      ...insertCourse,
      description: insertCourse.description ?? null
    };
    const course: Course = { ...courseWithDescription, id };
    this.courses.set(id, course);
    return course;
  }
  
  // StudentCourse methods
  async enrollStudent(insertStudentCourse: InsertStudentCourse): Promise<StudentCourse> {
    const id = this.studentCourseCurrentId++;
    const studentCourse: StudentCourse = { ...insertStudentCourse, id };
    this.studentCourses.set(id, studentCourse);
    return studentCourse;
  }
  
  async getStudentCourses(studentId: number): Promise<Course[]> {
    const enrollments = Array.from(this.studentCourses.values()).filter(
      (sc) => sc.studentId === studentId,
    );
    
    return enrollments.map(enrollment => 
      this.courses.get(enrollment.courseId)
    ).filter((course): course is Course => !!course);
  }
  
  async getEnrolledStudents(courseId: number): Promise<User[]> {
    const enrollments = Array.from(this.studentCourses.values()).filter(
      (sc) => sc.courseId === courseId,
    );
    
    return enrollments.map(enrollment => 
      this.users.get(enrollment.studentId)
    ).filter((user): user is User => !!user);
  }
  
  // ParticipationRequest methods
  async createParticipationRequest(insertRequest: InsertParticipationRequest): Promise<ParticipationRequest> {
    const id = this.participationRequestCurrentId++;
    const timestamp = new Date();
    const requestWithNull = {
      ...insertRequest,
      note: insertRequest.note ?? null,
      active: true,
      timestamp
    };
    const request: ParticipationRequest = { ...requestWithNull, id };
    this.participationRequests.set(id, request);
    return request;
  }
  
  async getActiveParticipationRequests(courseId: number): Promise<ParticipationRequestWithStudent[]> {
    const requests = Array.from(this.participationRequests.values()).filter(
      (request) => request.courseId === courseId && request.active === true,
    );
    
    return requests.map(request => {
      const student = this.users.get(request.studentId);
      if (!student) {
        return {
          ...request, 
          student: { id: -1, name: "Unknown", username: "unknown" }
        };
      }
      
      return {
        ...request,
        student: {
          id: student.id,
          name: student.name,
          username: student.username
        }
      };
    }).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
  
  async deactivateParticipationRequest(id: number): Promise<ParticipationRequest | undefined> {
    const request = this.participationRequests.get(id);
    if (request) {
      const updatedRequest = { ...request, active: false };
      this.participationRequests.set(id, updatedRequest);
      return updatedRequest;
    }
    return undefined;
  }
  
  async getParticipationRequestById(id: number): Promise<ParticipationRequest | undefined> {
    return this.participationRequests.get(id);
  }
  
  // ParticipationRecord methods
  async createParticipationRecord(insertRecord: InsertParticipationRecord): Promise<ParticipationRecord> {
    const id = this.participationRecordCurrentId++;
    const timestamp = new Date();
    const recordWithNulls = {
      ...insertRecord,
      note: insertRecord.note ?? null,
      feedback: insertRecord.feedback ?? null,
      timestamp
    };
    const record: ParticipationRecord = { ...recordWithNulls, id };
    this.participationRecords.set(id, record);
    return record;
  }
  
  async getParticipationRecordsByCourse(courseId: number): Promise<ParticipationRecordWithStudent[]> {
    const records = Array.from(this.participationRecords.values()).filter(
      (record) => record.courseId === courseId,
    );
    
    return records.map(record => {
      const student = this.users.get(record.studentId);
      if (!student) {
        return {
          ...record, 
          student: { id: -1, name: "Unknown", username: "unknown" }
        };
      }
      
      return {
        ...record,
        student: {
          id: student.id,
          name: student.name,
          username: student.username
        }
      };
    }).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
  
  async getParticipationRecordsByStudent(studentId: number, courseId: number): Promise<ParticipationRecord[]> {
    return Array.from(this.participationRecords.values())
      .filter(record => record.studentId === studentId && record.courseId === courseId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
  
  async getTotalParticipationPointsByStudent(studentId: number, courseId: number): Promise<number> {
    const records = Array.from(this.participationRecords.values())
      .filter(record => record.studentId === studentId && record.courseId === courseId);
    
    return records.reduce((sum, record) => sum + record.points, 0);
  }
}

// Export database storage instance
export const storage = new DatabaseStorage();
