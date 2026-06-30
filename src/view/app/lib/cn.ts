import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn 标准工具:合并 className,Tailwind 冲突类后者覆盖前者。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
