import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Bitcoin } from "lucide-react";
import logoImage from "@assets/Reconquest logo_1751398567900.png";

export default function Navigation() {
  const [location] = useLocation();

  const { data: btcPrice } = useQuery<{ price: number; timestamp: string; currency: string }>({
    queryKey: ["/api/btc-price"],
    refetchInterval: 30000, // Update every 30 seconds
  });

  return (
    <nav className="bg-white/95 backdrop-blur-sm shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <img src={logoImage} alt="Reconquest" className="h-16 w-auto" />
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
                Borrow
              </Link>
              <Link
                href="/lender"
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  location === "/lender"
                    ? "text-primary"
                    : "text-gray-700 hover:text-primary"
                }`}
              >
                Lend
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
