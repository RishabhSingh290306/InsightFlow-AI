import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const textVariants = cva("", {
  variants: {
    variant: {
      h1: "text-4xl font-bold tracking-tight lg:text-5xl",
      h2: "text-3xl font-bold tracking-tight lg:text-4xl",
      h3: "text-2xl font-semibold tracking-tight",
      h4: "text-xl font-semibold tracking-tight",
      h5: "text-lg font-semibold tracking-tight",
      h6: "text-base font-semibold tracking-tight",
      body: "text-base leading-relaxed text-muted-foreground",
      bodyLarge: "text-lg leading-relaxed text-muted-foreground",
      bodySmall: "text-sm leading-relaxed text-muted-foreground",
      caption: "text-sm text-muted-foreground",
      label: "text-2xs font-medium uppercase tracking-widest text-muted-foreground",
      code: "font-mono text-sm text-foreground bg-muted/50 rounded px-1.5 py-0.5",
      lead: "text-xl leading-relaxed text-muted-foreground",
    },
    weight: {
      light: "font-light",
      normal: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
    },
    align: {
      left: "text-left",
      center: "text-center",
      right: "text-right",
    },
  },
  defaultVariants: {
    variant: "body",
    weight: "normal",
    align: "left",
  },
});

export interface TextProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof textVariants> {
  as?: keyof JSX.IntrinsicElements;
}

const Text = React.forwardRef<HTMLElement, TextProps>(
  ({ className, variant, weight, align, as, children, ...props }, ref) => {
    const Comp = (as || "p") as React.ElementType;

    const combined = cn(textVariants({ variant, weight, align, className }));

    return (
      <Comp ref={ref} className={combined} {...props}>
        {children}
      </Comp>
    );
  }
);
Text.displayName = "Text";

export { Text, textVariants };
