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
          "border-transparent bg-[#EEF2F7] text-[#4B5563]",
        destructive:
          "border-transparent bg-[#FEE2E2] text-[#991B1B]",
        outline: "border-[#E2E6EC] text-[#1F2937] bg-white",
        success:
          "border-transparent bg-[#DCFCE7] text-[#166534]",
        warning:
          "border-transparent bg-[#FEF3C7] text-[#92400E]",
        info:
          "border-transparent bg-[#E0E7FF] text-[#1E3A8A]",
        /* Section-coded badges */
        attendance:
          "border-transparent bg-[#E8F0FF] text-[#1D4ED8]",
        salary:
          "border-transparent bg-[#EAF7EF] text-[#15803D]",
        overtime:
          "border-transparent bg-[#FFF4E5] text-[#B45309]",
        reports:
          "border-transparent bg-[#F3E8FF] text-[#7C3AED]",
        admin:
          "border-transparent bg-[#EEF2F7] text-[#334155]",
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