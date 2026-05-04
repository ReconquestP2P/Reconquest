import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  iconColor?: string;
  valueColor?: string;
}

export default function StatsCard({
  title,
  value,
  icon: Icon,
  iconColor = "text-primary",
  valueColor = "text-white",
}: StatsCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-neutral-400">{title}</p>
            <p className={`text-xl font-bold whitespace-nowrap ${valueColor}`}>{value}</p>
          </div>
          <div className="flex-shrink-0 bg-neutral-800 p-3 rounded-xl border border-neutral-700">
            <Icon className={`h-6 w-6 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
