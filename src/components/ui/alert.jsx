
import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default: "bg-white border-[#E2E6EC] text-[#1F2937] [&>svg]:text-[#4B5563]",
        destructive:
          "border-[#F5B5B5] bg-[#FDECEC] text-[#A61B1B] [&>svg]:text-[#A61B1B]",
        warning:
          "border-[#F5D38A] bg-[#FFF7E6] text-[#9A6700] [&>svg]:text-[#9A6700]",
        success:
          "border-[#BFE3C9] bg-[#EAF4EC] text-[#1F7A3A] [&>svg]:text-[#1F7A3A]",
        info:
          "border-transparent bg-[#EEF4FF] text-[#1E40AF] [&>svg]:text-[#1E40AF]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props} />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props} />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props} />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
