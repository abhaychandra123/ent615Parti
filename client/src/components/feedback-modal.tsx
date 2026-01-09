import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (feedback: string, points: number) => void;
  studentName: string;
}

export default function FeedbackModal({ isOpen, onClose, onSubmit, studentName }: FeedbackModalProps) {
  const [feedback, setFeedback] = useState("");
  const [points, setPoints] = useState(1);

  const handleSubmit = () => {
    onSubmit(feedback, points);
    setFeedback(""); // Reset the form
    setPoints(1); // Reset points
  };

  const handleClose = () => {
    setFeedback("");
    setPoints(1);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
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
            <Label>Points:</Label>
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4, 5].map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={points === p ? "default" : "outline"}
                  size="sm"
                  className="w-10 h-10"
                  onClick={() => setPoints(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-text">Feedback (optional):</Label>
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
          <Button onClick={handleSubmit}>
            Save (+{points} point{points !== 1 ? "s" : ""})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
