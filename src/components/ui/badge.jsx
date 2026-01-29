import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#0F1E36] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[#0F1E36] text-white",
        secondary:
          "border-transparent bg-[#F1F4F8] text-[#4B5563]",
        destructive:
          "border-[#F5B5B5] bg-[#FDECEC] text-[#A61B1B]",
        outline: "border-[#E2E6EC] text-[#1F2937] bg-white",
        success:
          "border-[#BFE3C9] bg-[#EAF4EC] text-[#1F7A3A]",
        warning:
          "border-[#F5D38A] bg-[#FFF7E6] text-[#9A6700]",
        info:
          "border-transparent bg-[#EEF4FF] text-[#1E40AF]",
        gold:
          "border-transparent bg-[#FEF7E6] text-[#C9A24D]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}) {
  return (<div className={cn(badgeVariants({ variant }), className)} {...props} />);
}

export { Badge, badgeVariants }