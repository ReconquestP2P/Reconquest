import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import logoImage from "@assets/Reconquest logo_1751398567900.png";
import BitcoinPriceOracle from "@/components/bitcoin-price-oracle";

export default function Navigation() {
  const [location] = useLocation();

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
              <a
                href="#about"
                className="text-gray-700 hover:text-primary px-3 py-2 text-sm font-medium"
              >
                About
              </a>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <BitcoinPriceOracle variant="compact" />

          </div>
        </div>
      </div>
    </nav>
  );
}
