import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BoardAnimal } from "@/app/lib/data/locations/shelter-board.data";

// Derive a 1-2 letter initial from an animal's name, matching how people are
// shown elsewhere with initial circles.
export const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

interface Props {
  animal: BoardAnimal;
  className?: string;
}

export const AnimalChip = ({ animal, className }: Props) => {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border bg-background px-2 py-1",
        className,
      )}
    >
      <Avatar className="size-6 shrink-0">
        {animal.thumbnailUrl && (
          <AvatarImage
            src={animal.thumbnailUrl}
            alt=""
            className="object-cover"
          />
        )}
        <AvatarFallback className="bg-secondary text-[10px] font-semibold text-secondary-foreground">
          {getInitials(animal.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium leading-tight">
          {animal.name}
        </p>
        <p className="truncate text-[10px] leading-tight text-muted-foreground">
          {animal.species}
        </p>
      </div>
    </div>
  );
};
