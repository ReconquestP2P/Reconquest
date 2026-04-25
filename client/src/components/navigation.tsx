import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X, User } from "lucide-react";
import logoDark from "@assets/reconquest_logo_v10.png";
import BitcoinPriceOracle from "@/components/bitcoin-price-oracle";
import { useAuth } from "@/hooks/useAuth";

export default function Navigation() {
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();

  const scrollToHowItWorks = () => {
    setMobileMenuOpen(false);
    if (location === "/") {
      document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
    } else {
      setLocation("/");
      setTimeout(() => {
        document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
      }, 120);
    }
  };

  const navLinkClass = (path: string) =>
    `text-sm font-medium transition-colors ${
      location === path ? "text-white" : "text-neutral-400 hover:text-white"
    }`;

  return (
    <nav className="bg-black border-b border-neutral-900 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link href="/" onClick={() => setMobileMenuOpen(false)}>
            <img src={logoDark} alt="Reconquest" className="h-14 w-auto" />
          </Link>

          {/* Desktop centre links */}
          <div className="hidden md:flex items-center gap-8">
            {isAuthenticated && (
              <>
                <Link href="/borrower" className={navLinkClass("/borrower")}>Borrow</Link>
                <Link href="/lender" className={navLinkClass("/lender")}>Lend</Link>
              </>
            )}
            <button onClick={scrollToHowItWorks} className="text-sm font-medium text-neutral-400 hover:text-white transition-colors">
              How it Works
            </button>
            <Link href="/about" className={navLinkClass("/about")}>About</Link>
          </div>

          {/* Desktop right side */}
          <div className="hidden md:flex items-center gap-6">
            <BitcoinPriceOracle variant="compact" />
            {isAuthenticated ? (
              <>
                <Link href="/my-account">
                  <Button variant="ghost" size="sm" className="text-neutral-400 hover:text-white hover:bg-neutral-900 gap-2" data-testid="link-my-account">
                    <User className="h-4 w-4" /> My Account
                  </Button>
                </Link>
                <Button onClick={logout} variant="ghost" size="sm" className="text-red-500 hover:text-red-400 hover:bg-neutral-900">
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Link href="/login">
                  <button className="text-sm font-medium text-neutral-400 hover:text-white transition-colors">
                    Log in
                  </button>
                </Link>
                <Link href="/signup">
                  <Button className="bg-[#f97316] hover:bg-[#ea580c] text-white rounded-full font-medium px-6 border-0">
                    Sign Up
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-neutral-400 hover:text-white transition-colors"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-neutral-900 bg-black">
          <div className="px-6 py-4 space-y-1">
            {isAuthenticated && (
              <>
                <Link href="/borrower" className="block py-3 text-sm font-medium text-neutral-400 hover:text-white" onClick={() => setMobileMenuOpen(false)}>Borrow</Link>
                <Link href="/lender" className="block py-3 text-sm font-medium text-neutral-400 hover:text-white" onClick={() => setMobileMenuOpen(false)}>Lend</Link>
              </>
            )}
            <button onClick={scrollToHowItWorks} className="block w-full text-left py-3 text-sm font-medium text-neutral-400 hover:text-white">
              How it Works
            </button>
            <Link href="/about" className="block py-3 text-sm font-medium text-neutral-400 hover:text-white" onClick={() => setMobileMenuOpen(false)}>About</Link>

            <div className="pt-3 border-t border-neutral-900 mt-2">
              <BitcoinPriceOracle variant="compact" />
            </div>

            <div className="pt-3 flex flex-col gap-3">
              {isAuthenticated ? (
                <>
                  <Link href="/my-account" onClick={() => setMobileMenuOpen(false)} data-testid="mobile-link-my-account">
                    <Button variant="outline" className="w-full border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-900 rounded-none gap-2">
                      <User className="h-4 w-4" /> My Account
                    </Button>
                  </Link>
                  <Button onClick={() => { logout(); setMobileMenuOpen(false); }} variant="ghost" className="w-full text-red-500 hover:text-red-400 hover:bg-neutral-900 rounded-none">
                    Logout
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full border-neutral-700 text-white hover:bg-neutral-900 rounded-none">
                      Log in
                    </Button>
                  </Link>
                  <Link href="/signup" onClick={() => setMobileMenuOpen(false)}>
                    <Button className="w-full bg-[#f97316] hover:bg-[#ea580c] text-white rounded-full font-medium border-0">
                      Sign Up
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
