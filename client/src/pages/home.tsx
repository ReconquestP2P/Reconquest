import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Shield, Code, Bitcoin, Users, TrendingUp, DollarSign, Percent } from "lucide-react";
import logoImage from "@assets/Reconquest logo_1751398567900.png";

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
          <div className="flex gap-4 justify-center mt-12">
            <Link href="/borrower">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-black px-8 py-4 text-lg font-semibold">
                Get a Bitcoin-Backed Loan
              </Button>
            </Link>
            <Link href="/lender">
              <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/10 px-8 py-4 text-lg font-semibold">
                Lend & Earn Yield
              </Button>
            </Link>
          </div>
          <div className="mt-12 text-sm text-gray-500">
            Trusted by <span className="font-semibold text-primary">10,000+</span> users • 
            <span className="font-semibold text-primary ml-2">1,500+ BTC</span> collateralized
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="py-16 bg-white/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Why Choose Reconquest?</h2>
            <p className="text-lg text-gray-600">The most secure and efficient Bitcoin-backed lending platform</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="p-6 bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="text-center p-0">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Non-Custodial Security</h3>
                <p className="text-gray-600">Your Bitcoin remains in secure escrow. We never hold your keys.</p>
              </CardContent>
            </Card>
            
            <Card className="p-6 bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="text-center p-0">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Competitive Rates</h3>
                <p className="text-gray-600">Borrowers get low rates, lenders earn attractive yields.</p>
              </CardContent>
            </Card>
            
            <Card className="p-6 bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="text-center p-0">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Code className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Smart Contracts</h3>
                <p className="text-gray-600">Automated, transparent lending with programmable escrow.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">How Reconquest Works</h2>
            <p className="text-lg text-gray-600">Simple, secure Bitcoin-backed lending in 4 steps</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* For Borrowers */}
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
                <Bitcoin className="h-8 w-8 text-primary mr-3" />
                For Borrowers
              </h3>
              <div className="space-y-4">
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold text-sm mr-4 mt-1">
                    1
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Set your Loan Terms</h4>
                    <p className="text-gray-600">Set your preferred interest rate and loan terms</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold text-sm mr-4 mt-1">
                    2
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Get Matched with Lenders</h4>
                    <p className="text-gray-600">Wait for a lender to accept your terms</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold text-sm mr-4 mt-1">
                    3
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Deposit Bitcoin Collateral</h4>
                    <p className="text-gray-600">Lock your Bitcoin in a secure 2-of-3 multisig escrow</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold text-sm mr-4 mt-1">
                    4
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Receive Funds</h4>
                    <p className="text-gray-600">Receive your agreed amount to be repaid at maturity</p>
                  </div>
                </div>
              </div>
            </div>

            {/* For Lenders */}
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
                <DollarSign className="h-8 w-8 text-blue-600 mr-3" />
                For Lenders
              </h3>
              <div className="space-y-4">
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm mr-4 mt-1">
                    1
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Browse Loan Requests</h4>
                    <p className="text-gray-600">View vetted loans with Bitcoin collateral backing</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm mr-4 mt-1">
                    2
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Select a Loan Request</h4>
                    <p className="text-gray-600">Confirm your interest in a specific Loan and wait for confirmation of Lock of Collateral</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm mr-4 mt-1">
                    3
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Send Funds to Borrower</h4>
                    <p className="text-gray-600">Send agreed amount to Borrower</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm mr-4 mt-1">
                    4
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Earn Yield Automatically</h4>
                    <p className="text-gray-600">Receive back from the borrower principal+interest at maturity</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-primary mb-2">$50M+</div>
              <div className="text-gray-600">Total Volume</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary mb-2">1,500+</div>
              <div className="text-gray-600">BTC Collateralized</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary mb-2">99.9%</div>
              <div className="text-gray-600">Uptime</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary mb-2">10,000+</div>
              <div className="text-gray-600">Active Users</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-primary/10 to-blue-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Ready to Get Started?</h2>
          <p className="text-xl text-gray-600 mb-8">Join thousands of users leveraging Bitcoin for financial freedom</p>
          <div className="flex gap-4 justify-center">
            <Link href="/borrower">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-black px-8 py-4 text-lg font-semibold">
                Get a Loan
              </Button>
            </Link>
            <Link href="/lender">
              <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/10 px-8 py-4 text-lg font-semibold">
                Start Lending
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}