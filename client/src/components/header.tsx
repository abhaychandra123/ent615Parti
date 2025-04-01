import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut, School } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

export default function Header() {
  const { user, logoutMutation } = useAuth();
  
  if (!user) {
    return null; // Don't show header when not logged in
  }
  
  return (
    <header className="bg-primary text-white shadow-md">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <Link href="/">
          <div className="flex items-center cursor-pointer">
            <School className="mr-2" />
            <h1 className="text-xl font-medium">ClassParticipate</h1>
          </div>
        </Link>
        
        <div className="flex items-center">
          <Badge variant="outline" className={user.role === "admin" ? "bg-primary-light" : "bg-secondary"}>
            {user.role === "admin" ? "Admin" : "Student"}
          </Badge>
          <span className="mx-2">{user.name}</span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="flex items-center hover:bg-primary-light"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            <LogOut className="h-4 w-4 mr-1" />
            {logoutMutation.isPending ? "Logging out..." : "Logout"}
          </Button>
        </div>
      </div>
    </header>
  );
}
