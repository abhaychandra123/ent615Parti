import { User, InsertUser, ParticipationRequest, InsertParticipationRequest, 
  ParticipationRecord, InsertParticipationRecord, ParticipationRequestWithStudent, 
  ParticipationRecordWithStudent, DEFAULT_COURSE } from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Student methods
  getAllStudents(): Promise<User[]>;
  
  // ParticipationRequest methods
  createParticipationRequest(request: InsertParticipationRequest): Promise<ParticipationRequest>;
  getActiveParticipationRequests(): Promise<ParticipationRequestWithStudent[]>;
  deactivateParticipationRequest(id: number): Promise<ParticipationRequest | undefined>;
  getParticipationRequestById(id: number): Promise<ParticipationRequest | undefined>;
  
  // ParticipationRecord methods
  createParticipationRecord(record: InsertParticipationRecord): Promise<ParticipationRecord>;
  getAllParticipationRecords(): Promise<ParticipationRecordWithStudent[]>;
  getParticipationRecordsByStudent(studentId: number): Promise<ParticipationRecord[]>;
  getTotalParticipationPointsByStudent(studentId: number): Promise<number>;
  deleteParticipationRecordsFromDate(date: Date): Promise<number>;
  
  // Session store
  sessionStore: session.Store;
}

/**
 * In-memory storage implementation for development
 */
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private participationRequests: Map<number, ParticipationRequest>;
  private participationRecords: Map<number, ParticipationRecord>;
  sessionStore: session.Store;
  userCurrentId: number;
  participationRequestCurrentId: number;
  participationRecordCurrentId: number;

  constructor() {
    this.users = new Map();
    this.participationRequests = new Map();
    this.participationRecords = new Map();
    this.userCurrentId = 1;
    this.participationRequestCurrentId = 1;
    this.participationRecordCurrentId = 1;
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });

    // Create a default admin user for testing
    this.createUser({
      username: "admin",
      password: "password123", // This will be hashed in auth.ts
      email: "admin@example.com",
      name: "Admin User",
      role: "admin",
    });

    // Create a default student user for testing
    this.createUser({
      username: "student",
      password: "password123", // This will be hashed in auth.ts
      email: "student@example.com",
      name: "Student User",
      role: "student",
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    for (const user of this.users.values()) {
      if (user.username === username) {
        return user;
      }
    }
    return undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    const userWithRole = {
      ...insertUser,
      role: insertUser.role || "student"
    };
    const user: User = { ...userWithRole, id };
    this.users.set(id, user);
    return user;
  }

  async getAllStudents(): Promise<User[]> {
    return Array.from(this.users.values())
      .filter(user => user.role === "student");
  }

  async createParticipationRequest(insertRequest: InsertParticipationRequest): Promise<ParticipationRequest> {
    const id = this.participationRequestCurrentId++;
    const requestWithNull = {
      ...insertRequest,
      note: insertRequest.note || null,
      courseId: DEFAULT_COURSE.id,
      active: true,
      timestamp: new Date()
    };
    const request: ParticipationRequest = { ...requestWithNull, id };
    this.participationRequests.set(id, request);
    return request;
  }

  async getActiveParticipationRequests(): Promise<ParticipationRequestWithStudent[]> {
    const activeRequests = Array.from(this.participationRequests.values())
      .filter(request => request.active);
    
    return Promise.all(activeRequests.map(async request => {
      const student = await this.getUser(request.studentId);
      return {
        ...request,
        student: {
          id: student!.id,
          name: student!.name,
          username: student!.username
        }
      };
    }));
  }

  async deactivateParticipationRequest(id: number): Promise<ParticipationRequest | undefined> {
    const request = this.participationRequests.get(id);
    if (!request) return undefined;
    
    const updatedRequest = { ...request, active: false };
    this.participationRequests.set(id, updatedRequest);
    return updatedRequest;
  }

  async getParticipationRequestById(id: number): Promise<ParticipationRequest | undefined> {
    return this.participationRequests.get(id);
  }

  async createParticipationRecord(insertRecord: InsertParticipationRecord): Promise<ParticipationRecord> {
    const id = this.participationRecordCurrentId++;
    const recordWithNulls = {
      ...insertRecord,
      courseId: DEFAULT_COURSE.id,
      note: insertRecord.note || null,
      feedback: insertRecord.feedback || null,
      timestamp: new Date()
    };
    const record: ParticipationRecord = { ...recordWithNulls, id };
    this.participationRecords.set(id, record);
    return record;
  }

  async getAllParticipationRecords(): Promise<ParticipationRecordWithStudent[]> {
    const records = Array.from(this.participationRecords.values());
    
    return Promise.all(records.map(async record => {
      const student = await this.getUser(record.studentId);
      return {
        ...record,
        student: {
          id: student!.id,
          name: student!.name,
          username: student!.username
        }
      };
    }));
  }

  async getParticipationRecordsByStudent(studentId: number): Promise<ParticipationRecord[]> {
    return Array.from(this.participationRecords.values())
      .filter(record => record.studentId === studentId);
  }

  async getTotalParticipationPointsByStudent(studentId: number): Promise<number> {
    const studentRecords = await this.getParticipationRecordsByStudent(studentId);
    return studentRecords.reduce((sum, record) => sum + record.points, 0);
  }
  
  async deleteParticipationRecordsFromDate(date: Date): Promise<number> {
    const startOfDay = date;
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Find records from the specified date
    const recordsToDelete = Array.from(this.participationRecords.values())
      .filter(record => {
        const recordDate = new Date(record.timestamp);
        return recordDate >= startOfDay && recordDate <= endOfDay;
      });
    
    // Delete the records
    recordsToDelete.forEach(record => {
      this.participationRecords.delete(record.id);
    });
    
    return recordsToDelete.length;
  }
}

// Import DatabaseStorage to use PostgreSQL database
import { DatabaseStorage } from "./database-storage";

// Export an instance of the DatabaseStorage
export const storage = new DatabaseStorage();