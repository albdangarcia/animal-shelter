"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { LosHistogramBucket } from "@/app/lib/data/reports/length-of-stay-report.data";

const chartConfig = {
  count: {
    label: "Stays",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

/**
 * Distribution of completed-stay durations across day buckets, as a single-
 * series bar chart. Buckets and their counts are computed server-side over
 * stays whose outcome fell inside the selected period. Renders an empty state
 * when there are no completed stays in range (`completedCount === 0`), since
 * every bar would be zero. Follows the `intake-trend-chart` ChartContainer
 * pattern.
 */
export function LosHistogram({
  data,
  completedCount,
}: {
  data: LosHistogramBucket[];
  completedCount: number;
}) {
  if (completedCount === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No completed stays in this period.
      </p>
    );
  }

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
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={32}
          allowDecimals={false}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(label) => `${label} days`}
            />
          }
        />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
