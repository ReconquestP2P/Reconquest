import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface LtvBatteryIndicatorProps {
  ltv: number | string;
  showPercentage?: boolean;
  size?: "sm" | "md" | "lg";
}

export function LtvBatteryIndicator({ ltv, showPercentage = true, size = "md" }: LtvBatteryIndicatorProps) {
  const ltvValue = typeof ltv === 'string' ? parseFloat(ltv) : ltv;
  
  // 4-tier color system matching actual LTV triggers:
  // Green (Safe): ≤ 74% - No warnings
  // Yellow (Early Warning): 75-84% - Borrower warned
  // Orange (Critical Warning): 85-94% - Both parties warned
  // Red (Liquidation): ≥ 95% - Automatic liquidation
  
  const getColor = () => {
    if (ltvValue < 75) return "text-green-500";
    if (ltvValue < 85) return "text-yellow-500";
    if (ltvValue < 95) return "text-orange-500";
    return "text-red-500";
  };

  const getBgColor = () => {
    if (ltvValue < 75) return "bg-green-500";
    if (ltvValue < 85) return "bg-yellow-500";
    if (ltvValue < 95) return "bg-orange-500";
    return "bg-red-500";
  };

  const getStatusText = () => {
    if (ltvValue < 75) return "Safe";
    if (ltvValue < 85) return "Early Warning";
    if (ltvValue < 95) return "Critical Warning";
    return "Liquidation Risk";
  };

  const getStatusEmoji = () => {
    if (ltvValue < 75) return "🟢";
    if (ltvValue < 85) return "🟡";
    if (ltvValue < 95) return "🟠";
    return "🔴";
  };

  const getFillPercentage = () => {
    // Battery is FULL at 50% LTV (healthy starting point)
    // Battery drains as LTV rises above 50%
    // At 50% LTV → 100% fill, at 95% LTV → 0% fill (liquidation)
    if (ltvValue <= 50) return 100;
    if (ltvValue >= 95) return 5; // Nearly empty at liquidation
    // Map 50-95% LTV to 100-5% fill
    const range = 95 - 50; // 45% range
    const progress = ltvValue - 50;
    const fillReduction = (progress / range) * 95; // Reduce from 100 to 5
    return Math.max(5, 100 - fillReduction);
  };

  const getTerminalColor = () => {
    if (ltvValue < 75) return "#22c55e"; // green-500
    if (ltvValue < 85) return "#eab308"; // yellow-500
    if (ltvValue < 95) return "#f97316"; // orange-500
    return "#ef4444"; // red-500
  };

  const getBorderColor = () => {
    if (ltvValue < 75) return "border-green-500";
    if (ltvValue < 85) return "border-yellow-500";
    if (ltvValue < 95) return "border-orange-500";
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
            <p className={`text-sm ${getColor()}`}>{getStatusEmoji()} {getStatusText()}</p>
            <p className="text-xs text-muted-foreground pt-1 border-t">
              Battery drains as LTV rises. Keep it charged!
            </p>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>🟢 0-74% LTV: Safe zone</p>
              <p>🟡 75-84% LTV: Early warning</p>
              <p>🟠 85-94% LTV: Critical warning</p>
              <p>🔴 95%+ LTV: Liquidation triggered</p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
