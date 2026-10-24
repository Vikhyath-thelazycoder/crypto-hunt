import type { ButtonHTMLAttributes } from "react";

type Variant = "wax" | "ghost" | "brass";

const variantClass: Record<Variant, string> = {
  wax: "ch-wax h-[62px] rounded-[14px] text-[22px]",
  ghost: "ch-ghost h-12 rounded-xl text-base",
  brass: "ch-brass h-10 rounded-[10px] px-3.5 text-[15px]",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

/** Wax seal = the one primary action on a screen; ghost and brass are secondary. */
export function SealButton({ variant = "wax", type = "button", className = "", ...rest }: Props) {
  return <button type={type} className={`${variantClass[variant]} ${className}`.trim()} {...rest} />;
}
