import { 
  type User, type InsertUser,
  type Course, type InsertCourse,
  type StudentCourse, type InsertStudentCourse,
  type ParticipationRequest, type InsertParticipationRequest, 
  type ParticipationRequestWithStudent,
  type ParticipationRecord, type InsertParticipationRecord,
  type ParticipationRecordWithStudent
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
  
  // Course methods
  async getCourse(id: number): Promise<Course | undefined> {
    const result = await pool.query('SELECT * FROM courses WHERE id = $1', [id]);
    return result.rows[0];
  }
  
  async getCoursesByAdmin(adminId: number): Promise<Course[]> {
    const result = await pool.query('SELECT * FROM courses WHERE admin_id = $1', [adminId]);
    return result.rows;
  }
  
  async getAllCourses(): Promise<Course[]> {
    const result = await pool.query('SELECT * FROM courses');
    return result.rows;
  }
  
  async createCourse(course: InsertCourse): Promise<Course> {
    const result = await pool.query(
      'INSERT INTO courses (name, description, admin_id) VALUES ($1, $2, $3) RETURNING *',
      [course.name, course.description || null, course.adminId]
    );
    
    return result.rows[0];
  }
  
  // StudentCourse methods
  async enrollStudent(studentCourse: InsertStudentCourse): Promise<StudentCourse> {
    const result = await pool.query(
      'INSERT INTO student_courses (student_id, course_id) VALUES ($1, $2) RETURNING *',
      [studentCourse.studentId, studentCourse.courseId]
    );
    
    return result.rows[0];
  }
  
  async getStudentCourses(studentId: number): Promise<Course[]> {
    const result = await pool.query(
      `SELECT c.* FROM courses c
       JOIN student_courses sc ON c.id = sc.course_id
       WHERE sc.student_id = $1`,
      [studentId]
    );
    
    return result.rows;
  }
  
  async getEnrolledStudents(courseId: number): Promise<User[]> {
    const result = await pool.query(
      `SELECT u.* FROM users u
       JOIN student_courses sc ON u.id = sc.student_id
       WHERE sc.course_id = $1`,
      [courseId]
    );
    
    return result.rows;
  }
  
  // ParticipationRequest methods
  async createParticipationRequest(request: InsertParticipationRequest): Promise<ParticipationRequest> {
    const timestamp = new Date();
    
    const result = await pool.query(
      `INSERT INTO participation_requests 
       (student_id, course_id, note, timestamp, active) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [request.studentId, request.courseId, request.note || null, timestamp, true]
    );
    
    return result.rows[0];
  }
  
  async getActiveParticipationRequests(courseId: number): Promise<ParticipationRequestWithStudent[]> {
    const result = await pool.query(
      `SELECT pr.*, u.name as student_name, u.username as student_username
       FROM participation_requests pr
       JOIN users u ON pr.student_id = u.id
       WHERE pr.course_id = $1 AND pr.active = true
       ORDER BY pr.timestamp`,
      [courseId]
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
        record.courseId, 
        record.points, 
        record.feedback || null, 
        record.note || null, 
        timestamp
      ]
    );
    
    return result.rows[0];
  }
  
  async getParticipationRecordsByCourse(courseId: number): Promise<ParticipationRecordWithStudent[]> {
    const result = await pool.query(
      `SELECT pr.*, u.name as student_name, u.username as student_username
       FROM participation_records pr
       JOIN users u ON pr.student_id = u.id
       WHERE pr.course_id = $1
       ORDER BY pr.timestamp DESC`,
      [courseId]
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
  
  async getParticipationRecordsByStudent(studentId: number, courseId: number): Promise<ParticipationRecord[]> {
    const result = await pool.query(
      `SELECT * FROM participation_records 
       WHERE student_id = $1 AND course_id = $2
       ORDER BY timestamp DESC`,
      [studentId, courseId]
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
  
  async getTotalParticipationPointsByStudent(studentId: number, courseId: number): Promise<number> {
    const result = await pool.query(
      `SELECT SUM(points) as total FROM participation_records 
       WHERE student_id = $1 AND course_id = $2`,
      [studentId, courseId]
    );
    
    return parseInt(result.rows[0]?.total || '0');
  }
}