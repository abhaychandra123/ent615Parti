import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (feedback: string) => void;
  studentName: string;
}

export default function FeedbackModal({ isOpen, onClose, onSubmit, studentName }: FeedbackModalProps) {
  const [feedback, setFeedback] = useState("");
  
  const handleSubmit = () => {
    if (feedback.trim()) {
      onSubmit(feedback);
      setFeedback(""); // Reset the form
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Feedback</DialogTitle>
          <DialogDescription>
            Provide detailed feedback for the student's participation
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="student-name">Student:</Label>
            <div id="student-name" className="font-medium">{studentName}</div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="feedback-text">Feedback:</Label>
            <Textarea
              id="feedback-text"
              placeholder="Add detailed feedback here..."
              rows={4}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </div>
        </div>
        
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={!feedback.trim()}>
            Save Feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
