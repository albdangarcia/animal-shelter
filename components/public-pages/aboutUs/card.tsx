interface CardProps {
  title: string;
  children: React.ReactNode;
}

const Card = ({ title, children }: CardProps) => {
  return (
    <div className="rounded-[28px] bg-card p-6">
      <h3 className="font-display text-[19px] text-foreground">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </div>
  );
};

export default Card;
