import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";

type WebSocketContextType = {
  connected: boolean;
  sendMessage: (type: string, payload: any) => void;
  subscribe: (type: string, callback: (payload: any) => void) => () => void;
  connect: (courseId: number) => void;
  disconnect: () => void;
};

type Message = {
  type: string;
  payload: any;
};

type Subscription = {
  type: string;
  callback: (payload: any) => void;
};

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const webSocketRef = useRef<WebSocket | null>(null);
  const subscriptionsRef = useRef<Subscription[]>([]);
  const reconnectTimeoutRef = useRef<any>(null);
  const pingIntervalRef = useRef<any>(null);
  const courseIdRef = useRef<number | null>(null);

  // Function to create a new WebSocket connection
  const createWebSocket = (courseId: number) => {
    // Close existing connection if any
    if (webSocketRef.current) {
      console.log("Closing existing WebSocket connection");
      webSocketRef.current.close();
    }

    // Get the current hostname and use it for WebSocket connection
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = window.location.hostname;
    const wsPort = window.location.port ? `:${window.location.port}` : '';
    const wsPath = "/ws";
    const wsUrl = `${wsProtocol}//${wsHost}${wsPort}${wsPath}`;
    
    try {
      if (!wsHost) {
        throw new Error("Invalid hostname for WebSocket connection");
      }
      
      console.log(`Attempting to connect to WebSocket at ${wsUrl} for course ${courseId}`);
      console.log(`Current location: ${window.location.href}`);
      
      // Create the WebSocket connection
      const socket = new WebSocket(wsUrl);
      console.log("WebSocket object created:", socket);

      // Connection opened
      socket.addEventListener("open", (event) => {
        console.log("WebSocket connection established:", event);
        setConnected(true);
        courseIdRef.current = courseId;
        
        // Send initial message with course ID
        const joinMessage = {
          type: "join",
          payload: { courseId, userId: user?.id }
        };
        console.log("Sending join message:", joinMessage);
        socket.send(JSON.stringify(joinMessage));
        
        // Set up ping interval to keep connection alive
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            console.log("Sending ping");
            socket.send(JSON.stringify({ type: "ping" }));
          } else {
            console.warn("Cannot send ping - socket not open");
          }
        }, 30000);
      });

      // Listen for messages
      socket.addEventListener("message", (event) => {
        console.log("WebSocket message received:", event.data);
        try {
          const message = JSON.parse(event.data) as Message;
          
          // Handle welcome message
          if (message.type === "welcome") {
            console.log("Welcome message from server:", message.payload);
          }
          
          // Handle join confirmation
          if (message.type === "joinConfirmed") {
            console.log("Successfully joined course room:", message.payload);
          }
          
          // Notify all subscribed callbacks for this message type
          subscriptionsRef.current.forEach((subscription) => {
            if (subscription.type === message.type) {
              subscription.callback(message.payload);
            }
          });
          
          // Special handling for pong messages
          if (message.type === "pong") {
            console.log("Received pong from server");
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      });

      // Connection closed
      socket.addEventListener("close", (event) => {
        console.log("WebSocket connection closed:", event.code, event.reason);
        setConnected(false);
        clearInterval(pingIntervalRef.current);
        
        // Try to reconnect if we have a courseId
        if (courseIdRef.current !== null) {
          console.log(`Will attempt to reconnect to course ${courseIdRef.current} in 3 seconds`);
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log("Attempting reconnection...");
            createWebSocket(courseIdRef.current!);
          }, 3000);
        }
      });

      // Connection error
      socket.addEventListener("error", (event) => {
        console.error("WebSocket connection error:", event);
        setConnected(false);
      });

      webSocketRef.current = socket;
    } catch (error) {
      console.error("Error creating WebSocket connection:", error);
      setConnected(false);
    }
  };

  // Connect to WebSocket with a course ID
  const connect = (courseId: number) => {
    courseIdRef.current = courseId;
    createWebSocket(courseId);
  };
  
  // Disconnect from WebSocket
  const disconnect = () => {
    if (webSocketRef.current) {
      webSocketRef.current.close();
      webSocketRef.current = null;
    }
    
    clearTimeout(reconnectTimeoutRef.current);
    clearInterval(pingIntervalRef.current);
    courseIdRef.current = null;
    setConnected(false);
  };

  // Function to send a message to the WebSocket server
  const sendMessage = (type: string, payload: any) => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      webSocketRef.current.send(JSON.stringify({ type, payload }));
    } else {
      console.error("WebSocket not connected, cannot send message");
    }
  };

  // Function to subscribe to a specific message type
  const subscribe = (type: string, callback: (payload: any) => void) => {
    const subscription = { type, callback };
    subscriptionsRef.current.push(subscription);
    
    // Return unsubscribe function
    return () => {
      subscriptionsRef.current = subscriptionsRef.current.filter(
        (s) => s !== subscription
      );
    };
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (webSocketRef.current) {
        webSocketRef.current.close();
      }
      clearTimeout(reconnectTimeoutRef.current);
      clearInterval(pingIntervalRef.current);
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ connected, sendMessage, subscribe, connect, disconnect }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return context;
}
