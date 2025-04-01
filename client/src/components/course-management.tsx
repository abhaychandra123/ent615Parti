import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Course, InsertCourse, insertCourseSchema, insertStudentCourseSchema } from "@shared/schema";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "@/hooks/use-toast";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, LogIn, School } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Create course component
export function CreateCourse() {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const createCourseSchema = insertCourseSchema.extend({
    name: z.string().min(3, "Course name must be at least 3 characters"),
    description: z.string().nullable().optional(),
  });

  type CreateCourseFormData = z.infer<typeof createCourseSchema>;

  const form = useForm<CreateCourseFormData>({
    resolver: zodResolver(createCourseSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const createCourseMutation = useMutation({
    mutationFn: async (data: CreateCourseFormData) => {
      try {
        console.log("Sending course data to API:", data);
        const res = await apiRequest("POST", "/api/courses", data);
        
        // Check if the response is OK
        if (!res.ok) {
          const errorData = await res.json();
          console.error("Server error:", errorData);
          throw new Error(errorData.message || "Failed to create course");
        }
        
        const result = await res.json();
        console.log("Course creation API response:", result);
        return result;
      } catch (error) {
        console.error("Error in createCourseMutation:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("Course created successfully:", data);
      setIsOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      toast({
        title: "Course created",
        description: "Your course has been created successfully.",
      });
    },
    onError: (error: Error) => {
      console.error("Course creation error:", error);
      toast({
        title: "Failed to create course",
        description: error.message || "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  function onSubmit(data: CreateCourseFormData) {
    console.log("Submitting form with data:", data);
    createCourseMutation.mutate(data);
  }

  return (
    <>
      <Button className="gap-2" onClick={() => setIsOpen(true)}>
        <PlusCircle className="h-4 w-4" />
        Create Course
      </Button>
      
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create a New Course</DialogTitle>
            <DialogDescription>
              Create a course for your students to join. All courses you create will be visible to students.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Course Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Introduction to Computer Science" {...field} />
                    </FormControl>
                    <FormDescription>
                      The name of your course as it will appear to students.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Provide a brief description of the course"
                        className="resize-none"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormDescription>
                      A brief description of the course content and objectives.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={createCourseMutation.isPending}>
                  {createCourseMutation.isPending ? "Creating..." : "Create Course"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Join Course component
export function JoinCourse() {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Fetch all available courses
  const { data: availableCourses, isLoading } = useQuery<Course[]>({
    queryKey: ["/api/all-courses"],
  });

  // Fetch student's enrolled courses to filter out already joined ones
  const { data: enrolledCourses } = useQuery<Course[]>({
    queryKey: ["/api/courses"],
  });

  const enrollCourseSchema = z.object({
    courseId: z.string().min(1, "Please select a course"),
  });

  type EnrollCourseFormData = z.infer<typeof enrollCourseSchema>;

  const form = useForm<EnrollCourseFormData>({
    resolver: zodResolver(enrollCourseSchema),
    defaultValues: {
      courseId: "",
    },
  });

  const enrollCourseMutation = useMutation({
    mutationFn: async (data: EnrollCourseFormData) => {
      try {
        console.log("Sending enrollment data to API:", data);
        const res = await apiRequest("POST", "/api/enrollments", {
          studentId: user?.id,
          courseId: parseInt(data.courseId),
        });
        
        // Check if the response is OK
        if (!res.ok) {
          const errorData = await res.json();
          console.error("Server error:", errorData);
          throw new Error(errorData.message || "Failed to join course");
        }
        
        const result = await res.json();
        console.log("Course enrollment API response:", result);
        return result;
      } catch (error) {
        console.error("Error in enrollCourseMutation:", error);
        throw error;
      }
    },
    onSuccess: () => {
      setIsOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      toast({
        title: "Enrolled successfully",
        description: "You have joined the course successfully.",
      });
    },
    onError: (error: Error) => {
      console.error("Course enrollment error:", error);
      toast({
        title: "Failed to join course",
        description: error.message || "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  function onSubmit(data: EnrollCourseFormData) {
    enrollCourseMutation.mutate(data);
  }

  // Filter out courses the student is already enrolled in
  const filteredCourses = availableCourses?.filter(
    (course) => !enrolledCourses?.some((enrolled) => enrolled.id === course.id)
  );

  return (
    <>
      <Button className="gap-2" onClick={() => setIsOpen(true)}>
        <LogIn className="h-4 w-4" />
        Join Course
      </Button>
      
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Join a Course</DialogTitle>
            <DialogDescription>
              Select a course to join from the list of available courses.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="courseId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Available Courses</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a course to join" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isLoading ? (
                          <SelectItem value="loading" disabled>
                            Loading courses...
                          </SelectItem>
                        ) : filteredCourses && filteredCourses.length > 0 ? (
                          filteredCourses.map((course) => (
                            <SelectItem key={course.id} value={String(course.id)}>
                              {course.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>
                            No available courses to join
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Choose from the list of courses you can join.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={enrollCourseMutation.isPending || !filteredCourses || filteredCourses.length === 0}
                >
                  {enrollCourseMutation.isPending ? "Joining..." : "Join Course"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// No Courses component for empty state
export function NoCourses() {
  const { user } = useAuth();
  
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
      <School className="h-16 w-16 text-muted-foreground mb-4" />
      <h2 className="text-2xl font-bold mb-2">No Courses Found</h2>
      <p className="text-muted-foreground mb-6 text-center max-w-md">
        {user?.role === "admin"
          ? "You haven't created any courses yet. Create your first course to get started."
          : "You aren't enrolled in any courses yet. Join a course to get started."}
      </p>
      
      <div className="flex gap-4">
        {user?.role === "admin" ? (
          <CreateCourse />
        ) : (
          <JoinCourse />
        )}
      </div>
    </div>
  );
}