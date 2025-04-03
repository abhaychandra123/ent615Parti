import { 
  type User, type InsertUser,
  type ParticipationRequest, type InsertParticipationRequest, 
  type ParticipationRequestWithStudent,
  type ParticipationRecord, type InsertParticipationRecord,
  type ParticipationRecordWithStudent,
  DEFAULT_COURSE
} from "@shared/schema";
import session from "express-session";
import { IStorage } from "./storage";
import connectPg from "connect-pg-simple";
import pool from "./db";

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
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    // Ensure role is set to 'student' by default if not provided
    const role = user.role || 'student';
    
    const result = await pool.query(
      'INSERT INTO users (username, password, email, role, name) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [user.username, user.password, user.email, role, user.name]
    );
    
    return result.rows[0];
  }
  
  // Get all students
  async getAllStudents(): Promise<User[]> {
    const result = await pool.query('SELECT * FROM users WHERE role = $1', ['student']);
    return result.rows;
  }
  
  // ParticipationRequest methods
  async createParticipationRequest(request: InsertParticipationRequest): Promise<ParticipationRequest> {
    const timestamp = new Date();
    
    const result = await pool.query(
      `INSERT INTO participation_requests 
       (student_id, course_id, note, timestamp, active) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [request.studentId, DEFAULT_COURSE.id, request.note || null, timestamp, true]
    );
    
    return result.rows[0];
  }
  
  async getActiveParticipationRequests(): Promise<ParticipationRequestWithStudent[]> {
    const result = await pool.query(
      `SELECT pr.*, u.name as student_name, u.username as student_username
       FROM participation_requests pr
       JOIN users u ON pr.student_id = u.id
       WHERE pr.active = true
       ORDER BY pr.timestamp`
    );
    
    // Transform to the expected format
    return result.rows.map(row => ({
      id: row.id,
      studentId: row.student_id,
      courseId: row.course_id,
      note: row.note,
      timestamp: row.timestamp,
      active: row.active,
      student: {
        id: row.student_id,
        name: row.student_name,
        username: row.student_username
      }
    }));
  }
  
  async deactivateParticipationRequest(id: number): Promise<ParticipationRequest | undefined> {
    const result = await pool.query(
      'UPDATE participation_requests SET active = false WHERE id = $1 RETURNING *',
      [id]
    );
    
    return result.rows[0];
  }
  
  async getParticipationRequestById(id: number): Promise<ParticipationRequest | undefined> {
    const result = await pool.query('SELECT * FROM participation_requests WHERE id = $1', [id]);
    return result.rows[0];
  }
  
  // ParticipationRecord methods
  async createParticipationRecord(record: InsertParticipationRecord): Promise<ParticipationRecord> {
    const timestamp = new Date();
    
    const result = await pool.query(
      `INSERT INTO participation_records 
       (student_id, course_id, points, feedback, note, timestamp) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        record.studentId, 
        DEFAULT_COURSE.id, 
        record.points, 
        record.feedback || null, 
        record.note || null, 
        timestamp
      ]
    );
    
    return result.rows[0];
  }
  
  async getAllParticipationRecords(): Promise<ParticipationRecordWithStudent[]> {
    const result = await pool.query(
      `SELECT pr.*, u.name as student_name, u.username as student_username
       FROM participation_records pr
       JOIN users u ON pr.student_id = u.id
       ORDER BY pr.timestamp DESC`
    );
    
    // Transform to the expected format
    return result.rows.map(row => ({
      id: row.id,
      studentId: row.student_id,
      courseId: row.course_id,
      points: row.points,
      feedback: row.feedback,
      note: row.note,
      timestamp: row.timestamp,
      student: {
        id: row.student_id,
        name: row.student_name,
        username: row.student_username
      }
    }));
  }
  
  async getParticipationRecordsByStudent(studentId: number): Promise<ParticipationRecord[]> {
    const result = await pool.query(
      `SELECT * FROM participation_records 
       WHERE student_id = $1
       ORDER BY timestamp DESC`,
      [studentId]
    );
    
    return result.rows.map(row => ({
      id: row.id,
      studentId: row.student_id,
      courseId: row.course_id,
      points: row.points,
      feedback: row.feedback,
      note: row.note,
      timestamp: row.timestamp
    }));
  }
  
  async getTotalParticipationPointsByStudent(studentId: number): Promise<number> {
    const result = await pool.query(
      `SELECT SUM(points) as total FROM participation_records 
       WHERE student_id = $1`,
      [studentId]
    );
    
    return parseInt(result.rows[0]?.total || '0');
  }
  
  async deleteParticipationRecordsFromDate(date: Date): Promise<number> {
    // Set start and end of day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Delete records from the specified date
    const result = await pool.query(
      `DELETE FROM participation_records 
       WHERE timestamp >= $1 AND timestamp <= $2
       RETURNING id`,
      [startOfDay, endOfDay]
    );
    
    return result.rowCount;
  }
}