import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import logoImage from "@assets/Reconquest logo_1751398567900.png";

export default function About() {
  return (
    <div className="min-h-screen bg-white">
      {/* Logo */}
      <div className="pt-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <img src={logoImage} alt="Reconquest" className="h-48 w-auto mx-auto" />
        </div>
      </div>

      {/* About Content */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="prose prose-lg text-gray-600 space-y-6 max-w-none">
            <p className="text-xl leading-relaxed font-bold">
              We are in the middle of a silent war
            </p>
            
            <p className="text-lg leading-relaxed">
              Through inflation, monetary manipulation, and centralized control, the value of your time — your work — is being stolen. Slowly, quietly, and systematically.
            </p>
            
            <p className="text-xl leading-relaxed font-bold">Bitcoin changed the game.</p>
            <p className="text-lg leading-relaxed">
              It emerged not just as a new form of money, but as a movement — a declaration of independence from the old guard. A system built on transparency, scarcity, and incorruptibility.
            </p>
            
            <p className="text-lg leading-relaxed">
              But for all its promise, Bitcoin remains underutilized in the financial system it was meant to disrupt. It's time to fix that.
            </p>
            
            <p className="text-xl leading-relaxed font-bold">
              Reconquest was born to reclaim what's been taken — to put the world's hardest asset to work.
            </p>
            <p className="text-lg leading-relaxed">
              We're building a free, open marketplace where savers and borrowers meet on equal ground. No banks. No middlemen. No gatekeepers.
            </p>
            
            <p className="text-lg leading-relaxed">
              Only BTC-backed lending: pure, transparent, and censorship-resistant.
            </p>
            
            <p className="text-lg leading-relaxed">
              We believe Bitcoin is the highest quality collateral the world has ever known. And we're here to proove it.
            </p>
            
            <div className="text-center mt-16">
              <p className="font-bold text-4xl text-gray-900 mb-8">Join the Reconquest</p>
              
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
      <section className="py-16">
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