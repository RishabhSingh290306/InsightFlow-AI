"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

const modalVariants = cva(
  "fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4 transition-opacity duration-160ms ease-in-out",
  {
    variants: {
      variant: {
        default: "",
        sheet: "justify-end p-0",
        fullscreen: "p-0",
      },
      open: {
        true: "opacity-100",
        false: "opacity-0 pointer-events-none",
      },
    },
    defaultVariants: {
      variant: "default",
      open: false,
    },
  }
);

const modalContentVariants = cva(
  "relative z-50 flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-card p-6 shadow-soft-xl transition-all duration-220ms ease-in-out animate-dialog-in",
  {
    variants: {
      variant: {
        default: "max-w-lg",
        sm: "max-w-sm",
        lg: "max-w-2xl",
        xl: "max-w-4xl",
        sheet: "max-w-md h-full rounded-none rounded-l-2xl",
        fullscreen: "max-w-full max-h-full rounded-none",
      },
      size: {
        default: "",
        sm: "max-w-sm",
        lg: "max-w-2xl",
        xl: "max-w-4xl",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface ModalProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof modalVariants> {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const Modal = React.forwardRef<HTMLDivElement, ModalProps>(
  ({ className, variant, open, onClose, children, ...props }, ref) => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
      setMounted(true);
      if (open) {
        document.body.style.overflow = "hidden";
      } else {
        document.body.style.overflow = "";
      }
      return () => {
        document.body.style.overflow = "";
      };
    }, [open]);

    if (!mounted) return null;

    return createPortal(
      <div
        className={cn(modalVariants({ variant, open, className }))}
        onClick={onClose}
      >
        <div
          ref={ref}
          className={cn(modalContentVariants({ variant }))}
          onClick={(e) => e.stopPropagation()}
          {...props}
        >
          {children}
        </div>
      </div>,
      document.body
    );
  }
);
Modal.displayName = "Modal";

export interface ModalHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  onClose?: () => void;
  showClose?: boolean;
}

const ModalHeader = React.forwardRef<HTMLDivElement, ModalHeaderProps>(
  ({ className, title, description, onClose, showClose = true, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col space-y-1.5 p-6 pb-4", className)}
      {...props}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col space-y-1.5">
          {title && <h2 className="text-xl font-semibold tracking-tight">{title}</h2>}
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          {children}
        </div>
        {showClose && onClose && (
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-160ms"
            aria-label="Close"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
);
ModalHeader.displayName = "ModalHeader";

const ModalBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex-1 overflow-y-auto p-6 pt-0", className)} {...props} />
  )
);
ModalBody.displayName = "ModalBody";

const ModalFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center justify-end gap-2 p-6 pt-0", className)}
      {...props}
    />
  )
);
ModalFooter.displayName = "ModalFooter";

export { Modal, ModalHeader, ModalBody, ModalFooter };