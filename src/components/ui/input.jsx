import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    (<input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-1 text-base text-[#1F2937] shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[#1F2937] placeholder:text-[#9CA3AF] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0F1E36] focus-visible:border-[#0F1E36] disabled:cursor-not-allowed disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] md:text-sm",
        className
      )}
      ref={ref}
      {...props} />)
  );
})
Input.displayName = "Input"

export { Input }