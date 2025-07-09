import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function About() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* About Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 mb-6">
            About <span className="text-gradient-gold">Reconquest</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            The movement to reclaim financial independence through Bitcoin
          </p>
        </div>
      </section>

      {/* About Content */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="prose prose-lg text-gray-600 space-y-6 max-w-none">
            <p className="text-xl leading-relaxed">
              Reconquest was born from a simple, undeniable truth: your money is being stolen — slowly, quietly, and systematically.
            </p>
            
            <p className="text-lg leading-relaxed">
              Inflation. Negative real rates. Bailouts. Censorship. The modern financial system has become a machine of quiet repression, eroding the value of your labor and savings.
            </p>
            
            <div className="my-12 p-8 bg-white rounded-lg shadow-sm border-l-4 border-primary">
              <p className="font-semibold text-gray-900 text-2xl mb-4">Bitcoin changed the game.</p>
              <p className="text-lg leading-relaxed">
                It emerged not just as a new form of money, but as a movement — a declaration of independence from the old guard. A system built on transparency, scarcity, and incorruptibility.
              </p>
            </div>
            
            <p className="text-lg leading-relaxed">
              But for all its promise, Bitcoin remains underutilized in the financial system it was meant to disrupt. We believe it's time to fix that.
            </p>
            
            <div className="my-12 p-8 bg-white rounded-lg shadow-sm border-l-4 border-blue-500">
              <p className="font-semibold text-gray-900 text-2xl mb-4">
                Reconquest exists to reclaim what's been taken — to put the world's hardest money to work.
              </p>
              <p className="text-lg leading-relaxed">
                We're building a free, open marketplace where savers and borrowers meet on equal ground. No banks. No middlemen. No gatekeepers.
              </p>
            </div>
            
            <p className="text-lg leading-relaxed">
              Only BTC-backed lending: pure, transparent, and censorship-resistant.
            </p>
            
            <p className="text-lg leading-relaxed">
              We believe Bitcoin is the highest quality collateral the world has ever known. And we're here to make that belief a reality.
            </p>
            
            <div className="my-12 p-8 bg-white rounded-lg shadow-sm border-l-4 border-green-500">
              <p className="font-semibold text-gray-900 text-2xl text-center">
                The era of passive BTC is over.
              </p>
            </div>
            
            <div className="text-center mt-16">
              <p className="font-bold text-4xl text-gray-900 mb-8">The Reconquest has begun</p>
              
              <div className="flex gap-4 justify-center mt-8">
                <Link href="/borrower">
                  <Button size="lg" className="bg-primary hover:bg-primary/90 text-black px-8 py-4 text-lg font-semibold">
                    Start Borrowing
                  </Button>
                </Link>
                <Link href="/lender">
                  <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/10 px-8 py-4 text-lg font-semibold">
                    Start Lending
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Back to Home */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Link href="/">
            <Button variant="outline" className="text-gray-600 hover:text-gray-900">
              ← Back to Home
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}