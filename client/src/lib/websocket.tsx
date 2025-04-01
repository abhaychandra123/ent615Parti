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
      console.log(`Connecting to WebSocket at ${wsUrl}`);
      const socket = new WebSocket(wsUrl);

      socket.addEventListener("open", () => {
        console.log("WebSocket connected");
        setConnected(true);
        courseIdRef.current = courseId;
        
        // Send initial message with course ID
        socket.send(JSON.stringify({
          type: "join",
          payload: { courseId, userId: user?.id }
        }));
        
        // Set up ping interval to keep connection alive
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, 30000);
      });

      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(event.data) as Message;
          
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

      socket.addEventListener("close", () => {
        console.log("WebSocket disconnected");
        setConnected(false);
        clearInterval(pingIntervalRef.current);
        
        // Try to reconnect if we have a courseId
        if (courseIdRef.current !== null) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            createWebSocket(courseIdRef.current!);
          }, 3000);
        }
      });

      socket.addEventListener("error", (error) => {
        console.error("WebSocket error:", error);
        setConnected(false);
      });

      webSocketRef.current = socket;
    } catch (error) {
      console.error("Error creating WebSocket:", error);
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
