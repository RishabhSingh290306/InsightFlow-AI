import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const tableVariants = cva("w-full caption-bottom border-collapse", {
  variants: {
    variant: {
      default: "",
      card: "overflow-hidden rounded-2xl border border-border bg-card shadow-soft-sm",
    },
    size: {
      default: "text-sm",
      sm: "text-xs",
      lg: "text-base",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

const tableHeaderVariants = cva("border-b border-border bg-muted/30 text-left", {
  variants: {
    variant: {},
  },
});

const tableRowVariants = cva(
  "border-b border-border transition-colors duration-160ms ease-in-out",
  {
    variants: {
      interactive: {
        true: "hover:bg-muted/40 cursor-pointer",
        false: "",
      },
      selected: {
        true: "bg-primary/5 border-l-2 border-l-primary",
        false: "",
      },
    },
  }
);

const tableCellVariants = cva("px-4 py-3 align-middle", {
  variants: {
    variant: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      header: "font-medium text-foreground",
    },
    align: {
      left: "text-left",
      center: "text-center",
      right: "text-right",
    },
  },
  defaultVariants: {
    variant: "default",
    align: "left",
  },
});

export interface TableProps
  extends React.HTMLAttributes<HTMLTableElement>,
    VariantProps<typeof tableVariants> {}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, variant, size, ...props }, ref) => (
    <div className="w-full overflow-x-auto scrollbar-thin">
      <table ref={ref} className={cn(tableVariants({ variant, size, className }))} {...props} />
    </div>
  )
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn(tableHeaderVariants(), className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn(className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement> & VariantProps<typeof tableRowVariants>
>(({ className, interactive, selected, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(tableRowVariants({ interactive, selected, className }))}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & VariantProps<typeof tableCellVariants>
>(({ className, variant = "header", align, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(tableCellVariants({ variant, align, className }))}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & VariantProps<typeof tableCellVariants>
>(({ className, variant, align, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(tableCellVariants({ variant, align, className }))}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t border-border bg-muted/30", className)}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  tableVariants,
  tableCellVariants,
};