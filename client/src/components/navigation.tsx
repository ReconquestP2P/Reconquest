import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Fish, Bitcoin } from "lucide-react";

export default function Navigation() {
  const [location] = useLocation();

  const { data: btcPrice } = useQuery<{ price: number; timestamp: string; currency: string }>({
    queryKey: ["/api/btc-price"],
    refetchInterval: 30000, // Update every 30 seconds
  });

  return (
    <nav className="bg-white/95 backdrop-blur-sm shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <Fish className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold text-gray-900">BitConquer</span>
            </Link>
            <div className="hidden md:flex items-center ml-10 space-x-8">
              <Link
                href="/borrower"
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  location === "/borrower"
                    ? "text-primary"
                    : "text-gray-700 hover:text-primary"
                }`}
              >
                For Borrowers
              </Link>
              <Link
                href="/lender"
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  location === "/lender"
                    ? "text-primary"
                    : "text-gray-700 hover:text-primary"
                }`}
              >
                For Lenders
              </Link>
              <a
                href="#how-it-works"
                className="text-gray-700 hover:text-primary px-3 py-2 text-sm font-medium"
              >
                How it Works
              </a>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {btcPrice && (
              <div className="flex items-center space-x-2 text-sm">
                <Bitcoin className="h-4 w-4 text-orange-500" />
                <span className="text-gray-600">BTC Price:</span>
                <span className="font-semibold text-primary">
                  ${btcPrice.price.toLocaleString()}
                </span>
              </div>
            )}
            <Button variant="ghost" size="sm">
              Log In
            </Button>
            <Button size="sm" className="bg-primary hover:bg-primary/90 text-black">
              Sign Up
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
