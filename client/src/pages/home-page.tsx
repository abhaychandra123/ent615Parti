import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_COURSE } from "@shared/schema";
import { Loader2, Users, Award, BookOpen } from "lucide-react";
import { WebSocketProvider, useWebSocket } from "@/lib/websocket";
import StudentDashboard from "@/components/student-dashboard";
import AdminDashboard from "@/components/admin-dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Component that manages WebSocket connection
function CourseWithWebSocket({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { connect } = useWebSocket();
  
  // Connect to the WebSocket when the component mounts
  useEffect(() => {
    if (user) {
      console.log("Connecting to WebSocket for user:", user.id);
      connect();
    }
  }, [user, connect]);
  
  return <>{children}</>;
}

function CourseHeader() {
  const { user } = useAuth();
  
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold tracking-tight">
        {DEFAULT_COURSE.name}
      </h1>
      <p className="text-muted-foreground mt-1 mb-4">{DEFAULT_COURSE.description}</p>
      
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Role</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">{user?.role}</div>
            <p className="text-xs text-muted-foreground">
              {user?.role === "admin" ? "Manage student participation" : "Participate in class discussions"}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Course ID</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{DEFAULT_COURSE.id}</div>
            <p className="text-xs text-muted-foreground">
              Spring 2025 Semester
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Participation</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Active</div>
            <p className="text-xs text-muted-foreground">
              {user?.role === "admin" ? "Track student engagement" : "Earn points by participating"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HomePageContent() {
  const { user } = useAuth();
  
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-136px)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <>
      <CourseHeader />
      
      {user.role === "admin" ? (
        <AdminDashboard selectedCourse={DEFAULT_COURSE} />
      ) : (
        <StudentDashboard selectedCourse={DEFAULT_COURSE} />
      )}
    </>
  );
}

// Main component with WebSocket provider
export default function HomePage() {
  return (
    <WebSocketProvider>
      <CourseWithWebSocket>
        <HomePageContent />
      </CourseWithWebSocket>
    </WebSocketProvider>
  );
}