import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F1E36] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[#0F1E36] text-white shadow-sm hover:bg-[#162F55]",
        destructive:
          "bg-[#991B1B] text-white shadow-sm hover:bg-[#7F1D1D]",
        outline:
          "border border-[#CBD5E1] bg-white shadow-sm hover:bg-[#F1F5F9] text-[#1F2937]",
        secondary:
          "bg-[#EEF2F7] text-[#1F2937] shadow-sm hover:bg-[#E2E6EC]",
        ghost: "hover:bg-[#F1F5F9] text-[#4B5563] hover:text-[#1F2937]",
        link: "text-[#0F1E36] underline-offset-4 hover:underline",
        /* New action variants */
        positive:
          "bg-[#166534] text-white shadow-sm hover:bg-[#14532D]",
        warning:
          "bg-[#B45309] text-white shadow-sm hover:bg-[#92400E]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    (<Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }