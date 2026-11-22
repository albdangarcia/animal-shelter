"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface ServerSideSwitchProps {
  paramKey: string;
  label: string;
}

export function ServerSideSwitch({ paramKey, label }: ServerSideSwitchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isChecked = searchParams.get(paramKey) === "true";

  const handleCheckedChange = (checked: boolean) => {
    const params = new URLSearchParams(searchParams);
    if (checked) {
      params.set(paramKey, "true");
    } else {
      params.delete(paramKey);
    }
    params.set("page", "1"); // Reset to page 1 on filter change
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <Switch
        id={paramKey}
        checked={isChecked}
        onCheckedChange={handleCheckedChange}
      />
      {/* One line: in a toolbar row that wraps, a long label would otherwise
          squeeze into a tall column beside the other filters. */}
      <Label htmlFor={paramKey} className="whitespace-nowrap">
        {label}
      </Label>
    </div>
  );
}