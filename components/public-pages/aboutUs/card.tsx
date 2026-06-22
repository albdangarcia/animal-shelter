interface CardProps {
  title: string;
  children: React.ReactNode;
}

const Card = ({ title, children }: CardProps) => {
  return (
    <div className="bg-muted rounded-lg px-5 py-4">
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </div>
  );
};

export default Card;