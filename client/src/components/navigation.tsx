import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X, User } from "lucide-react";
import logoImage from "@assets/Reconquest logo 2_1752025456549.png";
import BitcoinPriceOracle from "@/components/bitcoin-price-oracle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/useAuth";

export default function Navigation() {
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();

  return (
    <nav className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-28">
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2" onClick={() => setMobileMenuOpen(false)}>
              <img src={logoImage} alt="Reconquest" className="h-24 w-auto dark:grayscale dark:invert" />
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


              <button
                onClick={() => {
                  if (location === '/') {
                    // If already on homepage, just scroll to section
                    const element = document.getElementById('how-it-works');
                    if (element) {
                      element.scrollIntoView({ behavior: 'smooth' });
                    }
                  } else {
                    // If on different page, navigate to homepage first then scroll
                    setLocation('/');
                    setTimeout(() => {
                      const element = document.getElementById('how-it-works');
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth' });
                      }
                    }, 100);
                  }
                }}
                className="text-gray-700 dark:text-gray-300 hover:text-primary px-3 py-2 text-sm font-medium"
              >
                How it Works
              </button>
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
              {isAuthenticated ? (
                <>
                  <Link href="/my-account">
                    <Button 
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                      data-testid="link-my-account"
                    >
                      <User className="h-4 w-4" />
                      My Account
                    </Button>
                  </Link>
                  <Button 
                    onClick={logout}
                    variant="outline"
                    className="bg-red-50 border-red-200 text-red-700 hover:bg-red-100 hover:border-red-300 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30"
                  >
                    Logout
                  </Button>
                </>
              ) : (
                <>
                    <Link href="/login">
                      <Button 
                        size="sm" 
                        className="bg-gradient-to-r from-blue-700 to-yellow-400 hover:from-blue-800 hover:to-yellow-500 text-white font-medium shadow-md"
                      >
                        LOG IN
                      </Button>
                    </Link>
                    <Link href="/signup">
                      <Button 
                        size="sm" 
                        className="bg-gradient-to-r from-black to-yellow-400 hover:from-gray-800 hover:to-yellow-500 text-white font-medium shadow-md"
                      >
                        SIGN UP
                      </Button>
                    </Link>
                  </>
                )
              }
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
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  if (location === '/') {
                    // If already on homepage, just scroll to section
                    const element = document.getElementById('how-it-works');
                    if (element) {
                      element.scrollIntoView({ behavior: 'smooth' });
                    }
                  } else {
                    // If on different page, navigate to homepage first then scroll
                    setLocation('/');
                    setTimeout(() => {
                      const element = document.getElementById('how-it-works');
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth' });
                      }
                    }, 100);
                  }
                }}
                className="block w-full text-left px-3 py-2 text-base font-medium text-gray-700 dark:text-gray-300 hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                How it Works
              </button>
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
              
              
              {/* Mobile Auth Buttons */}
              {isAuthenticated ? (
                <>
                  <Link
                    href="/my-account"
                    className={`block px-3 py-2 text-base font-medium transition-colors ${
                      location === "/my-account"
                        ? "text-primary bg-primary/10"
                        : "text-gray-700 dark:text-gray-300 hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="mobile-link-my-account"
                  >
                    My Account
                  </Link>
                  <button
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                    }}
                    className="block w-full text-left px-3 py-2 text-base font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="block px-3 py-2 text-base font-medium text-gray-700 dark:text-gray-300 hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    LOG IN
                  </Link>
                  <Link
                    href="/signup"
                    className="block px-3 py-2 text-base font-medium text-gray-700 dark:text-gray-300 hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    SIGN UP
                  </Link>
                </>
              )}

              {/* Mobile Bitcoin price */}
              <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 mt-2 pt-2">
                <BitcoinPriceOracle variant="compact" />
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
