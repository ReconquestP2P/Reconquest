import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatBTC, calculateCollateral } from "@/lib/utils";

export default function LoanCalculator() {
  const [amount, setAmount] = useState("25000");
  const [currency, setCurrency] = useState("USDC");
  const [term, setTerm] = useState("6");
  const [interestRate, setInterestRate] = useState("8.5");

  const { data: btcPrice } = useQuery({
    queryKey: ["/api/btc-price"],
  });

  const loanAmount = parseFloat(amount) || 0;
  const currentBtcPrice = btcPrice?.price || 67245;
  const requiredCollateral = calculateCollateral(loanAmount, currentBtcPrice);
  const monthlyPayment = loanAmount * (1 + parseFloat(interestRate || "0") / 100 * parseInt(term) / 12) / parseInt(term);

  return (
    <Card className="border-gray-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-900">
          Loan Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="amount" className="text-sm font-medium text-gray-700">
              Loan Amount
            </Label>
            <div className="relative mt-1">
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="25000"
                className="pr-20"
              />
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="absolute right-1 top-1 w-16 h-8 border-0 bg-transparent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USDC">USDC</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="CHF">CHF</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="term" className="text-sm font-medium text-gray-700">
              Loan Term
            </Label>
            <Select value={term} onValueChange={setTerm}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 months</SelectItem>
                <SelectItem value="6">6 months</SelectItem>
                <SelectItem value="12">12 months</SelectItem>
                <SelectItem value="18">18 months</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="interest" className="text-sm font-medium text-gray-700">
              Interest Rate (% p.a.)
            </Label>
            <Input
              id="interest"
              type="number"
              step="0.1"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
              placeholder="8.0"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-sm font-medium text-gray-700">
              Current BTC Price
            </Label>
            <div className="mt-1 p-3 bg-gray-50 rounded-lg">
              <span className="text-lg font-semibold text-gray-900">
                ${currentBtcPrice.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <h4 className="font-semibold text-gray-900 mb-4">Calculation Results</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-orange-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Required Collateral</p>
              <p className="text-lg font-bold text-orange-600">
                {formatBTC(requiredCollateral)}
              </p>
              <p className="text-xs text-gray-500">2:1 collateral ratio</p>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Monthly Payment</p>
              <p className="text-lg font-bold text-blue-600">
                {formatCurrency(monthlyPayment, currency)}
              </p>
              <p className="text-xs text-gray-500">Interest included</p>
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Total Repayment</p>
              <p className="text-lg font-bold text-green-600">
                {formatCurrency(monthlyPayment * parseInt(term), currency)}
              </p>
              <p className="text-xs text-gray-500">Principal + Interest</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
