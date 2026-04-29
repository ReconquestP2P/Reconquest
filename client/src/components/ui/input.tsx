import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border px-3 py-2 text-sm",
          "bg-[hsl(0_0%_8%)] border-[hsl(0_0%_15%)]",
          "text-white placeholder:text-neutral-500",
          "ring-offset-background",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#f97316] focus-visible:border-[#f97316]",
          "disabled:cursor-not-allowed disabled:opacity-40",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "transition-colors",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
