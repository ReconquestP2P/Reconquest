import { useState } from "react";
import BitcoinPriceOracle from "@/components/bitcoin-price-oracle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, Activity, Clock, Database } from "lucide-react";

export default function PriceOracle() {
  const [showSource, setShowSource] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000);
  const [variant, setVariant] = useState<"compact" | "card" | "full">("full");

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Bitcoin Price Oracle
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Real-time Bitcoin prices in USD and EUR powered by CoinGecko API. 
            Live data updates every 30 seconds for accurate lending calculations.
          </p>
        </div>

        {/* Configuration Panel */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="h-5 w-5" />
              <span>Oracle Configuration</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="variant-select">Display Variant</Label>
                <Select value={variant} onValueChange={(value: any) => setVariant(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select variant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="full">Full</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="refresh-select">Refresh Interval</Label>
                <Select 
                  value={refreshInterval.toString()} 
                  onValueChange={(value) => setRefreshInterval(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select interval" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10000">10 seconds</SelectItem>
                    <SelectItem value="30000">30 seconds</SelectItem>
                    <SelectItem value="60000">1 minute</SelectItem>
                    <SelectItem value="300000">5 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="show-source"
                  checked={showSource}
                  onCheckedChange={setShowSource}
                />
                <Label htmlFor="show-source">Show Data Source</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Price Oracle */}
        <div className="mb-8">
          <BitcoinPriceOracle 
            variant={variant} 
            showSource={showSource} 
            refreshInterval={refreshInterval}
          />
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="flex flex-col items-center text-center p-6">
              <TrendingUp className="h-8 w-8 text-green-600 mb-2" />
              <h3 className="font-semibold mb-2">Real-Time Data</h3>
              <p className="text-sm text-gray-600">
                Live Bitcoin prices from CoinGecko API with 24-hour change indicators
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col items-center text-center p-6">
              <Database className="h-8 w-8 text-blue-600 mb-2" />
              <h3 className="font-semibold mb-2">Dual Currency</h3>
              <p className="text-sm text-gray-600">
                Displays prices in both USD and EUR for global accessibility
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col items-center text-center p-6">
              <Clock className="h-8 w-8 text-orange-600 mb-2" />
              <h3 className="font-semibold mb-2">Auto Updates</h3>
              <p className="text-sm text-gray-600">
                Configurable refresh intervals from 10 seconds to 5 minutes
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col items-center text-center p-6">
              <Activity className="h-8 w-8 text-purple-600 mb-2" />
              <h3 className="font-semibold mb-2">Fallback System</h3>
              <p className="text-sm text-gray-600">
                Automatic fallback to mock data if external API is unavailable
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Technical Details */}
        <Card>
          <CardHeader>
            <CardTitle>Technical Implementation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-3">Data Source</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Provider:</span>
                    <Badge variant="secondary">CoinGecko API</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Rate Limit:</span>
                    <Badge variant="outline">30 calls/minute</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">API Key:</span>
                    <Badge variant="outline">Not Required</Badge>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Data Points</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Bitcoin USD Price:</span>
                    <Badge variant="secondary">Real-time</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Bitcoin EUR Price:</span>
                    <Badge variant="secondary">Real-time</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">24h Change:</span>
                    <Badge variant="secondary">Percentage</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Last Updated:</span>
                    <Badge variant="secondary">Timestamp</Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-semibold mb-2">API Endpoint</h4>
              <code className="text-sm bg-white px-2 py-1 rounded border">
                GET /api/btc-price
              </code>
              <p className="text-sm text-gray-600 mt-2">
                Returns real-time Bitcoin prices in USD and EUR with 24-hour change data and timestamps.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Integration Examples */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Integration Examples</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="space-y-4">
                <h4 className="font-semibold">Compact (Navigation)</h4>
                <div className="p-4 border rounded-lg bg-white">
                  <BitcoinPriceOracle variant="compact" />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold">Card (Dashboard)</h4>
                <BitcoinPriceOracle variant="card" showSource={true} />
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold">Usage in Lending</h4>
                <div className="p-4 border rounded-lg space-y-2">
                  <p className="text-sm font-medium">Loan Calculation</p>
                  <p className="text-xs text-gray-600">
                    The oracle provides real-time BTC prices for accurate loan-to-value (LTV) calculations in our lending platform.
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <span>1.0 BTC Collateral:</span>
                    <span className="font-semibold">$109,340</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Max Loan (60% LTV):</span>
                    <span className="font-semibold">$65,604</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}