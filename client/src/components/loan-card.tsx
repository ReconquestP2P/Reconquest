import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Calendar, Shield } from "lucide-react";
import { formatCurrency, formatBTC, formatPercentage, formatDate } from "@/lib/utils";
import type { Loan } from "@shared/schema";

interface LoanCardProps {
  loan: Loan;
  onFund?: (loanId: number) => void;
  showFundButton?: boolean;
}

export default function LoanCard({ loan, onFund, showFundButton = true }: LoanCardProps) {
  const getBorrowerRating = (completedLoans: number) => {
    if (completedLoans >= 5) return 5;
    if (completedLoans >= 3) return 4;
    if (completedLoans >= 1) return 3;
    return 2;
  };

  const rating = getBorrowerRating(3); // Mock completed loans
  const isNewBorrower = rating <= 3;

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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
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
            <p className="text-xs text-gray-500">Borrower Rating</p>
            <div className="flex items-center">
              {Array.from({ length: 5 }, (_, i) => (
                <Star
                  key={i}
                  className={`h-3 w-3 ${
                    i < rating ? "text-yellow-400 fill-current" : "text-gray-300"
                  }`}
                />
              ))}
            </div>
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
              variant={isNewBorrower ? "secondary" : "default"}
              className={
                isNewBorrower
                  ? "bg-yellow-100 text-yellow-800"
                  : "bg-green-100 text-green-800"
              }
            >
              <Shield className="h-3 w-3 mr-1" />
              {isNewBorrower ? "New Borrower" : "Verified Borrower"}
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
          {showFundButton && (loan.status === "pending" || loan.status === "posted" || loan.status === "initiated" || loan.status === "funding") && (
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
