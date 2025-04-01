import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Course } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { WebSocketProvider } from "@/lib/websocket";
import StudentDashboard from "@/components/student-dashboard";
import AdminDashboard from "@/components/admin-dashboard";

export default function HomePage() {
  const { user } = useAuth();
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  
  // Fetch courses
  const { data: courses, isLoading: coursesLoading } = useQuery<Course[]>({
    queryKey: ["/api/courses"],
  });
  
  // Set first course as selected when courses load
  useEffect(() => {
    if (courses && courses.length > 0 && !selectedCourseId) {
      setSelectedCourseId(String(courses[0].id));
    }
  }, [courses, selectedCourseId]);
  
  // Get the selected course object
  const selectedCourse = courses?.find(course => course.id === parseInt(selectedCourseId));
  
  if (coursesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-136px)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!courses || courses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-136px)]">
        <h2 className="text-2xl font-bold mb-2">No Courses Found</h2>
        <p className="text-muted-foreground mb-6">
          {user?.role === "admin"
            ? "You haven't created any courses yet."
            : "You aren't enrolled in any courses yet."}
        </p>
      </div>
    );
  }
  
  return (
    <WebSocketProvider>
      {/* Course selector */}
      <div className="mb-6">
        <Label htmlFor="course-select" className="block text-sm font-medium mb-1">Select Course:</Label>
        <Select 
          value={selectedCourseId}
          onValueChange={setSelectedCourseId}
        >
          <SelectTrigger className="w-full max-w-xs" id="course-select">
            <SelectValue placeholder="Select a course" />
          </SelectTrigger>
          <SelectContent>
            {courses.map((course) => (
              <SelectItem key={course.id} value={String(course.id)}>
                {course.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {selectedCourse && (
        <>
          {user?.role === "admin" ? (
            <AdminDashboard selectedCourse={selectedCourse} />
          ) : (
            <StudentDashboard selectedCourse={selectedCourse} />
          )}
        </>
      )}
    </WebSocketProvider>
  );
}
