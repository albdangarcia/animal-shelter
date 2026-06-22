import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchPetCardData } from "@/app/lib/data/analytics.data";

// Helper function to format percentage
const formatPercentage = (value: number) => {
  const abs = Math.abs(value);
  return `${value >= 0 ? "+" : "-"}${abs.toFixed(1)}%`;
};

// Helper function to get trend message
const getTrendMessage = (change: number, context: string) => {
  const isPositive = change >= 0;

  if (Math.abs(change) < 5) {
    return `Stable ${context}`;
  }

  if (isPositive) {
    return `Trending up this month`;
  }

  return `Down ${Math.abs(change).toFixed(1)}% this period`;
};

// Helper function to get footer description
const getFooterDescription = (cardType: string, change: number) => {
  const descriptions = {
    totalAnimals: {
      positive: "New intakes showing growth",
      negative: "Fewer intakes this period",
      stable: "Consistent intake volume",
    },
    adopted: {
      positive: "Strong adoption success",
      negative: "Adoption needs attention",
      stable: "Steady adoption rate",
    },
    published: {
      positive: "Engagement exceeds targets",
      negative: "Listing activity below target",
      stable: "Consistent listing activity",
    },
    tasks: {
      positive: "Task backlog increasing",
      negative: "Task completion improving",
      stable: "Task volume stable",
    },
  };

  const category = descriptions[cardType as keyof typeof descriptions];
  if (!category) return "Monitoring performance";

  if (Math.abs(change) < 5) return category.stable;
  return change >= 0 ? category.positive : category.negative;
};

export async function SectionCards() {
  const data = await fetchPetCardData();
  const {
    totalPets,
    adoptedPetsCount,
    publishedPetsCount,
    todoTasksCount,
    trends,
  } = data;

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Animals</CardDescription>
          <CardTitle className="text-2xl tabular-nums @[250px]/card:text-3xl">
            {totalPets}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {trends.totalPetsChange >= 0 ? (
                <IconTrendingUp />
              ) : (
                <IconTrendingDown />
              )}
              {formatPercentage(trends.totalPetsChange)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {getTrendMessage(trends.totalPetsChange, "this month")}
            {trends.totalPetsChange >= 0 ? (
              <IconTrendingUp className="size-4" />
            ) : (
              <IconTrendingDown className="size-4" />
            )}
          </div>
          <div className="text-muted-foreground">
            {getFooterDescription("totalAnimals", trends.totalPetsChange)}
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Adopted Animals</CardDescription>
          <CardTitle className="text-2xl tabular-nums @[250px]/card:text-3xl">
            {adoptedPetsCount}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {trends.adoptedPetsChange >= 0 ? (
                <IconTrendingUp />
              ) : (
                <IconTrendingDown />
              )}
              {formatPercentage(trends.adoptedPetsChange)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {getTrendMessage(trends.adoptedPetsChange, "this period")}
            {trends.adoptedPetsChange >= 0 ? (
              <IconTrendingUp className="size-4" />
            ) : (
              <IconTrendingDown className="size-4" />
            )}
          </div>
          <div className="text-muted-foreground">
            {getFooterDescription("adopted", trends.adoptedPetsChange)}
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Published Animals</CardDescription>
          <CardTitle className="text-2xl tabular-nums @[250px]/card:text-3xl">
            {publishedPetsCount}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {trends.publishedPetsChange >= 0 ? (
                <IconTrendingUp />
              ) : (
                <IconTrendingDown />
              )}
              {formatPercentage(trends.publishedPetsChange)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {getTrendMessage(trends.publishedPetsChange, "this month")}
            {trends.publishedPetsChange >= 0 ? (
              <IconTrendingUp className="size-4" />
            ) : (
              <IconTrendingDown className="size-4" />
            )}
          </div>
          <div className="text-muted-foreground">
            {getFooterDescription("published", trends.publishedPetsChange)}
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>To-do Tasks</CardDescription>
          <CardTitle className="text-2xl tabular-nums @[250px]/card:text-3xl">
            {todoTasksCount}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {trends.todoTasksChange >= 0 ? (
                <IconTrendingUp />
              ) : (
                <IconTrendingDown />
              )}
              {formatPercentage(trends.todoTasksChange)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {getTrendMessage(trends.todoTasksChange, "compared to last month")}
            {trends.todoTasksChange >= 0 ? (
              <IconTrendingUp className="size-4" />
            ) : (
              <IconTrendingDown className="size-4" />
            )}
          </div>
          <div className="text-muted-foreground">
            {getFooterDescription("tasks", trends.todoTasksChange)}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
