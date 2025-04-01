import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import AuthForms from "@/components/auth-forms";
import { School } from "lucide-react";

export default function AuthPage() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  
  // Redirect to home if already logged in
  useEffect(() => {
    if (user && !isLoading) {
      navigate("/");
    }
  }, [user, isLoading, navigate]);
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }
  
  return (
    <div className="min-h-[calc(100vh-136px)] flex flex-col md:flex-row items-center justify-center gap-8 py-8">
      {/* Left panel - Authentication form */}
      <div className="w-full max-w-md px-4">
        <AuthForms />
      </div>
      
      {/* Right panel - App description */}
      <div className="w-full max-w-md px-4 text-center md:text-left">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-4 mb-6">
          <School className="h-16 w-16 text-primary" />
          <div>
            <h1 className="text-3xl font-bold text-primary">ClassParticipate</h1>
            <p className="text-lg text-muted-foreground">Track student engagement in real-time</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-2">For Professors</h2>
            <p className="text-muted-foreground">
              Easily track and reward student participation in your classes. See who's engaged, assign points, and provide feedback - all in real-time.
            </p>
          </div>
          
          <div>
            <h2 className="text-xl font-semibold mb-2">For Students</h2>
            <p className="text-muted-foreground">
              Participate actively by raising your virtual hand, get recognition for your contributions, and track your participation history.
            </p>
          </div>
          
          <div className="pt-4">
            <h3 className="font-medium mb-2">Key Features:</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Real-time participation tracking</li>
              <li>Simple "Raise Hand" system</li>
              <li>Instant point assignment</li>
              <li>Detailed participation records</li>
              <li>Feedback capabilities</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
