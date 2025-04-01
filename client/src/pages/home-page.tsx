import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Course } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useWebSocket } from "@/lib/websocket";
import StudentDashboard from "@/components/student-dashboard";
import AdminDashboard from "@/components/admin-dashboard";
import { CreateCourse, JoinCourse, NoCourses } from "@/components/course-management";
import { Button } from "@/components/ui/button";

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
    return <NoCourses />;
  }
  
  // Use the websocket hook
  const { connect } = useWebSocket();
  
  // Connect to the WebSocket when the selected course changes
  useEffect(() => {
    if (selectedCourse) {
      console.log("Connecting to WebSocket for course:", selectedCourse.id);
      connect(selectedCourse.id);
    }
  }, [selectedCourse, connect]);
  
  return (
    <>
      {/* Course selector with management buttons */}
      <div className="mb-6 flex justify-between items-end">
        <div>
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
        
        {/* Add button for creating/joining courses */}
        <div>
          {user?.role === "admin" ? (
            <CreateCourse />
          ) : (
            <JoinCourse />
          )}
        </div>
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
    </>
  );
}
