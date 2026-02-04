import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import logoImage from "@assets/Reconquest logo 2_1752025456549.png";
import { useAuth } from "@/hooks/useAuth";

export default function About() {
  const { isAuthenticated } = useAuth();
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Logo */}
      <div className="pt-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <img src={logoImage} alt="Reconquest" className="h-48 w-auto mx-auto dark:grayscale dark:invert" />
        </div>
      </div>

      {/* About Content */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="prose prose-lg text-gray-600 dark:text-gray-300 space-y-6 max-w-none">
            <p className="text-xl leading-relaxed font-bold dark:text-white">
              We are in the middle of a silent war
            </p>
            
            <p className="text-lg leading-relaxed">
              Through inflation, monetary manipulation, and centralized control, the value of your time — your work — is being stolen. Slowly, quietly, and systematically.
            </p>
            
            <p className="text-xl leading-relaxed font-bold dark:text-white mb-2">Bitcoin changed the game.</p>
            <p className="text-lg leading-relaxed">
              It emerged not just as a new form of money, but as a movement — a declaration of independence from the old guard. A system built on transparency, scarcity, and incorruptibility.
            </p>
            
            <p className="text-lg leading-relaxed">
              But for all its promise, Bitcoin remains underutilized in the financial system it was meant to disrupt. It's time to fix that.
            </p>
            
            <p className="text-xl leading-relaxed font-bold mb-2">
              Reconquest was born to reclaim what's been taken from us.
            </p>
            <p className="text-lg leading-relaxed">
              It's time to put the world's hardest asset to work. We're building an open, transparent marketplace where savers and borrowers meet on equal ground — no middlemen, no gatekeepers, no censorship. Just like Bitcoin is meant to be.
            </p>
            
            <p className="text-xl leading-relaxed font-bold mb-2">
              We believe Bitcoin is the highest quality collateral the world has ever known.
            </p>
            
            <p className="text-lg leading-relaxed">
              And we're here to prove it.
            </p>
            
            <div className="text-center mt-16">
              <p className="font-bold text-4xl text-gray-900 dark:text-white mb-8">Join the Reconquest</p>
              
              <div className="flex gap-4 justify-center mt-8">
                <Link href={isAuthenticated ? "/borrower" : "/login"}>
                  <Button size="lg" className="bg-primary hover:bg-primary/90 text-black px-8 py-4 text-lg font-semibold">
                    Start Borrowing
                  </Button>
                </Link>
                <Link href={isAuthenticated ? "/lender" : "/login"}>
                  <Button size="lg" variant="outline" className="bg-gray-900 border-2 border-primary text-primary hover:bg-gray-800 hover:border-primary hover:text-primary px-8 py-4 text-lg font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 ease-in-out">
                    Start Lending
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>


    </div>
  );
}