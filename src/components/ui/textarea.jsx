import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    (<textarea
      className={cn(
        "flex min-h-[60px] w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-base text-[#1F2937] shadow-sm placeholder:text-[#9CA3AF] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0F1E36] focus-visible:border-[#0F1E36] disabled:cursor-not-allowed disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] md:text-sm",
        className
      )}
      ref={ref}
      {...props} />)
  );
})
Textarea.displayName = "Textarea"

export { Textarea }