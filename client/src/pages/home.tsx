import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Shield, Code, Bitcoin, Users, TrendingUp, DollarSign, Percent } from "lucide-react";
import logoImage from "@assets/Reconquest logo_1751398567900.png";
import SignupForm from "@/components/signup-form";

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 mb-6">
            World's #1 Marketplace for<br />
            <span className="text-gradient-gold">Bitcoin-Backed Loans</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Built for Bitcoiners needing capital and investors who provide it. 
            Secure, non-custodial lending with Bitcoin as collateral.
          </p>
          <div className="flex justify-center mt-12">
            <SignupForm />
          </div>
          <div className="mt-12 text-sm text-gray-500">
            Trusted by <span className="font-semibold text-primary">10,000+</span> users • 
            <span className="font-semibold text-primary ml-2">1,500+ BTC</span> collateralized
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">How Reconquest Works</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Secure, non-custodial Bitcoin-backed lending with transparent processes and automatic protections.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
            {/* For Borrowers */}
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">For Borrowers</h3>
              <div className="space-y-6">
                {[
                  {
                    step: "1",
                    title: "Submit Loan Request",
                    description: "Specify amount, term, and interest rate preference. 2:1 collateral ratio required.",
                  },
                  {
                    step: "2",
                    title: "Lock Bitcoin Collateral",
                    description: "Bitcoin secured in 2-of-3 multisig escrow contract on Bitcoin network.",
                  },
                  {
                    step: "3",
                    title: "Receive Funds",
                    description: "Get loan funds in your preferred currency (USDC, EUR, CHF) within 24 hours.",
                  },
                  {
                    step: "4",
                    title: "Repay & Unlock",
                    description: "Repay loan by maturity date to unlock your Bitcoin collateral automatically.",
                  },
                ].map((item) => (
                  <div key={item.step} className="flex items-start space-x-4">
                    <div className="bg-primary text-black w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                      {item.step}
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">{item.title}</h4>
                      <p className="text-gray-600 text-sm">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* For Lenders */}
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">For Lenders</h3>
              <div className="space-y-6">
                {[
                  {
                    step: "1",
                    title: "Browse Loan Requests",
                    description: "Review available loans with detailed borrower profiles and risk assessments.",
                  },
                  {
                    step: "2",
                    title: "Fund Selected Loans",
                    description: "Invest directly from your bank account with chosen terms and interest rates.",
                  },
                  {
                    step: "3",
                    title: "Monitor Investments",
                    description: "Track loan performance and LTV ratios with automated liquidation protection.",
                  },
                  {
                    step: "4",
                    title: "Earn Fixed Returns",
                    description: "Receive principal plus interest at maturity, secured by Bitcoin collateral.",
                  },
                ].map((item) => (
                  <div key={item.step} className="flex items-start space-x-4">
                    <div className="bg-secondary text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                      {item.step}
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">{item.title}</h4>
                      <p className="text-gray-600 text-sm">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Security Features */}
          <Card className="p-8 shadow-sm">
            <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">
              Secured by Code, Not Custodians
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="bg-orange-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Bitcoin className="text-orange-500 h-8 w-8" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Bitcoin Native</h4>
                <p className="text-gray-600 text-sm">
                  Built on Bitcoin's secure, time-tested network infrastructure with no intermediaries.
                </p>
              </div>
              <div className="text-center">
                <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="text-green-600 h-8 w-8" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Non-Custodial</h4>
                <p className="text-gray-600 text-sm">
                  Your Bitcoin remains in decentralized multisig escrow, never held by any central party.
                </p>
              </div>
              <div className="text-center">
                <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Code className="text-blue-600 h-8 w-8" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Open Protocol</h4>
                <p className="text-gray-600 text-sm">
                  Transparent, auditable smart contracts with pre-signed recovery mechanisms.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Statistics */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Trusted by the Bitcoin Community
            </h2>
            <p className="text-xl text-gray-600">
              Join thousands of Bitcoiners and investors already using our platform
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { icon: Users, value: "10,000+", label: "Active Users" },
              { icon: Bitcoin, value: "1,500+", label: "BTC Collateralized" },
              { icon: DollarSign, value: "€200M+", label: "Value Transacted" },
              { icon: Percent, value: "9.2%", label: "Average Interest Rate" },
            ].map((stat, index) => (
              <div key={index} className="text-center">
                <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <stat.icon className="text-primary h-8 w-8" />
                </div>
                <div className="text-4xl font-bold text-primary mb-2">{stat.value}</div>
                <div className="text-gray-600">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center mb-4">
                <img src={logoImage} alt="Reconquest" className="h-24 w-auto" />
              </div>
              <p className="text-gray-400 text-sm mb-4">
                The open marketplace for Bitcoin-backed loans, connecting Bitcoiners and investors globally.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/borrower" className="hover:text-white">Borrow</Link></li>
                <li><Link href="/lender" className="hover:text-white">Lend</Link></li>
                <li><a href="#how-it-works" className="hover:text-white">How it Works</a></li>
                <li><a href="#" className="hover:text-white">Security</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white">About</a></li>
                <li><a href="#" className="hover:text-white">Blog</a></li>
                <li><a href="#" className="hover:text-white">Careers</a></li>
                <li><a href="#" className="hover:text-white">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white">Documentation</a></li>
                <li><a href="#" className="hover:text-white">API</a></li>
                <li><a href="#" className="hover:text-white">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white">Privacy Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 mt-8 text-center text-sm text-gray-400">
            <p>&copy; 2025 Reconquest. All rights reserved. Non-custodial Bitcoin-backed lending platform.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
