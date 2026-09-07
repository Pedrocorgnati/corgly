"use client"

import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { buttonVariants } from "./button-variants"

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /**
     * Compatibilidade com a API `asChild` do Radix usada pelos call sites:
     * renderiza o unico filho no lugar do `<button>`, herdando classes e props.
     * O Base UI expressa a mesma composicao pela prop `render`, entao aqui
     * `asChild` e traduzido para `render`.
     */
    asChild?: boolean
  }

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  children,
  render,
  ...props
}: ButtonProps) {
  const resolvedRender =
    render ??
    (asChild && React.isValidElement(children)
      ? (children as React.ReactElement)
      : undefined)

  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...(resolvedRender ? { render: resolvedRender } : {})}
      {...props}
    >
      {resolvedRender ? undefined : children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
export type { ButtonProps }
