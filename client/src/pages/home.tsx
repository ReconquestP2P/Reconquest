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
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold text-sm mr-4 mt-1 flex-shrink-0">
                    1
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Set your Loan Terms</h4>
                    <p className="text-gray-600">Set your preferred interest rate and loan terms</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold text-sm mr-4 mt-1 flex-shrink-0">
                    2
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Get Matched with Lenders</h4>
                    <p className="text-gray-600">Wait for a lender to accept your terms</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold text-sm mr-4 mt-1 flex-shrink-0">
                    3
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Deposit Bitcoin Collateral</h4>
                    <p className="text-gray-600">Lock your Bitcoin in a secure 2-of-3 multisig escrow</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold text-sm mr-4 mt-1 flex-shrink-0">
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
                <span className="text-blue-600 mr-3 text-2xl">💸</span>
                For Lenders
              </h3>
              <div className="space-y-4">
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm mr-4 mt-1 flex-shrink-0">
                    1
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Browse Loan Requests</h4>
                    <p className="text-gray-600">View vetted loans with Bitcoin collateral backing</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm mr-4 mt-1 flex-shrink-0">
                    2
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Select a Loan Request</h4>
                    <p className="text-gray-600">Confirm your interest in a specific Loan and wait for confirmation of Lock of Collateral</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm mr-4 mt-1 flex-shrink-0">
                    3
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Send Funds to Borrower</h4>
                    <p className="text-gray-600">Send agreed amount to Borrower</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm mr-4 mt-1 flex-shrink-0">
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

      {/* FAQs Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
            <p className="text-lg text-gray-600">Everything you need to know about Bitcoin-backed lending</p>
          </div>
          
          <div className="space-y-4">
            {/* General Section */}
            <details className="bg-white rounded-lg shadow-sm overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-gray-50 transition-colors">
                <h3 className="text-xl font-bold text-gray-900">General</h3>
                <svg className="w-5 h-5 text-gray-600 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-6 pb-6 space-y-4">
                <div className="border-l-4 border-blue-500 pl-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Why Reconquest?</h4>
                  <p className="text-gray-600">At Reconquest, members are in control. Unlike centralized lenders that have recently collapsed, Reconquest does not have access to Bitcoin collateral - it is never touched, traded or exchanged. Instead, it is securely locked in a smart contract built on top of the Bitcoin network, making the process secure for both Borrowers and Investors. You don't have to worry about Reconquest's solvency or reputation - we only provide the technology for secure interaction between Borrower and Investor, and we never have access to members' funds or collateral.</p>
                </div>
                
                <div className="border-l-4 border-blue-500 pl-4">
                  <h4 className="font-semibold text-gray-900 mb-2">What is Bitcoin-backed lending?</h4>
                  <p className="text-gray-600">Bitcoin-backed lending allows you to use your Bitcoin as collateral to secure loans in stablecoins or fiat currencies, without selling your Bitcoin. Lenders can earn a Fixed Yield by funding these collateralized loans.</p>
                </div>
                
                <div className="border-l-4 border-blue-500 pl-4">
                  <h4 className="font-semibold text-gray-900 mb-2">What currencies can I borrow?</h4>
                  <p className="text-gray-600">Reconquest supports loans in USDC and EUR. You can request loans in either currency using your Bitcoin as collateral.</p>
                </div>
                
                <div className="border-l-4 border-blue-500 pl-4">
                  <h4 className="font-semibold text-gray-900 mb-2">What are the loan terms available?</h4>
                  <p className="text-gray-600">Loan terms range from 3 to 18 months, with options for 3, 6, 9, 12, and 18-month durations. Interest rates are competitive and set through market dynamics.</p>
                </div>
              </div>
            </details>
            
            {/* Safety Section */}
            <details className="bg-white rounded-lg shadow-sm overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-gray-50 transition-colors">
                <h3 className="text-xl font-bold text-gray-900">Safety</h3>
                <svg className="w-5 h-5 text-gray-600 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-6 pb-6 space-y-4">
                <div className="border-l-4 border-green-500 pl-4">
                  <h4 className="font-semibold text-gray-900 mb-2">How secure is Reconquest?</h4>
                  <p className="text-gray-600">Reconquest uses 2-of-3 multisig escrow to secure Bitcoin collateral. Your Bitcoin is held in smart contracts that require multiple signatures for any transactions, ensuring maximum security.</p>
                </div>
                
                <div className="border-l-4 border-green-500 pl-4">
                  <h4 className="font-semibold text-gray-900 mb-2">What happens to my BTC if Reconquest disappears?</h4>
                  <p className="text-gray-600">In a highly unlikely scenario of a complete meltdown of Reconquest infrastructure you have at your disposal a text file with a 'Recovery transaction' which gives you (the Borrower) the ability retrieve your Bitcoin from the escrow. In such a scenario, you can use the 'Broadcast transaction' feature on a standard blockchain explorer like Mempool.space, one month after the loan matures, to unlock and send your Bitcoin back to your return address. You can download this transaction during the escrow setup process, or directly from the loan card on the platform.</p>
                </div>
                
                <div className="border-l-4 border-green-500 pl-4">
                  <h4 className="font-semibold text-gray-900 mb-2">What happens if Bitcoin's price drops?</h4>
                  <p className="text-gray-600">Reconquest monitors constantly all LTV's (loan-to-value ratio) to ensure a max of 95% LTV is reached. If Bitcoin's price drops significantly, borrowers will be requested to add more collateral or they will get liquidated to ensure Lenders ALWAYS receive back their principal+interests.</p>
                </div>
                
                <div className="border-l-4 border-green-500 pl-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Who is the Liquidator?</h4>
                  <div className="text-gray-600">
                    <p className="mb-3">There are two modes for the liquidation:</p>
                    <ul className="space-y-2">
                      <li className="flex items-start">
                        <span className="font-semibold mr-2">•</span>
                        <div>
                          <span className="font-semibold">Self-Liquidation</span> - Investors act as their own liquidators and receive Bitcoin collateral to their designated liquidation address.
                        </div>
                      </li>
                      <li className="flex items-start">
                        <span className="font-semibold mr-2">•</span>
                        <div>
                          <span className="font-semibold">Reconquest Liquidation</span> - Reconquest manages the collateral liquidation process, and investors receive their investment back in bank currency. This mode allows Investors not to worry about handling cryptographic material, such as private keys or about interacting with exchanges.
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </details>
            
            {/* Receiving & Repaying Loans Section */}
            <details className="bg-white rounded-lg shadow-sm overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-gray-50 transition-colors">
                <h3 className="text-xl font-bold text-gray-900">Receiving & Repaying Loans</h3>
                <svg className="w-5 h-5 text-gray-600 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-6 pb-6 space-y-4">
                <div className="border-l-4 border-orange-500 pl-4">
                  <h4 className="font-semibold text-gray-900 mb-2">When will I receive funds from the Investor?</h4>
                  <div className="text-gray-600 space-y-3">
                    <p>The time it takes for you to receive your funds depends on when the investor made the bank transfer and the speed of transaction processing. Typically, you should receive your funds no later than the loan's start date.</p>
                    <p>For EUR SEPA payments, the transfers usually take from intraday to 1-2 days.</p>
                    <p>SWIFT payments might take a bit longer, possibly a few more days.</p>
                    <p>Stablecoin (USDC) transactions are settled in real-time.</p>
                  </div>
                </div>
                
                <div className="border-l-4 border-orange-500 pl-4">
                  <h4 className="font-semibold text-gray-900 mb-2">What if I never receive funds from the Investor?</h4>
                  <div className="text-gray-600">
                    <p>Reconquest would start a resolution procedure as defined in the Escrow rules. If the resolution process ultimately confirms that you never received the funds, your Bitcoin will be unlocked and returned to you.</p>
                  </div>
                </div>
                
                <div className="border-l-4 border-orange-500 pl-4">
                  <h4 className="font-semibold text-gray-900 mb-2">How should I return the loan?</h4>
                  <div className="text-gray-600 space-y-3">
                    <p>The loan amount and interest (Amount due) should be repaid at the end of the loan period, no later than the maturity date to the banking account or USDC Ethereum address of the Investor.</p>
                    <p>Due to certain complexities, we currently do not recommend partial repayments of the loan.</p>
                  </div>
                </div>
                
                <div className="border-l-4 border-orange-500 pl-4">
                  <h4 className="font-semibold text-gray-900 mb-2">When should I return the loan?</h4>
                  <div className="text-gray-600 space-y-3">
                    <p>Your loan should be repaid to the investor no later than the maturity date. It's advisable to initiate the transfer a few days before the maturity date to ensure timely repayment.</p>
                    <p>For your convenience, you can download a calendar event from the 'Loan actions' menu.</p>
                    <p>You will also receive an automated email notification 14, 7 and 2 days before the maturity, and on the day of the loan maturity.</p>
                  </div>
                </div>
                
                <div className="border-l-4 border-orange-500 pl-4">
                  <h4 className="font-semibold text-gray-900 mb-2">What is the amount I should return to the Investor?</h4>
                  <div className="text-gray-600">
                    <p>You should return the 'Amount due'.</p>
                    <p className="font-semibold">Amount due = Loan amount + Interest for the whole loan period.</p>
                  </div>
                </div>
                
                <div className="border-l-4 border-orange-500 pl-4">
                  <h4 className="font-semibold text-gray-900 mb-2">What if I don't return the full amount due to the Investor?</h4>
                  <div className="text-gray-600">
                    <p>Reconquest would start a resolution procedure as defined in the Escrow rules. Part of your collateral might get liquidated to cover the full amount.</p>
                  </div>
                </div>
                
                <div className="border-l-4 border-orange-500 pl-4">
                  <h4 className="font-semibold text-gray-900 mb-2">What if I don't return the loan?</h4>
                  <div className="text-gray-600">
                    <p>Reconquest would start a resolution procedure as defined in the Escrow rules. If the outcome of the procedure is deemed a 'default', your collateral will be liquidated to cover the outstanding amount.</p>
                  </div>
                </div>
                
                <div className="border-l-4 border-orange-500 pl-4">
                  <h4 className="font-semibold text-gray-900 mb-2">What if I return the loan after the maturity?</h4>
                  <div className="text-gray-600">
                    <p>Reconquest would start a resolution procedure as defined in the Escrow rules. If the outcome of the procedure is deemed a 'default', your collateral will be liquidated to cover the outstanding amount.</p>
                  </div>
                </div>
                
                <div className="border-l-4 border-orange-500 pl-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Can I repay the loan earlier?</h4>
                  <div className="text-gray-600 space-y-3">
                    <p>Yes, you can repay any loan earlier.</p>
                    <p>To do so, please select the 'Early repayment' option in the 'Loan Actions' menu.</p>
                    <p>We will then seek confirmation from the investor that they are ready to confirm the repayment of your loan. Once they agree, you will get notified and the platform will guide you through the repayment process.</p>
                  </div>
                </div>
                
                <div className="border-l-4 border-orange-500 pl-4">
                  <h4 className="font-semibold text-gray-900 mb-2">How much should I pay back when I close my loan earlier?</h4>
                  <div className="text-gray-600">
                    <p>When repaying your loan earlier, you will need to repay the entire amount due for the entire period of the loan.</p>
                  </div>
                </div>
                
                <div className="border-l-4 border-orange-500 pl-4">
                  <h4 className="font-semibold text-gray-900 mb-2">What if the Investor never confirms they received funds back?</h4>
                  <div className="text-gray-600">
                    <p>Reconquest would start a resolution procedure as defined in the Escrow rules. If the resolution procedure results in us receiving only the confirmation of repayment from you (the borrower), we would consider the loan closed, and your collateral would be returned.</p>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-white">
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

      {/* Contact Section */}
      <section className="py-16 bg-gray-900 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Need Help?</h2>
          <p className="text-gray-300 mb-6">
            Have questions about Bitcoin-backed lending or need support with your account?
          </p>
          <div className="flex items-center justify-center space-x-2">
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <a 
              href="mailto:admin.reconquest@protonmail.com" 
              className="text-blue-400 hover:text-blue-300 transition-colors font-medium"
            >
              admin.reconquest@protonmail.com
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}