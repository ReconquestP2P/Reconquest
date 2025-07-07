import { useQuery } from "@tanstack/react-query";
import { Bitcoin, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface BitcoinPriceData {
  usd: number;
  eur: number;
  usd_24h_change: number;
  eur_24h_change: number;
  last_updated: string;
  timestamp: string;
  source: string;
  error?: string;
}

interface BitcoinPriceOracleProps {
  variant?: "compact" | "card" | "full";
  showSource?: boolean;
  refreshInterval?: number;
}

export default function BitcoinPriceOracle({ 
  variant = "compact", 
  showSource = false,
  refreshInterval = 30000 
}: BitcoinPriceOracleProps) {
  const { data: btcPrice, isLoading, error, refetch } = useQuery<BitcoinPriceData>({
    queryKey: ["/api/btc-price"],
    refetchInterval: refreshInterval,
  });

  const formatPrice = (price: number, currency: "USD" | "EUR") => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const formatChange = (change: number) => {
    return `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
  };

  const getChangeIcon = (change: number) => {
    return change >= 0 ? TrendingUp : TrendingDown;
  };

  const getChangeColor = (change: number) => {
    return change >= 0 ? 'text-green-600' : 'text-red-600';
  };

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2 text-sm text-gray-500">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Loading BTC price...</span>
      </div>
    );
  }

  if (error || !btcPrice) {
    return (
      <div className="flex items-center space-x-2 text-sm text-red-500">
        <Bitcoin className="h-4 w-4" />
        <span>Price unavailable</span>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className="flex items-center space-x-4 text-sm">
        <Bitcoin className="h-4 w-4 text-orange-500" />
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1">
            <span className="text-gray-600">USD:</span>
            <span className="font-semibold text-primary">
              {formatPrice(btcPrice.usd, "USD")}
            </span>
            {btcPrice.usd_24h_change !== undefined && (
              <span className={`text-xs ${getChangeColor(btcPrice.usd_24h_change)}`}>
                {formatChange(btcPrice.usd_24h_change)}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-1">
            <span className="text-gray-600">EUR:</span>
            <span className="font-semibold text-primary">
              {formatPrice(btcPrice.eur, "EUR")}
            </span>
            {btcPrice.eur_24h_change !== undefined && (
              <span className={`text-xs ${getChangeColor(btcPrice.eur_24h_change)}`}>
                {formatChange(btcPrice.eur_24h_change)}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "card") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Bitcoin Price</CardTitle>
          <Bitcoin className="h-4 w-4 text-orange-500" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{formatPrice(btcPrice.usd, "USD")}</p>
                <p className="text-xs text-muted-foreground">USD</p>
              </div>
              {btcPrice.usd_24h_change !== undefined && (
                <div className={`flex items-center space-x-1 ${getChangeColor(btcPrice.usd_24h_change)}`}>
                  {(() => {
                    const IconComponent = getChangeIcon(btcPrice.usd_24h_change);
                    return <IconComponent className="h-4 w-4" />;
                  })()}
                  <span className="text-sm font-medium">
                    {formatChange(btcPrice.usd_24h_change)}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{formatPrice(btcPrice.eur, "EUR")}</p>
                <p className="text-xs text-muted-foreground">EUR</p>
              </div>
              {btcPrice.eur_24h_change !== undefined && (
                <div className={`flex items-center space-x-1 ${getChangeColor(btcPrice.eur_24h_change)}`}>
                  {(() => {
                    const IconComponent = getChangeIcon(btcPrice.eur_24h_change);
                    return <IconComponent className="h-4 w-4" />;
                  })()}
                  <span className="text-sm font-medium">
                    {formatChange(btcPrice.eur_24h_change)}
                  </span>
                </div>
              )}
            </div>
            {showSource && (
              <div className="flex items-center justify-between pt-2 border-t">
                <Badge variant="secondary" className="text-xs">
                  {btcPrice.source}
                </Badge>
                <button 
                  onClick={() => refetch()}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (variant === "full") {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Bitcoin className="h-5 w-5 text-orange-500" />
            <span>Bitcoin Price Oracle</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">USD Price</h3>
                {btcPrice.usd_24h_change !== undefined && (
                  <div className={`flex items-center space-x-1 ${getChangeColor(btcPrice.usd_24h_change)}`}>
                    {(() => {
                      const IconComponent = getChangeIcon(btcPrice.usd_24h_change);
                      return <IconComponent className="h-4 w-4" />;
                    })()}
                    <span className="text-sm font-medium">
                      {formatChange(btcPrice.usd_24h_change)}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-3xl font-bold text-primary">{formatPrice(btcPrice.usd, "USD")}</p>
              <p className="text-sm text-muted-foreground">Last updated: {new Date(btcPrice.last_updated).toLocaleTimeString()}</p>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">EUR Price</h3>
                {btcPrice.eur_24h_change !== undefined && (
                  <div className={`flex items-center space-x-1 ${getChangeColor(btcPrice.eur_24h_change)}`}>
                    {(() => {
                      const IconComponent = getChangeIcon(btcPrice.eur_24h_change);
                      return <IconComponent className="h-4 w-4" />;
                    })()}
                    <span className="text-sm font-medium">
                      {formatChange(btcPrice.eur_24h_change)}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-3xl font-bold text-primary">{formatPrice(btcPrice.eur, "EUR")}</p>
              <p className="text-sm text-muted-foreground">Last updated: {new Date(btcPrice.last_updated).toLocaleTimeString()}</p>
            </div>
          </div>
          
          {showSource && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="flex items-center space-x-2">
                <Badge variant="secondary">
                  Source: {btcPrice.source}
                </Badge>
                {btcPrice.error && (
                  <Badge variant="destructive">
                    Fallback Data
                  </Badge>
                )}
              </div>
              <button 
                onClick={() => refetch()}
                className="flex items-center space-x-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Refresh</span>
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return null;
}