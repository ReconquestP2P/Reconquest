import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Shield } from "lucide-react";
import { formatCurrency, formatBTC, formatPercentage, formatDate } from "@/lib/utils";
import type { Loan } from "@shared/schema";

interface LoanCardProps {
  loan: Loan;
  onFund?: (loanId: number) => void;
  showFundButton?: boolean;
}

export default function LoanCard({ loan, onFund, showFundButton = true }: LoanCardProps) {

  return (
    <Card className="border-gray-200 hover:border-primary transition-colors cursor-pointer">
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h4 className="font-semibold text-gray-900">
              {formatCurrency(loan.amount, loan.currency)} Loan Request
            </h4>
            <p className="text-sm text-gray-600">{loan.purpose || "Loan request"}</p>
          </div>
          <div className="text-right">
            <span className="text-lg font-bold text-primary">
              {formatPercentage(loan.interestRate)} APY
            </span>
            <p className="text-sm text-gray-500">{loan.termMonths} months</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-500">Collateral</p>
            <p className="font-semibold">{formatBTC(loan.collateralBtc)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">LTV Ratio</p>
            <p className="font-semibold text-green-600">
              {formatPercentage(loan.ltvRatio)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Due Date</p>
            <p className="font-semibold flex items-center">
              <Calendar className="h-3 w-3 mr-1" />
              {loan.dueDate ? formatDate(loan.dueDate) : "TBD"}
            </p>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex space-x-2">
            <Badge
              variant="default"
              className="bg-green-100 text-green-800"
            >
              <Shield className="h-3 w-3 mr-1" />
              Verified Borrower
            </Badge>
            <Badge variant="outline" className="capitalize">
              {loan.status === "pending" ? "Pending" : 
               loan.status === "posted" ? "Available" :
               loan.status === "initiated" ? "Funded" :
               loan.status === "funding" ? "Funding" :
               loan.status === "escrow_pending" ? "Escrow Pending" :
               loan.status === "active" ? "Active" : loan.status}
            </Badge>
          </div>
          {showFundButton && (loan.status === "posted") && (
            <Button
              onClick={() => onFund?.(loan.id)}
              className="bg-secondary hover:bg-secondary/90 text-white"
              size="sm"
            >
              Fund Loan
            </Button>
          )}
          {showFundButton && (loan.status === "escrow_pending" || loan.status === "active") && (
            <Button
              disabled
              className="bg-yellow-600 hover:bg-yellow-700 text-white"
              size="sm"
            >
              Loan Being Funded
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
