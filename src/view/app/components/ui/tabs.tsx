import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/cn.ts";

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

/** 顶部导航,改用 Radix Tabs(键盘左右切换 + role=tablist/aria-selected);样式 = 原 .nav。 */
export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("flex items-center gap-[22px] text-sm text-muted max-[760px]:hidden", className)}
      {...props}
    />
  );
}

/** 单个 tab 触发器;样式 = 原 .nav-tab,active 态走 data-state 而非 .is-active。 */
export function TabsTrigger({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "cursor-pointer border-none bg-transparent p-0 font-[inherit] text-sm text-muted transition-colors",
        "hover:text-text data-[state=active]:font-[560] data-[state=active]:text-text",
        className,
      )}
      {...props}
    />
  );
}
