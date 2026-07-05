"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { MonthlyIntakePoint } from "@/app/lib/data/reports/intake-report.data";

const chartConfig = {
  count: {
    label: "Intakes",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

/**
 * Monthly intake trend as a single-series bar chart. The data is a continuous,
 * zero-filled month series computed server-side in the shelter timezone, so the
 * chart renders every calendar month in the range even when some have no
 * intakes. Follows the `chart-area-interactive` ChartContainer/tooltip pattern.
 */
export function IntakeTrendChart({ data }: { data: MonthlyIntakePoint[] }) {
  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-[250px] w-full"
    >
      <BarChart data={data} margin={{ left: 12, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={16}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent indicator="dot" />}
        />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
