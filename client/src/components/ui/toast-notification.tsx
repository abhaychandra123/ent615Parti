import { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const toastVariants = cva(
  "fixed bottom-4 right-4 flex items-center justify-between rounded-lg shadow-lg p-4 transition-all transform-gpu",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        success: "bg-green-500 text-white",
        error: "bg-red-500 text-white",
        warning: "bg-yellow-500 text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

interface ToastNotificationProps
  extends VariantProps<typeof toastVariants> {
  message: string;
  icon?: ReactNode;
  onClose?: () => void;
  className?: string;
}

export default function ToastNotification({
  message,
  icon,
  onClose,
  variant,
  className,
}: ToastNotificationProps) {
  return (
    <div className={cn(toastVariants({ variant }), className)}>
      <div className="flex items-center">
        {icon && <div className="mr-2">{icon}</div>}
        <span>{message}</span>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-4 p-1 rounded-full hover:bg-black/10"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
