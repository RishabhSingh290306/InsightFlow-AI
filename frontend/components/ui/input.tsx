import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

const inputVariants = cva(
  "flex h-10 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-160ms ease-in-out",
  {
    variants: {
      variant: {
        default: "",
        outline: "border-2 hover:border-primary/30 focus-within:border-primary/50",
        filled: "bg-muted/50 hover:bg-muted/70 focus-within:bg-muted/80",
        soft: "bg-muted/25 hover:bg-muted/40 focus-within:bg-muted/50 border-0",
        underlined:
          "border-b-2 border-b-input pb-1 pr-4 pl-0 focus-within:border-b-primary/50",
      },
      inputSize: {
        default: "",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        xl: "h-14 px-8 text-lg",
      },
      loading: {
        true: "opacity-75",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      inputSize: "default",
      loading: false,
    },
  }
);

export interface InputProps
  extends Omit<
      React.InputHTMLAttributes<HTMLInputElement>,
      "size" | "prefix"
    >,
    VariantProps<typeof inputVariants> {
  asChild?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  prefixEl?: React.ReactNode;
  suffix?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      variant,
      inputSize,
      asChild = false,
      loading = false,
      leftIcon,
      rightIcon,
      prefixEl,
      children,
      ...props
    },
    ref
  ) => {
    if (asChild) {
      return (
        <Slot
          className={cn(inputVariants({ variant, inputSize, loading, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    const hasLeft = !!leftIcon || !!prefixEl;
    const hasRight = !!rightIcon || loading;

    return (
      <div className="relative flex w-full items-center">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3 flex h-4 w-4 items-center text-muted-foreground">
            {leftIcon}
          </span>
        )}
        {prefixEl && (
          <span className="pointer-events-none absolute left-3 flex items-center text-sm text-muted-foreground">
            {prefixEl}
          </span>
        )}
        <input
          ref={ref}
          className={cn(
            inputVariants({ variant, inputSize, loading, className }),
            hasLeft && !prefixEl && "pl-9",
            prefixEl && "pl-7",
            hasRight && "pr-9"
          )}
          {...props}
        />
        {loading && (
          <span className="absolute right-3 flex h-4 w-4 items-center text-muted-foreground">
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </span>
        )}
        {rightIcon && !loading && (
          <span className="absolute right-3 flex h-4 w-4 items-center text-muted-foreground">
            {rightIcon}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input, inputVariants };
