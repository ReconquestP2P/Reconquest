import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import logoImage from "@assets/Reconquest logo 2_1752025456549.png";
import BitcoinPriceOracle from "@/components/bitcoin-price-oracle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/useAuth";

export default function Navigation() {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isAuthenticated, user } = useAuth();

  return (
    <nav className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-28">
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2" onClick={() => setMobileMenuOpen(false)}>
              <img src={logoImage} alt="Reconquest" className="h-24 w-auto" />
            </Link>
            <div className="hidden md:flex items-center ml-10 space-x-8">
              {isAuthenticated && (
                <>
                  <Link
                    href="/borrower"
                    className={`px-3 py-2 text-sm font-medium transition-colors ${
                      location === "/borrower"
                        ? "text-primary"
                        : "text-gray-700 dark:text-gray-300 hover:text-primary"
                    }`}
                  >
                    Borrow
                  </Link>
                  <Link
                    href="/lender"
                    className={`px-3 py-2 text-sm font-medium transition-colors ${
                      location === "/lender"
                        ? "text-primary"
                        : "text-gray-700 dark:text-gray-300 hover:text-primary"
                    }`}
                  >
                    Lend
                  </Link>
                </>
              )}


              <a
                href="/#how-it-works"
                className="text-gray-700 dark:text-gray-300 hover:text-primary px-3 py-2 text-sm font-medium"
              >
                How it Works
              </a>
              <Link
                href="/about"
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  location === "/about"
                    ? "text-primary"
                    : "text-gray-700 dark:text-gray-300 hover:text-primary"
                }`}
              >
                About
              </Link>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center space-x-4">
              <BitcoinPriceOracle variant="compact" />
            </div>
            <div className="hidden md:flex items-center space-x-6">
              <ThemeToggle />
              <Link href="/login">
                <Button 
                  size="sm" 
                  className="bg-gradient-to-r from-blue-400 to-yellow-400 hover:from-blue-500 hover:to-yellow-500 text-white font-medium shadow-md"
                >
                  Log In
                </Button>
              </Link>
              <Link href="/signup">
                <Button 
                  size="sm" 
                  className="bg-gradient-to-r from-black to-yellow-400 hover:from-gray-800 hover:to-yellow-500 text-white font-medium shadow-md"
                >
                  Sign Up
                </Button>
              </Link>
            </div>
            
            {/* Mobile menu button */}
            <div className="md:hidden flex items-center space-x-2">
              <ThemeToggle />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="text-gray-700 dark:text-gray-300"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {isAuthenticated && (
                <>
                  <Link
                    href="/borrower"
                    className={`block px-3 py-2 text-base font-medium transition-colors ${
                      location === "/borrower"
                        ? "text-primary bg-primary/10"
                        : "text-gray-700 dark:text-gray-300 hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Borrow
                  </Link>
                  <Link
                    href="/lender"
                    className={`block px-3 py-2 text-base font-medium transition-colors ${
                      location === "/lender"
                        ? "text-primary bg-primary/10"
                        : "text-gray-700 dark:text-gray-300 hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Lend
                  </Link>
                </>
              )}
              <a
                href="/#how-it-works"
                className="block px-3 py-2 text-base font-medium text-gray-700 dark:text-gray-300 hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => setMobileMenuOpen(false)}
              >
                How it Works
              </a>
              <Link
                href="/about"
                className={`block px-3 py-2 text-base font-medium transition-colors ${
                  location === "/about"
                    ? "text-primary bg-primary/10"
                    : "text-gray-700 dark:text-gray-300 hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                About
              </Link>
              
              {/* Mobile Bitcoin price */}
              <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 mt-2 pt-2">
                <BitcoinPriceOracle variant="compact" />
              </div>
              
              {/* Mobile auth buttons */}
              <div className="px-3 py-4 space-y-6">
                <Link href="/login">
                  <Button 
                    size="sm" 
                    className="w-full bg-gradient-to-r from-blue-400 to-yellow-400 hover:from-blue-500 hover:to-yellow-500 text-white font-medium shadow-md py-3"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Log In
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button 
                    size="sm" 
                    className="w-full bg-gradient-to-r from-black to-yellow-400 hover:from-gray-800 hover:to-yellow-500 text-white font-medium shadow-md py-3"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign Up
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
