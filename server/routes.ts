import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { DEFAULT_COURSE } from "@shared/schema";
import { 
  insertParticipationRequestSchema, 
  insertParticipationRecordSchema, 
  type User 
} from "@shared/schema";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

// Extend Express Request to ensure req.user is defined after authentication middleware
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

// Middleware to ensure user is authenticated
const ensureAuthenticated = (req: Request, res: Response, next: Function) => {
  if (req.isAuthenticated()) {
    // TypeScript: After this middleware, req.user is guaranteed to be defined
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
};

// Middleware to ensure user is an admin
const ensureAdmin = (req: Request, res: Response, next: Function) => {
  if (req.isAuthenticated() && req.user && req.user.role === "admin") {
    // TypeScript: After this middleware, req.user is guaranteed to be defined and an admin
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
  console.log("Setting up WebSocket server on path /ws");
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: "/ws",
    perMessageDeflate: false
  });
  
  // WebSocket connection handler
  wss.on("connection", (ws, req) => {
    console.log("WebSocket client connected", req.headers.origin);
    
    // Send a welcome message to verify the connection works
    try {
      ws.send(JSON.stringify({ type: "welcome", payload: { message: "Connected to ClassTrack WebSocket server" } }));
    } catch (error) {
      console.error("Error sending welcome message:", error);
    }
    
    ws.on("message", async (message) => {
      try {
        console.log("WebSocket received message:", message.toString());
        const parsedMessage = JSON.parse(message.toString()) as WebSocketMessage;
        
        if (parsedMessage.type === "ping") {
          console.log("Received ping, sending pong");
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }
        
        if (parsedMessage.type === "join") {
          const { userId } = parsedMessage.payload;
          // Store user data with the connection
          (ws as any).userData = { userId };
          console.log(`User ${userId} joined WebSocket room`);
          
          // Confirm the join
          ws.send(JSON.stringify({ 
            type: "joinConfirmed", 
            payload: { userId, courseName: DEFAULT_COURSE.name, message: "Successfully joined WebSocket room" } 
          }));
          return;
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });
    
    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
    
    ws.on("close", (code, reason) => {
      console.log("WebSocket client disconnected", code, reason.toString());
    });
  });
  
  // Log any server-level errors
  wss.on("error", (error) => {
    console.error("WebSocket server error:", error);
  });
  
  // Broadcast to all clients
  const broadcastToAll = (message: WebSocketMessage) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(message));
        } catch (error) {
          console.error("WebSocket broadcast error:", error);
        }
      }
    });
  };

  // User route - Get all students
  app.get("/api/students", ensureAuthenticated, async (req, res) => {
    try {
      const students = await storage.getAllStudents();
      return res.json(students);
    } catch (error) {
      console.error("Error fetching students:", error);
      return res.status(500).json({ message: "Failed to fetch students" });
    }
  });
  
  // Course info
  app.get("/api/course", ensureAuthenticated, async (req, res) => {
    return res.json(DEFAULT_COURSE);
  });
  
  // Participation request routes (raise hand)
  app.post("/api/participation-requests", ensureAuthenticated, async (req, res) => {
    try {
      if (req.user!.role !== "student") {
        return res.status(403).json({ message: "Only students can raise hands" });
      }
      
      const requestData = insertParticipationRequestSchema.parse({
        ...req.body,
        studentId: req.user!.id,
      });
      
      // Check if student already has an active request
      const activeRequests = await storage.getActiveParticipationRequests();
      const existingRequest = activeRequests.find(r => r.student.id === req.user!.id);
      
      if (existingRequest) {
        return res.status(400).json({ message: "You already have an active participation request" });
      }
      
      const request = await storage.createParticipationRequest(requestData);
      
      // Broadcast the new request to all clients
      broadcastToAll({
        type: "participationRequest",
        payload: {
          ...request,
          student: {
            id: req.user!.id,
            name: req.user!.name,
            username: req.user!.username
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
  
  app.get("/api/participation-requests", ensureAuthenticated, async (req, res) => {
    try {
      const requests = await storage.getActiveParticipationRequests();
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
      if (req.user!.role === "student" && request.studentId !== req.user!.id) {
        return res.status(403).json({ message: "Not authorized to deactivate this request" });
      }
      
      const updatedRequest = await storage.deactivateParticipationRequest(requestId);
      
      // Broadcast the deactivation to all clients
      broadcastToAll({
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
      
      // Verify the student exists
      const student = await storage.getUser(recordData.studentId);
      if (!student || student.role !== "student") {
        return res.status(400).json({ message: "Invalid student ID" });
      }
      
      const record = await storage.createParticipationRecord(recordData);
      
      // If this is tied to a participation request, deactivate it
      if (req.body.requestId) {
        const requestId = parseInt(req.body.requestId);
        const request = await storage.getParticipationRequestById(requestId);
        
        if (request && request.active) {
          await storage.deactivateParticipationRequest(requestId);
          
          // Broadcast deactivation
          broadcastToAll({
            type: "participationRequestDeactivated",
            payload: { id: requestId }
          });
        }
      }
      
      // Broadcast the new record
      broadcastToAll({
        type: "participationRecordCreated",
        payload: {
          ...record,
          student: {
            id: student.id,
            name: student.name,
            username: student.username
          }
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
  
  app.get("/api/participation-records", ensureAuthenticated, async (req, res) => {
    try {
      if (req.user!.role === "admin") {
        const records = await storage.getAllParticipationRecords();
        return res.json(records);
      } else {
        const records = await storage.getParticipationRecordsByStudent(req.user!.id);
        return res.json(records);
      }
    } catch (error) {
      return res.status(500).json({ message: "Error fetching participation records" });
    }
  });
  
  app.get("/api/students/:id/participation-records", ensureAdmin, async (req, res) => {
    try {
      const studentId = parseInt(req.params.id);
      const student = await storage.getUser(studentId);
      
      if (!student || student.role !== "student") {
        return res.status(404).json({ message: "Student not found" });
      }
      
      const records = await storage.getParticipationRecordsByStudent(studentId);
      return res.json(records);
    } catch (error) {
      return res.status(500).json({ message: "Error fetching student participation records" });
    }
  });
  
  app.get("/api/students/:id/participation-points", ensureAuthenticated, async (req, res) => {
    try {
      const studentId = parseInt(req.params.id);
      
      // Students can only view their own points
      if (req.user!.role === "student" && req.user!.id !== studentId) {
        return res.status(403).json({ message: "Not authorized to view other student's points" });
      }
      
      const points = await storage.getTotalParticipationPointsByStudent(studentId);
      return res.json({ studentId, points });
    } catch (error) {
      return res.status(500).json({ message: "Error fetching participation points" });
    }
  });
  
  return httpServer;
}