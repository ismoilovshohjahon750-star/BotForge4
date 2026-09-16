import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-xl text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none [&_svg]:pointer-events-none [&_svg]:shrink-0 leading-normal",
  {
    variants: {
      variant: {
        default: "bg-emerald-500 text-white hover:bg-emerald-600 active:bg-emerald-700 shadow-sm",
        outline:
          "border border-zinc-700 bg-zinc-900/80 text-zinc-100 hover:bg-zinc-800 hover:text-white active:bg-zinc-800",
        secondary:
          "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 active:bg-zinc-700",
        ghost:
          "text-zinc-300 hover:bg-zinc-800 hover:text-white active:bg-zinc-800",
        destructive:
          "bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 active:bg-red-500/30",
        link: "text-emerald-400 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 min-h-[40px] px-4 py-2.5 text-sm",
        xs: "h-7 min-h-[28px] px-2.5 py-1 text-xs rounded-lg",
        sm: "h-8.5 min-h-[34px] px-3 py-1.5 text-xs rounded-lg",
        lg: "h-12 min-h-[48px] px-6 py-3 text-base font-semibold rounded-xl",
        icon: "h-10 w-10 min-h-[40px] min-w-[40px] p-0",
        "icon-xs": "h-6 w-6 min-h-[24px] min-w-[24px] p-0 rounded-lg",
        "icon-sm": "h-7 w-7 min-h-[28px] min-w-[28px] p-0 rounded-lg",
        "icon-lg": "h-11 w-11 min-h-[44px] min-w-[44px] p-0 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => {
    return (
      <button
        type={type}
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

