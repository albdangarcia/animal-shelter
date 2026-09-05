import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface ActionBlockedMessageProps {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}

const ActionBlockedMessage = ({ icon: Icon, title, children }: ActionBlockedMessageProps) => {
  return (
    <Card className="w-full mx-auto text-center">
      <CardHeader>
        <div className="mx-auto bg-yellow-100 dark:bg-yellow-900/30 rounded-full p-3 w-fit">
          <Icon className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
        </div>
        <CardTitle role="heading" aria-level={2} className="mt-4">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-muted-foreground space-y-2">{children}</div>
      </CardContent>
    </Card>
  );
};

export default ActionBlockedMessage;