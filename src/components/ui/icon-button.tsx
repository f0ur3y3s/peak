import * as React from "react";
import { cn } from "@/lib/utils";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "destructive" | "ghost";
}

// 44×44 hit target (the iOS/Android touch-target minimum) around a smaller
// visual icon — replaces four call sites that each hand-rolled a 36×36
// destructive "delete" button with identical inline styles.
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = "ghost", style, ...props }, ref) => {
    const variantStyle: React.CSSProperties =
      variant === "destructive"
        ? {
            background: "hsl(var(--destructive) / 0.1)",
            border: "1px solid hsl(var(--destructive) / 0.3)",
            color: "hsl(var(--destructive))",
          }
        : {
            background: "none",
            border: "none",
            color: "hsl(var(--muted-foreground))",
          };
    return (
      <button
        ref={ref}
        type="button"
        className={cn("inline-flex items-center justify-center shrink-0 cursor-pointer", className)}
        style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          ...variantStyle,
          ...style,
        }}
        {...props}
      />
    );
  }
);
IconButton.displayName = "IconButton";

export { IconButton };
