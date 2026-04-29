import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import logoDark from "@assets/reconquest_logo_v10.png";
import { useAuth } from "@/hooks/useAuth";

export default function About() {
  const { isAuthenticated } = useAuth();
  return (
    <div className="min-h-screen bg-black">
      {/* Logo */}
      <div className="pt-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <img src={logoDark} alt="Reconquest" className="h-40 w-auto mx-auto" />
        </div>
      </div>

      {/* About Content */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-6 max-w-none text-neutral-400">
            <p className="text-xl leading-relaxed font-bold text-white">
              We are in the middle of a silent war
            </p>

            <p className="text-lg leading-relaxed">
              Through inflation, monetary manipulation, and centralized control, the value of your time — your work — is being stolen. Slowly, quietly, and systematically.
            </p>

            <p className="text-xl leading-relaxed font-bold text-white">Bitcoin changed the game.</p>
            <p className="text-lg leading-relaxed">
              It emerged not just as a new form of money, but as a movement — a declaration of independence from the old guard. A system built on transparency, scarcity, and incorruptibility.
            </p>

            <p className="text-lg leading-relaxed">
              But for all its promise, Bitcoin remains underutilized in the financial system it was meant to disrupt. It's time to fix that.
            </p>

            <p className="text-xl leading-relaxed font-bold text-white">
              Reconquest was born to reclaim what's been taken from us.
            </p>
            <p className="text-lg leading-relaxed">
              It's time to put the world's hardest asset to work. We're building an open, transparent marketplace where savers and borrowers meet on equal ground — no middlemen, no gatekeepers, no censorship. Just like Bitcoin is meant to be.
            </p>

            <p className="text-xl leading-relaxed font-bold text-white">
              We believe Bitcoin is the highest quality collateral the world has ever known.
            </p>

            <p className="text-lg leading-relaxed">
              And we're here to prove it.
            </p>

            <div className="text-center mt-16">
              <p className="font-bold text-4xl text-white mb-8">Join the Reconquest</p>

              <div className="flex gap-4 justify-center mt-8">
                <Link href={isAuthenticated ? "/borrower" : "/login"}>
                  <Button
                    size="lg"
                    className="bg-[#f97316] hover:bg-[#ea580c] text-white rounded-full h-12 text-base font-medium border-0 w-44"
                  >
                    Start Borrowing
                  </Button>
                </Link>
                <Link href={isAuthenticated ? "/lender" : "/login"}>
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-full h-12 text-base font-medium border-neutral-600 text-white hover:bg-neutral-900 hover:border-neutral-400 w-44 bg-transparent"
                  >
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
