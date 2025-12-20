import { Battery, BatteryLow, BatteryMedium, BatteryFull, BatteryWarning } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface LtvBatteryIndicatorProps {
  ltv: number | string;
  showPercentage?: boolean;
  size?: "sm" | "md" | "lg";
}

export function LtvBatteryIndicator({ ltv, showPercentage = true, size = "md" }: LtvBatteryIndicatorProps) {
  const ltvValue = typeof ltv === 'string' ? parseFloat(ltv) : ltv;
  
  const getColor = () => {
    if (ltvValue <= 75) return "text-green-500";
    if (ltvValue <= 95) return "text-yellow-500";
    return "text-red-500";
  };

  const getBgColor = () => {
    if (ltvValue <= 75) return "bg-green-500";
    if (ltvValue <= 95) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getStatusText = () => {
    if (ltvValue <= 75) return "Healthy";
    if (ltvValue <= 95) return "Warning";
    return "Critical";
  };

  const getFillPercentage = () => {
    return Math.min(100, Math.max(0, ltvValue));
  };

  const getTerminalColor = () => {
    if (ltvValue <= 75) return "#22c55e";
    if (ltvValue <= 95) return "#eab308";
    return "#ef4444";
  };

  const getBorderColor = () => {
    if (ltvValue <= 75) return "border-green-500";
    if (ltvValue <= 95) return "border-yellow-500";
    return "border-red-500";
  };

  const sizeClasses = {
    sm: "w-6 h-3",
    md: "w-8 h-4",
    lg: "w-10 h-5"
  };

  const textSizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base"
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 cursor-help" data-testid="ltv-battery-indicator">
            <div className={`relative ${sizeClasses[size]} border-2 rounded-sm ${getBorderColor()}`}>
              <div 
                className="absolute right-[-3px] top-1/2 -translate-y-1/2 w-[3px] h-[40%] rounded-r-sm opacity-60" 
                style={{ backgroundColor: getTerminalColor() }}
              ></div>
              <div 
                className={`absolute left-0 top-0 bottom-0 rounded-sm transition-all duration-300 ${getBgColor()}`}
                style={{ width: `${getFillPercentage()}%` }}
              />
            </div>
            {showPercentage && (
              <span className={`font-medium ${getColor()} ${textSizeClasses[size]}`}>
                {ltvValue.toFixed(1)}%
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold">LTV: {ltvValue.toFixed(1)}%</p>
            <p className={`text-sm ${getColor()}`}>Status: {getStatusText()}</p>
            <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t">
              <p>• Green (0-75%): Safe zone</p>
              <p>• Yellow (75-95%): Warning zone</p>
              <p>• Red (95%+): Liquidation risk</p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
