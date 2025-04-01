import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertCourseSchema, insertStudentCourseSchema, insertParticipationRequestSchema, insertParticipationRecordSchema } from "@shared/schema";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

// Middleware to ensure user is authenticated
const ensureAuthenticated = (req: Request, res: Response, next: Function) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
};

// Middleware to ensure user is an admin
const ensureAdmin = (req: Request, res: Response, next: Function) => {
  if (req.isAuthenticated() && req.user.role === "admin") {
    return next();
  }
  res.status(403).json({ message: "Forbidden: Admin access required" });
};

type WebSocketMessage = {
  type: string;
  payload: any;
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes
  setupAuth(app);

  const httpServer = createServer(app);
  
  // Set up WebSocket server for real-time updates
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  
  // WebSocket connection handler
  wss.on("connection", (ws) => {
    console.log("WebSocket client connected");
    
    ws.on("message", async (message) => {
      try {
        const parsedMessage = JSON.parse(message.toString()) as WebSocketMessage;
        
        if (parsedMessage.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }
        
        if (parsedMessage.type === "join") {
          const { courseId, userId } = parsedMessage.payload;
          // Store course ID with the connection
          (ws as any).courseData = { courseId, userId };
          console.log(`User ${userId} joined course ${courseId} WebSocket room`);
          return;
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });
    
    ws.on("close", () => {
      console.log("WebSocket client disconnected");
    });
  });
  
  // Broadcast to all clients in a specific course
  const broadcastToCourse = (courseId: number, message: WebSocketMessage) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          const clientData = (client as any).courseData;
          if (clientData && clientData.courseId === courseId) {
            client.send(JSON.stringify(message));
          }
        } catch (error) {
          console.error("WebSocket broadcast error:", error);
        }
      }
    });
  };

  // Course routes
  app.get("/api/courses", ensureAuthenticated, async (req, res) => {
    try {
      if (req.user.role === "admin") {
        const courses = await storage.getCoursesByAdmin(req.user.id);
        return res.json(courses);
      } else {
        const courses = await storage.getStudentCourses(req.user.id);
        return res.json(courses);
      }
    } catch (error) {
      console.error("Error fetching courses:", error);
      return res.status(500).json({ message: "Failed to fetch courses" });
    }
  });
  
  app.post("/api/courses", ensureAdmin, async (req, res) => {
    try {
      const courseData = insertCourseSchema.parse({
        ...req.body,
        adminId: req.user.id,
      });
      
      const course = await storage.createCourse(courseData);
      return res.status(201).json(course);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      return res.status(500).json({ message: "Failed to create course" });
    }
  });
  
  app.get("/api/courses/:id", ensureAuthenticated, async (req, res) => {
    try {
      const courseId = parseInt(req.params.id);
      const course = await storage.getCourse(courseId);
      
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }
      
      // Check if user has access to this course
      if (req.user.role === "admin" && course.adminId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to access this course" });
      }
      
      if (req.user.role === "student") {
        const studentCourses = await storage.getStudentCourses(req.user.id);
        if (!studentCourses.some(c => c.id === courseId)) {
          return res.status(403).json({ message: "Not enrolled in this course" });
        }
      }
      
      return res.json(course);
    } catch (error) {
      return res.status(500).json({ message: "Error fetching course" });
    }
  });
  
  // Enrollment routes
  app.post("/api/enrollments", ensureAdmin, async (req, res) => {
    try {
      const enrollmentData = insertStudentCourseSchema.parse(req.body);
      
      // Verify the course is owned by this admin
      const course = await storage.getCourse(enrollmentData.courseId);
      if (!course || course.adminId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to enroll students in this course" });
      }
      
      // Verify the student exists
      const student = await storage.getUser(enrollmentData.studentId);
      if (!student || student.role !== "student") {
        return res.status(400).json({ message: "Invalid student ID" });
      }
      
      const enrollment = await storage.enrollStudent(enrollmentData);
      return res.status(201).json(enrollment);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      return res.status(500).json({ message: "Failed to enroll student" });
    }
  });
  
  app.get("/api/courses/:id/students", ensureAdmin, async (req, res) => {
    try {
      const courseId = parseInt(req.params.id);
      
      // Verify the course is owned by this admin
      const course = await storage.getCourse(courseId);
      if (!course || course.adminId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to view students in this course" });
      }
      
      const students = await storage.getEnrolledStudents(courseId);
      return res.json(students);
    } catch (error) {
      return res.status(500).json({ message: "Error fetching enrolled students" });
    }
  });
  
  // Participation request routes (raise hand)
  app.post("/api/participation-requests", ensureAuthenticated, async (req, res) => {
    try {
      if (req.user.role !== "student") {
        return res.status(403).json({ message: "Only students can raise hands" });
      }
      
      const requestData = insertParticipationRequestSchema.parse({
        ...req.body,
        studentId: req.user.id,
      });
      
      // Verify student is enrolled in the course
      const studentCourses = await storage.getStudentCourses(req.user.id);
      if (!studentCourses.some(c => c.id === requestData.courseId)) {
        return res.status(403).json({ message: "Not enrolled in this course" });
      }
      
      // Check if student already has an active request for this course
      const activeRequests = await storage.getActiveParticipationRequests(requestData.courseId);
      const existingRequest = activeRequests.find(r => r.student.id === req.user.id);
      
      if (existingRequest) {
        return res.status(400).json({ message: "You already have an active participation request" });
      }
      
      const request = await storage.createParticipationRequest(requestData);
      
      // Broadcast the new request to all clients in this course
      broadcastToCourse(requestData.courseId, {
        type: "participationRequest",
        payload: {
          ...request,
          student: {
            id: req.user.id,
            name: req.user.name,
            username: req.user.username
          }
        }
      });
      
      return res.status(201).json(request);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      return res.status(500).json({ message: "Failed to create participation request" });
    }
  });
  
  app.get("/api/courses/:id/participation-requests", ensureAuthenticated, async (req, res) => {
    try {
      const courseId = parseInt(req.params.id);
      
      // Verify access to the course
      if (req.user.role === "admin") {
        const course = await storage.getCourse(courseId);
        if (!course || course.adminId !== req.user.id) {
          return res.status(403).json({ message: "Not authorized to view participation requests for this course" });
        }
      } else {
        const studentCourses = await storage.getStudentCourses(req.user.id);
        if (!studentCourses.some(c => c.id === courseId)) {
          return res.status(403).json({ message: "Not enrolled in this course" });
        }
      }
      
      const requests = await storage.getActiveParticipationRequests(courseId);
      return res.json(requests);
    } catch (error) {
      return res.status(500).json({ message: "Error fetching participation requests" });
    }
  });
  
  app.delete("/api/participation-requests/:id", ensureAuthenticated, async (req, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const request = await storage.getParticipationRequestById(requestId);
      
      if (!request) {
        return res.status(404).json({ message: "Participation request not found" });
      }
      
      // Verify access to deactivate this request
      if (req.user.role === "student" && request.studentId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to deactivate this request" });
      }
      
      if (req.user.role === "admin") {
        const course = await storage.getCourse(request.courseId);
        if (!course || course.adminId !== req.user.id) {
          return res.status(403).json({ message: "Not authorized to deactivate this request" });
        }
      }
      
      const updatedRequest = await storage.deactivateParticipationRequest(requestId);
      
      // Broadcast the deactivation to all clients in this course
      broadcastToCourse(request.courseId, {
        type: "participationRequestDeactivated",
        payload: { id: requestId }
      });
      
      return res.json(updatedRequest);
    } catch (error) {
      return res.status(500).json({ message: "Error deactivating participation request" });
    }
  });
  
  // Participation record routes (award points)
  app.post("/api/participation-records", ensureAdmin, async (req, res) => {
    try {
      const recordData = insertParticipationRecordSchema.parse(req.body);
      
      // Verify the course is owned by this admin
      const course = await storage.getCourse(recordData.courseId);
      if (!course || course.adminId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to award points for this course" });
      }
      
      // Verify the student is enrolled in the course
      const enrolledStudents = await storage.getEnrolledStudents(recordData.courseId);
      if (!enrolledStudents.some(s => s.id === recordData.studentId)) {
        return res.status(400).json({ message: "Student is not enrolled in this course" });
      }
      
      const record = await storage.createParticipationRecord(recordData);
      
      // If this is tied to a participation request, deactivate it
      if (req.body.requestId) {
        const requestId = parseInt(req.body.requestId);
        const request = await storage.getParticipationRequestById(requestId);
        
        if (request && request.active) {
          await storage.deactivateParticipationRequest(requestId);
          
          // Broadcast deactivation
          broadcastToCourse(recordData.courseId, {
            type: "participationRequestDeactivated",
            payload: { id: requestId }
          });
        }
      }
      
      // Broadcast the new record
      broadcastToCourse(recordData.courseId, {
        type: "participationRecordCreated",
        payload: {
          ...record,
          student: enrolledStudents.find(s => s.id === recordData.studentId)
        }
      });
      
      return res.status(201).json(record);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      return res.status(500).json({ message: "Failed to create participation record" });
    }
  });
  
  app.get("/api/courses/:id/participation-records", ensureAuthenticated, async (req, res) => {
    try {
      const courseId = parseInt(req.params.id);
      
      // Verify access to the course
      if (req.user.role === "admin") {
        const course = await storage.getCourse(courseId);
        if (!course || course.adminId !== req.user.id) {
          return res.status(403).json({ message: "Not authorized to view participation records for this course" });
        }
        
        const records = await storage.getParticipationRecordsByCourse(courseId);
        return res.json(records);
      } else {
        const studentCourses = await storage.getStudentCourses(req.user.id);
        if (!studentCourses.some(c => c.id === courseId)) {
          return res.status(403).json({ message: "Not enrolled in this course" });
        }
        
        const records = await storage.getParticipationRecordsByStudent(req.user.id, courseId);
        return res.json(records);
      }
    } catch (error) {
      return res.status(500).json({ message: "Error fetching participation records" });
    }
  });
  
  app.get("/api/courses/:id/students/:studentId/points", ensureAuthenticated, async (req, res) => {
    try {
      const courseId = parseInt(req.params.id);
      const studentId = parseInt(req.params.studentId);
      
      // Verify access to the course
      if (req.user.role === "admin") {
        const course = await storage.getCourse(courseId);
        if (!course || course.adminId !== req.user.id) {
          return res.status(403).json({ message: "Not authorized to view points for this course" });
        }
      } else if (req.user.id !== studentId) {
        return res.status(403).json({ message: "Not authorized to view other student's points" });
      }
      
      const points = await storage.getTotalParticipationPointsByStudent(studentId, courseId);
      return res.json({ points });
    } catch (error) {
      return res.status(500).json({ message: "Error fetching participation points" });
    }
  });

  return httpServer;
}
