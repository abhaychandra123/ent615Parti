import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useWebSocket } from "@/lib/websocket";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Course, ParticipationRecord } from "@shared/schema";
import { format } from "date-fns";
import { Hand as HandIcon, Check as CheckIcon } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

type StudentDashboardProps = {
  selectedCourse: Course;
};

export default function StudentDashboard({ selectedCourse }: StudentDashboardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [handRaised, setHandRaised] = useState(false);
  const [raisedTime, setRaisedTime] = useState<Date | null>(null);
  const [requestId, setRequestId] = useState<number | null>(null);
  const { connect, disconnect, subscribe } = useWebSocket();
  
  // Get student participation records
  const { data: participationRecords, isLoading: recordsLoading } = useQuery<ParticipationRecord[]>({
    queryKey: ["/api/courses", selectedCourse.id, "participation-records"],
    enabled: !!selectedCourse.id,
  });
  
  // Total points
  const { data: pointsData } = useQuery<{ points: number }>({
    queryKey: ["/api/courses", selectedCourse.id, "students", user?.id, "points"],
    enabled: !!selectedCourse.id && !!user?.id,
  });
  
  // Get active participation requests to check if student already has one
  const { data: participationRequests } = useQuery<any[]>({
    queryKey: ["/api/courses", selectedCourse.id, "participation-requests"],
    enabled: !!selectedCourse.id,
  });
  
  // Check if student already has an active request when loading the page
  useEffect(() => {
    if (participationRequests && user) {
      const activeRequest = participationRequests.find(req => req.studentId === user.id && req.active);
      if (activeRequest) {
        setHandRaised(true);
        setRequestId(activeRequest.id);
        setRaisedTime(new Date(activeRequest.timestamp));
      }
    }
  }, [participationRequests, user]);
  
  // Raise hand mutation
  const raiseHandMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/participation-requests", {
        courseId: selectedCourse.id,
        note: note.trim() || undefined
      });
      return await res.json();
    },
    onSuccess: (data) => {
      setHandRaised(true);
      setRequestId(data.id);
      setRaisedTime(new Date(data.timestamp));
      
      toast({
        title: "Hand Raised",
        description: "Your hand has been raised. The professor will see your request.",
      });
      
      // Invalidate participation requests cache
      queryClient.invalidateQueries({ queryKey: ["/api/courses", selectedCourse.id, "participation-requests"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to raise hand",
        variant: "destructive",
      });
    },
  });
  
  // Lower hand mutation
  const lowerHandMutation = useMutation({
    mutationFn: async () => {
      if (!requestId) return null;
      const res = await apiRequest("DELETE", `/api/participation-requests/${requestId}`);
      return res.ok;
    },
    onSuccess: () => {
      setHandRaised(false);
      setRequestId(null);
      setRaisedTime(null);
      setNote("");
      
      toast({
        title: "Hand Lowered",
        description: "Your hand has been lowered.",
      });
      
      // Invalidate participation requests cache
      queryClient.invalidateQueries({ queryKey: ["/api/courses", selectedCourse.id, "participation-requests"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to lower hand",
        variant: "destructive",
      });
    },
  });
  
  // Connect to WebSocket when course is selected
  useEffect(() => {
    if (selectedCourse.id) {
      connect(selectedCourse.id);
      
      // Subscribe to participation request deactivations
      const unsubscribe = subscribe("participationRequestDeactivated", (payload: { id: number }) => {
        if (payload.id === requestId) {
          setHandRaised(false);
          setRequestId(null);
          setRaisedTime(null);
          setNote("");
          
          toast({
            title: "Participation Acknowledged",
            description: "Your participation request has been processed.",
          });
          
          // Refresh participation records
          queryClient.invalidateQueries({ queryKey: ["/api/courses", selectedCourse.id, "participation-records"] });
          queryClient.invalidateQueries({ queryKey: ["/api/courses", selectedCourse.id, "students", user?.id, "points"] });
        }
      });
      
      return () => {
        unsubscribe();
        disconnect();
      };
    }
  }, [selectedCourse.id, requestId, user?.id]);
  
  // Handle raise hand button click
  const handleRaiseHand = () => {
    raiseHandMutation.mutate();
  };
  
  // Handle lower hand button click
  const handleLowerHand = () => {
    lowerHandMutation.mutate();
  };
  
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-medium mb-4">{selectedCourse.name}</h2>
      
      {/* Hand raising section */}
      <Card className="text-center">
        <CardHeader>
          <CardTitle className="text-lg">Want to participate?</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Click below to raise your hand and participate in the current discussion
          </p>
          
          {!handRaised && (
            <Button 
              size="lg" 
              className="mb-4 rounded-full px-6"
              onClick={handleRaiseHand}
              disabled={raiseHandMutation.isPending}
            >
              <HandIcon className="mr-2 h-5 w-5" />
              {raiseHandMutation.isPending ? "Raising Hand..." : "Raise Hand"}
            </Button>
          )}
          
          {handRaised && (
            <div className="w-full max-w-md mx-auto">
              <div className="bg-muted p-3 rounded-md mb-3">
                <div className="flex justify-between items-center text-sm mb-2">
                  <span className="font-medium">Hand raised</span>
                  <span className="text-muted-foreground">
                    {raisedTime && format(raisedTime, "h:mm a")}
                  </span>
                </div>
                <Input
                  placeholder="Add context (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled
                  className="mt-1"
                />
              </div>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={handleLowerHand}
                disabled={lowerHandMutation.isPending}
              >
                {lowerHandMutation.isPending ? "Lowering Hand..." : "Lower Hand"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Participation stats */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg">Your Participation</CardTitle>
            <Badge variant="outline" className="bg-primary text-white px-3 py-1">
              Total: {pointsData?.points || 0} points
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {recordsLoading ? (
            <div className="text-center py-6">
              <p className="text-muted-foreground">Loading participation history...</p>
            </div>
          ) : participationRecords && participationRecords.length > 0 ? (
            <div className="divide-y">
              {participationRecords.map((record) => (
                <div key={record.id} className="py-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center">
                        <span className="font-medium">
                          {record.timestamp ? format(new Date(record.timestamp), "MMM d, yyyy") : ""}
                        </span>
                        <Badge className="ml-2 bg-green-500 text-white">
                          +{record.points} point{record.points !== 1 && "s"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {record.note || "Participation"}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {record.timestamp ? format(new Date(record.timestamp), "h:mm a") : ""}
                    </span>
                  </div>
                  {record.feedback && (
                    <div className="mt-2 bg-muted p-3 rounded text-sm italic">
                      <span className="font-medium">Feedback: </span>
                      {record.feedback}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckIcon className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">No participation records yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your participation history will appear here
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
