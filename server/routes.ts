import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { setupAuth } from "./auth";
import { storage as defaultStorage } from "./storage";
// Get the storage from global if it exists (our override in index.ts)
// Otherwise fall back to the default from storage.ts
const storage = (global as any).storage || defaultStorage;
import { DEFAULT_COURSE } from "@shared/schema";
import { 
  insertParticipationRequestSchema, 
  insertParticipationRecordSchema, 
  type User,
  type ParticipationRecord,
  type ParticipationRecordWithStudent
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
  console.log("Checking admin access, user:", req.user);
  
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized: Login required" });
  }
  
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized: User data missing" });
  }
  
  // For debugging, log the user object
  console.log("User object in ensureAdmin:", {
    id: req.user.id,
    username: req.user.username,
    role: req.user.role
  });
  
  // Actually check if the user is an admin
  if (req.user.role === "admin") {
    return next();
  }
  
  // Return a proper error message
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
    perMessageDeflate: false,
    // Add a longer ping timeout to help with reconnection issues
    clientTracking: true
  });
  
  // Keep track of connected clients by user ID
  const connectedClients = new Map<number, Set<WebSocket>>();
  
  // Set up a interval to check connection status and clean up dead connections
  const connectionCheckInterval = setInterval(() => {
    // Check each connection
    wss.clients.forEach(client => {
      if (client.readyState !== WebSocket.OPEN) {
        try {
          client.terminate();
        } catch (err) {
          // Ignore errors on termination
        }
      }
    });
    
    // Log current connected users
    if (wss.clients.size > 0) {
      console.log(`Active WebSocket connections: ${wss.clients.size}`);
    }
  }, 60000); // Check every minute
  
  // Clean up interval on server shutdown
  httpServer.on('close', () => {
    clearInterval(connectionCheckInterval);
  });
  
  // WebSocket connection handler
  wss.on("connection", (ws, req) => {
    const clientIp = req.socket.remoteAddress || 'unknown';
    console.log(`WebSocket client connected from ${clientIp}`);
    
    // Send a welcome message to verify the connection works
    try {
      ws.send(JSON.stringify({ type: "welcome", payload: { message: "Connected to ClassTrack WebSocket server" } }));
    } catch (error) {
      console.error("Error sending welcome message:", error);
    }
    
    // Initialize connection data
    let userId: number | null = null;
    
    // Handler for client messages
    ws.on("message", async (message) => {
      try {
        const messageStr = message.toString();
        const parsedMessage = JSON.parse(messageStr) as WebSocketMessage;
        
        // Handle different message types
        switch (parsedMessage.type) {
          case "ping":
            // Respond to ping with pong but don't log to reduce noise
            ws.send(JSON.stringify({ type: "pong" }));
            break;
            
          case "join":
            // User is joining a room - store their info
            userId = parsedMessage.payload.userId;
            
            if (!userId) {
              console.warn("Received join message without userId");
              break;
            }
            
            // Associate this connection with the user ID
            (ws as any).userData = { userId };
            
            // Register in connected clients
            if (!connectedClients.has(userId)) {
              connectedClients.set(userId, new Set());
            }
            connectedClients.get(userId)!.add(ws);
            
            console.log(`User ${userId} joined WebSocket room`);
            
            // Confirm the join
            ws.send(JSON.stringify({ 
              type: "joinConfirmed", 
              payload: { 
                userId, 
                courseName: DEFAULT_COURSE.name, 
                message: "Successfully joined WebSocket room" 
              } 
            }));
            break;
            
          default:
            // Log other message types
            if (parsedMessage.type !== "ping" && parsedMessage.type !== "pong") {
              console.log(`Received message type: ${parsedMessage.type}`);
            }
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });
    
    // Handle connection errors
    ws.on("error", (error) => {
      console.error("WebSocket connection error:", error);
    });
    
    // Handle connection close
    ws.on("close", (code, reason) => {
      // Remove from connected clients map
      if (userId) {
        const userConnections = connectedClients.get(userId);
        if (userConnections) {
          userConnections.delete(ws);
          if (userConnections.size === 0) {
            connectedClients.delete(userId);
          }
        }
        
        // Don't log normal closures to reduce console noise
        if (code !== 1000 && code !== 1001 && code !== 1005) {
          console.log(`WebSocket client (user ${userId}) disconnected with code ${code}`);
        }
      }
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
      const existingRequest = activeRequests.find((r: any) => {
        return r.student && r.student.id === req.user!.id;
      });
      
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
      console.log("Received participation record request:", req.body);
      
      // Extract requestId before validation as it's not part of the schema
      const requestId = req.body.requestId ? parseInt(req.body.requestId) : null;
      
      // Only pass schema-valid fields to parser
      const { studentId, points, feedback, note } = req.body;
      const recordData = insertParticipationRecordSchema.parse({
        studentId,
        points,
        feedback,
        note
      });
      
      // Verify the student exists
      const student = await storage.getUser(recordData.studentId);
      if (!student || student.role !== "student") {
        return res.status(400).json({ message: "Invalid student ID" });
      }
      
      const record = await storage.createParticipationRecord(recordData);
      
      // If this is tied to a participation request, deactivate it
      if (requestId) {
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
      console.error("Error creating participation record:", error);
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      return res.status(500).json({ message: "Failed to create participation record" });
    }
  });
  
  app.get("/api/participation-records", ensureAuthenticated, async (req, res) => {
    try {
      const showHidden = req.query.showHidden === 'true';
      
      if (req.user!.role === "admin") {
        const records = await storage.getAllParticipationRecords();
        
        // Filter out hidden records if showHidden is false
        const filteredRecords = showHidden 
          ? records 
          : records.filter((record: ParticipationRecordWithStudent) => !record.hidden);
          
        return res.json(filteredRecords);
      } else {
        const records = await storage.getParticipationRecordsByStudent(req.user!.id);
        
        // Filter out hidden records if showHidden is false
        const filteredRecords = showHidden 
          ? records 
          : records.filter((record: ParticipationRecord) => !record.hidden);
          
        return res.json(filteredRecords);
      }
    } catch (error) {
      return res.status(500).json({ message: "Error fetching participation records" });
    }
  });
  
  // Delete all today's participation records
  app.delete("/api/participation-records/today", ensureAdmin, async (req, res) => {
    try {
      // Get today's date in local timezone
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Delete all records from today
      const deletedCount = await storage.deleteParticipationRecordsFromDate(today);
      
      // Broadcast the deletion to all clients
      broadcastToAll({
        type: "participationRecordsDeleted",
        payload: { date: today.toISOString() }
      });
      
      return res.json({ message: `Deleted ${deletedCount} participation records from today`, count: deletedCount });
    } catch (error) {
      console.error("Error deleting today's participation records:", error);
      return res.status(500).json({ message: "Failed to delete today's participation records" });
    }
  });
  
  app.get("/api/students/:id/participation-records", ensureAdmin, async (req, res) => {
    try {
      const studentId = parseInt(req.params.id);
      const student = await storage.getUser(studentId);
      const showHidden = req.query.showHidden === 'true';
      
      if (!student || student.role !== "student") {
        return res.status(404).json({ message: "Student not found" });
      }
      
      const records = await storage.getParticipationRecordsByStudent(studentId);
      
      // Filter out hidden records if showHidden is false
      const filteredRecords = showHidden 
        ? records 
        : records.filter((record: ParticipationRecord) => !record.hidden);
      
      return res.json(filteredRecords);
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