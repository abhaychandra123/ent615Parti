import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { useWebSocket } from "@/lib/websocket";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Course, ParticipationRequestWithStudent, ParticipationRecordWithStudent } from "@shared/schema";
import { format } from "date-fns";
import { MessageSquare, RefreshCcw, Download as DownloadIcon, User as UserIcon, BarChart as ChartIcon, Clock as ClockIcon, Hand as HandIcon, Trash as TrashIcon } from "lucide-react";
import FeedbackModal from "@/components/feedback-modal";
import { Badge } from "@/components/ui/badge";

type AdminDashboardProps = {
  selectedCourse: Course;
};

export default function AdminDashboard({ selectedCourse }: AdminDashboardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { subscribe } = useWebSocket();
  const [selectedDateRange, setSelectedDateRange] = useState("month");
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<{id: number, name: string} | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  
  // Get participation requests (raised hands)
  const { 
    data: participationRequests, 
    isLoading: requestsLoading,
    refetch: refetchRequests 
  } = useQuery<ParticipationRequestWithStudent[]>({
    queryKey: ["/api/participation-requests"],
    refetchInterval: 10000, // Refresh every 10 seconds as a backup
  });
  
  // Get participation records
  const { 
    data: participationRecords,
    isLoading: recordsLoading,
    refetch: refetchRecords
  } = useQuery<ParticipationRecordWithStudent[]>({
    queryKey: ["/api/participation-records"],
  });
  
  // Subscribe to WebSocket events
  useEffect(() => {
    // Subscribe to new participation requests
    const requestSubscription = subscribe("participationRequest", () => {
      console.log("Received new participation request");
      refetchRequests();
    });
    
    // Subscribe to participation request deactivations
    const deactivationSubscription = subscribe("participationRequestDeactivated", () => {
      console.log("Participation request deactivated");
      refetchRequests();
    });
    
    // Subscribe to new participation records
    const recordSubscription = subscribe("participationRecordCreated", () => {
      console.log("New participation record created");
      refetchRecords();
    });
    
    // Subscribe to deleted participation records
    const recordsDeletedSubscription = subscribe("participationRecordsDeleted", () => {
      console.log("Participation records deleted");
      refetchRecords();
    });
    
    return () => {
      requestSubscription();
      deactivationSubscription();
      recordSubscription();
      recordsDeletedSubscription();
    };
  }, [subscribe, refetchRequests, refetchRecords]);
  
  // Handle assigning participation points
  const handleAssignPoints = async (studentId: number, points: number, requestId: number) => {
    try {
      await apiRequest("POST", "/api/participation-records", {
        studentId,
        points,
        requestId,
        feedback: "", // Add empty feedback to satisfy schema
        note: "Quick participation points" // Add default note
      });
      
      toast({
        title: "Points Added",
        description: `${points} participation point${points !== 1 ? 's' : ''} assigned successfully`,
      });
      
      // Refresh data
      refetchRequests();
      refetchRecords();
    } catch (error) {
      console.error("Error assigning points:", error);
      toast({
        title: "Error",
        description: "Failed to assign participation points",
        variant: "destructive",
      });
    }
  };
  
  // Handle opening feedback modal
  const handleOpenFeedbackModal = (student: { id: number, name: string }, requestId: number | null = null) => {
    setSelectedStudent(student);
    setSelectedRequestId(requestId);
    setFeedbackModalOpen(true);
  };
  
  // Handle feedback submission
  const handleFeedbackSubmit = async (feedback: string) => {
    if (!selectedStudent) return;
    
    try {
      const points = 1; // Default points with feedback
      
      await apiRequest("POST", "/api/participation-records", {
        studentId: selectedStudent.id,
        points,
        feedback,
        requestId: selectedRequestId
      });
      
      toast({
        title: "Feedback Saved",
        description: "Participation recorded with feedback",
      });
      
      // Refresh data
      refetchRequests();
      refetchRecords();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save feedback",
        variant: "destructive",
      });
    }
    
    setFeedbackModalOpen(false);
  };
  
  // Export participation data
  // Handle deletion of today's participation records
  const handleDeleteTodayRecords = async () => {
    if (!window.confirm("Are you sure you want to delete all of today's participation records? This action cannot be undone.")) {
      return;
    }
    
    try {
      const response = await apiRequest("DELETE", "/api/participation-records/today");
      const data = await response.json();
      
      toast({
        title: "Records Deleted",
        description: `${data.count} participation record(s) from today have been deleted`,
      });
      
      // Refresh data
      refetchRecords();
    } catch (error) {
      console.error("Error deleting records:", error);
      toast({
        title: "Error",
        description: "Failed to delete today's participation records",
        variant: "destructive",
      });
    }
  };
  
  const handleExportData = () => {
    if (!participationRecords) return;
    
    // Format the data for export
    const headers = ['Student', 'Points', 'Time', 'Date', 'Note', 'Feedback'];
    const csvRows = [headers];
    
    participationRecords.forEach(record => {
      const row = [
        record.student.name,
        String(record.points),
        format(new Date(record.timestamp), 'h:mm a'),
        format(new Date(record.timestamp), 'MMM d, yyyy'),
        record.note || '',
        record.feedback || ''
      ];
      csvRows.push(row);
    });
    
    // Convert to CSV
    const csvContent = csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    
    // Create a download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `participation_${selectedCourse.name}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Export Complete",
      description: "Participation data has been downloaded as a CSV file",
    });
  };

  // Function to calculate student participation statistics
  const calculateStudentStats = () => {
    if (!participationRecords) return [];
    
    const studentMap: Record<number, {
      id: number,
      name: string,
      username: string,
      totalPoints: number,
      participationCount: number,
      lastParticipation: Date | null
    }> = {};
    
    participationRecords.forEach(record => {
      const { student, points, timestamp } = record;
      
      if (!studentMap[student.id]) {
        studentMap[student.id] = {
          id: student.id,
          name: student.name,
          username: student.username,
          totalPoints: 0,
          participationCount: 0,
          lastParticipation: null
        };
      }
      
      studentMap[student.id].totalPoints += points;
      studentMap[student.id].participationCount += 1;
      
      const recordDate = new Date(timestamp);
      if (!studentMap[student.id].lastParticipation || 
          recordDate > studentMap[student.id].lastParticipation) {
        studentMap[student.id].lastParticipation = recordDate;
      }
    });
    
    return Object.values(studentMap).sort((a, b) => b.totalPoints - a.totalPoints);
  };
  
  // Get student statistics
  const studentStats = calculateStudentStats();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Participation queue */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center text-lg">
                <UserIcon className="mr-2 h-5 w-5" />
                Live Participation Queue
              </CardTitle>
              <div className="flex items-center text-sm">
                <span className="inline-block w-3 h-3 rounded-full bg-green-500 mr-1"></span>
                <span>Live</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {requestsLoading ? (
              <div className="py-4 text-center">
                <RefreshCcw className="animate-spin h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-muted-foreground">Loading queue...</p>
              </div>
            ) : participationRequests && participationRequests.length > 0 ? (
              <div className="divide-y">
                {participationRequests.map((request) => (
                  <div key={request.id} className="py-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center">
                          <span className="font-medium">{request.student.name}</span>
                          <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded-full">
                            {request.timestamp ? format(new Date(request.timestamp), "h:mm a") : ""}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {request.note || "Wants to participate"}
                        </p>
                      </div>
                      <div className="flex">
                        <Button 
                          size="sm" 
                          className="mr-2"
                          variant="secondary"
                          onClick={() => handleAssignPoints(request.student.id, 1, request.id)}
                        >
                          +1
                        </Button>
                        <Button 
                          size="sm" 
                          className="mr-2"
                          variant="secondary"
                          onClick={() => handleAssignPoints(request.student.id, 2, request.id)}
                        >
                          +2
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => handleOpenFeedbackModal(request.student, request.id)}
                          title="Add feedback"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center">
                <HandIcon className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No students in queue</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Students will appear here when they raise their hand
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Today's participation */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center text-lg">
                <ClockIcon className="mr-2 h-5 w-5" />
                Today's Participation
              </CardTitle>
              <div className="flex space-x-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="flex items-center text-sm"
                  onClick={handleDeleteTodayRecords}
                >
                  <TrashIcon className="h-3 w-3 mr-1" />
                  Delete All
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="flex items-center text-sm"
                  onClick={handleExportData}
                >
                  <DownloadIcon className="h-3 w-3 mr-1" />
                  Export
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {recordsLoading ? (
              <div className="py-4 text-center">
                <RefreshCcw className="animate-spin h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-muted-foreground">Loading participation data...</p>
              </div>
            ) : participationRecords && participationRecords.length > 0 ? (
              <div className="overflow-y-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Points</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Feedback</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {participationRecords
                      .filter(record => {
                        const recordDate = new Date(record.timestamp);
                        const today = new Date();
                        return recordDate.toDateString() === today.toDateString();
                      })
                      .map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="font-medium">
                            {record.student.name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-green-500 text-white">
                              +{record.points}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {record.timestamp ? format(new Date(record.timestamp), "h:mm a") : ""}
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-xs truncate">
                            {record.feedback || (record.note || "-")}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-12 text-center">
                <ChartIcon className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No participation records today</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Participation records will appear here
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Class participation overview */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center text-lg">
              <ChartIcon className="mr-2 h-5 w-5" />
              Class Participation Overview
            </CardTitle>
            <div className="flex items-center">
              <label htmlFor="date-range" className="text-sm mr-2">Date Range:</label>
              <Select 
                value={selectedDateRange}
                onValueChange={(value) => setSelectedDateRange(value)}
              >
                <SelectTrigger className="w-[130px] h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Past Week</SelectItem>
                  <SelectItem value="month">Past Month</SelectItem>
                  <SelectItem value="semester">Full Semester</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {recordsLoading ? (
            <div className="py-4 text-center">
              <RefreshCcw className="animate-spin h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">Loading overview data...</p>
            </div>
          ) : studentStats.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Total Points</TableHead>
                    <TableHead>Participation Count</TableHead>
                    <TableHead>Last Participation</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {studentStats.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell>{student.totalPoints}</TableCell>
                      <TableCell>{student.participationCount}</TableCell>
                      <TableCell>
                        {student.lastParticipation 
                          ? format(student.lastParticipation, "MMM d, h:mm a") 
                          : "-"
                        }
                      </TableCell>
                      <TableCell>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => handleOpenFeedbackModal({
                            id: student.id, 
                            name: student.name
                          })}
                          title="Add feedback"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-12 text-center">
              <ChartIcon className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">No participation data available</p>
              <p className="text-sm text-muted-foreground mt-1">
                Students' participation stats will appear here
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Feedback Modal */}
      {feedbackModalOpen && selectedStudent && (
        <FeedbackModal
          isOpen={feedbackModalOpen}
          onClose={() => setFeedbackModalOpen(false)}
          onSubmit={handleFeedbackSubmit}
          studentName={selectedStudent.name}
        />
      )}
    </div>
  );
}