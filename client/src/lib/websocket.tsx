import { createContext, ReactNode, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

type WebSocketContextType = {
  connected: boolean;
  connecting: boolean;
  sendMessage: (type: string, payload: any) => void;
  subscribe: (type: string, callback: (payload: any) => void) => () => void;
  connect: () => void;
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

const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const INITIAL_RECONNECT_DELAY = 1000; // 1 second

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const webSocketRef = useRef<WebSocket | null>(null);
  const subscriptionsRef = useRef<Subscription[]>([]);
  const reconnectTimeoutRef = useRef<any>(null);
  const pingIntervalRef = useRef<any>(null);
  const reconnectAttemptsRef = useRef(0);
  const isUnmountingRef = useRef(false);
  const connectionIdRef = useRef(0);

  // Function to create a new WebSocket connection
  const createWebSocket = useCallback(() => {
    // Skip if unmounting or no user
    if (isUnmountingRef.current || !user) {
      return;
    }

    // Only attempt to connect if we're not already connecting or connected
    if (connecting || (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    setConnecting(true);

    // Increment connection ID to invalidate any previous connection attempts
    const connectionId = ++connectionIdRef.current;
    
    // Close existing connection if any
    if (webSocketRef.current) {
      try {
        webSocketRef.current.close();
      } catch (e) {
        // Ignore any errors on closing
      }
      webSocketRef.current = null;
    }

    // Get the current hostname and use it for WebSocket connection
    // Instead of constructing a custom URL, use the same origin with the ws protocol
    let wsUrl;
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host; // This includes hostname and port
      wsUrl = `${protocol}//${host}/ws`;
      
      console.log(`Attempting to connect to WebSocket at ${wsUrl}`);
      
      // Create the WebSocket connection
      const socket = new WebSocket(wsUrl);

      // Store the socket in the ref
      webSocketRef.current = socket;

      // Connection opened
      socket.addEventListener("open", (event) => {
        // Check if this connection is still valid
        if (connectionId !== connectionIdRef.current) {
          console.log("Ignoring stale WebSocket connection");
          try {
            socket.close();
          } catch (e) {
            // Ignore any errors on closing
          }
          return;
        }

        console.log("WebSocket connection established");
        setConnected(true);
        setConnecting(false);
        reconnectAttemptsRef.current = 0; // Reset reconnect attempts
        
        // Send initial message with user ID
        if (user) {
          const joinMessage = {
            type: "join",
            payload: { userId: user.id }
          };
          socket.send(JSON.stringify(joinMessage));
        }
        
        // Set up ping interval to keep connection alive
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, 30000);
      });

      // Listen for messages
      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(event.data) as Message;
          
          // Don't log pings and pongs to reduce console noise
          if (message.type !== "ping" && message.type !== "pong") {
            console.log("WebSocket message received:", message);
          }
          
          // Notify all subscribed callbacks for this message type
          subscriptionsRef.current.forEach((subscription) => {
            if (subscription.type === message.type) {
              subscription.callback(message.payload);
            }
          });
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      });

      // Connection closed
      socket.addEventListener("close", (event) => {
        // Skip if unmounting
        if (isUnmountingRef.current) {
          return;
        }

        // Check if this connection is still valid
        if (connectionId !== connectionIdRef.current) {
          return;
        }

        setConnected(false);
        setConnecting(false);
        clearInterval(pingIntervalRef.current);
        
        // Don't log normal closures
        if (event.code !== 1000 && event.code !== 1001) {
          console.log(`WebSocket connection closed with code ${event.code}`);
        }
        
        // Calculate reconnect delay with exponential backoff
        const reconnectAttempt = reconnectAttemptsRef.current++;
        const reconnectDelay = Math.min(
          INITIAL_RECONNECT_DELAY * Math.pow(1.5, reconnectAttempt),
          MAX_RECONNECT_DELAY
        );
        
        // Try to reconnect
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!isUnmountingRef.current && user) {
            console.log(`Attempting reconnection after ${reconnectDelay}ms...`);
            createWebSocket();
          }
        }, reconnectDelay);
      });

      // Connection error
      socket.addEventListener("error", (event) => {
        // Skip if unmounting or connection is stale
        if (isUnmountingRef.current || connectionId !== connectionIdRef.current) {
          return;
        }

        // We don't need to do anything here as the close event will be triggered next
        // and already handles reconnection
      });

    } catch (error) {
      console.error("Error creating WebSocket connection:", error);
      setConnected(false);
      setConnecting(false);
      
      // Try to reconnect after a delay
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (!isUnmountingRef.current && user) {
          createWebSocket();
        }
      }, INITIAL_RECONNECT_DELAY);
    }
  }, [user, connecting]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!user) {
      console.warn("Cannot connect: No user is logged in");
      return;
    }
    
    reconnectAttemptsRef.current = 0; // Reset reconnect attempts
    createWebSocket();
  }, [user, createWebSocket]);
  
  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    // Increment connection ID to invalidate any existing connections
    connectionIdRef.current++;
    
    if (webSocketRef.current) {
      try {
        webSocketRef.current.close();
      } catch (e) {
        // Ignore errors on close
      }
      webSocketRef.current = null;
    }
    
    clearTimeout(reconnectTimeoutRef.current);
    clearInterval(pingIntervalRef.current);
    setConnected(false);
    setConnecting(false);
  }, []);

  // Function to send a message to the WebSocket server
  const sendMessage = useCallback((type: string, payload: any) => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      webSocketRef.current.send(JSON.stringify({ type, payload }));
    } else {
      console.warn("WebSocket not connected, cannot send message");
      
      // Try to reconnect if not connected
      if (!connecting && !connected && user) {
        createWebSocket();
      }
    }
  }, [user, connected, connecting, createWebSocket]);

  // Function to subscribe to a specific message type
  const subscribe = useCallback((type: string, callback: (payload: any) => void) => {
    const subscription = { type, callback };
    subscriptionsRef.current.push(subscription);
    
    // Return unsubscribe function
    return () => {
      subscriptionsRef.current = subscriptionsRef.current.filter(
        (s) => s !== subscription
      );
    };
  }, []);

  // Connect when user changes
  useEffect(() => {
    // Only attempt to connect if we have a user and aren't already connected/connecting
    if (user && !connected && !connecting) {
      connect();
    }
  }, [user, connected, connecting, connect]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      isUnmountingRef.current = true;
      
      if (webSocketRef.current) {
        try {
          webSocketRef.current.close();
        } catch (e) {
          // Ignore errors on close
        }
      }
      
      clearTimeout(reconnectTimeoutRef.current);
      clearInterval(pingIntervalRef.current);
    };
  }, []);

  return (
    <WebSocketContext.Provider 
      value={{ 
        connected, 
        connecting,
        sendMessage, 
        subscribe, 
        connect, 
        disconnect 
      }}
    >
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