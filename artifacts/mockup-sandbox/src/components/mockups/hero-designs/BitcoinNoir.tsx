import { Button } from "@/components/ui/button";
import { ArrowRight, Lock, Zap } from "lucide-react";

export function BitcoinNoir() {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-[#f97316] selection:text-white font-sans overflow-x-hidden">
      {/* Noise Texture */}
      <div 
        className="pointer-events-none fixed inset-0 z-50 h-full w-full opacity-[0.03]" 
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}
      ></div>

      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-6 md:px-12 max-w-7xl mx-auto">
        <div className="text-xl font-bold tracking-tight">Reconquest</div>
        <div className="hidden md:flex space-x-8 text-sm text-neutral-400 font-medium">
          <a href="#" className="hover:text-white transition-colors">Borrow</a>
          <a href="#" className="hover:text-white transition-colors">Lend</a>
          <a href="#" className="hover:text-white transition-colors">How it works</a>
        </div>
        <div className="flex items-center gap-4">
          <a href="#" className="hidden md:block text-sm font-medium hover:text-neutral-300">Log in</a>
          <Button className="bg-[#f97316] hover:bg-[#ea580c] text-white rounded-none font-medium px-6 border-0">
            Sign Up
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-7xl mx-auto px-6 md:px-12 pt-24 pb-32">
        <div className="max-w-4xl">
          <h1 className="text-6xl md:text-8xl font-bold tracking-tighter leading-[1.05] mb-8">
            <span className="block">Unlock liquidity.</span>
            <span className="block text-[#f97316]">Keep your Bitcoin.</span>
          </h1>
          <p className="text-xl md:text-2xl text-neutral-400 max-w-2xl mb-12 font-light leading-relaxed">
            The luxury P2P lending platform where your Bitcoin works for you. Lock BTC as collateral, receive EUR instantly. No selling required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Button size="lg" className="bg-[#f97316] hover:bg-[#ea580c] text-white rounded-none h-14 px-8 text-lg font-medium group border-0">
              Start Borrowing <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button size="lg" variant="outline" className="border-neutral-700 bg-transparent text-white hover:bg-white hover:text-black rounded-none h-14 px-8 text-lg font-medium transition-colors">
              Explore Lending
            </Button>
          </div>
        </div>
      </main>

      {/* Stats Divider */}
      <div className="border-y border-neutral-900 bg-neutral-950/50">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-12 flex flex-col md:flex-row justify-between gap-8 md:gap-0">
          <div>
            <div className="text-4xl font-bold tracking-tight mb-2">€2.4M</div>
            <div className="text-sm text-neutral-500 uppercase tracking-widest font-medium">Total Lent</div>
          </div>
          <div className="hidden md:block w-px bg-neutral-900"></div>
          <div>
            <div className="text-4xl font-bold tracking-tight mb-2">247</div>
            <div className="text-sm text-neutral-500 uppercase tracking-widest font-medium">Active Borrowers</div>
          </div>
          <div className="hidden md:block w-px bg-neutral-900"></div>
          <div>
            <div className="text-4xl font-bold tracking-tight mb-2">0</div>
            <div className="text-sm text-neutral-500 uppercase tracking-widest font-medium">Security Incidents</div>
          </div>
        </div>
      </div>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-32 space-y-32">
        <div className="flex flex-col md:flex-row items-center gap-16 md:gap-32">
          <div className="flex-1 space-y-6">
            <div className="h-12 w-12 bg-neutral-900 flex items-center justify-center">
              <Lock className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Absolute Control.</h2>
            <p className="text-neutral-400 text-lg leading-relaxed max-w-md">
              Your collateral is locked in a deterministic multi-sig escrow on the Bitcoin blockchain. We never co-mingle funds or rehypothecate your assets. Verifiable on-chain, always.
            </p>
          </div>
          <div className="flex-1 w-full aspect-square bg-neutral-900/30 border border-neutral-800 flex items-center justify-center relative overflow-hidden group">
             {/* Abstract visual */}
             <div className="absolute inset-0 bg-gradient-to-br from-neutral-800/10 to-transparent"></div>
             <div className="w-48 h-48 border border-neutral-700 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-700 ease-out">
                <div className="w-24 h-24 border border-[#f97316]/30 rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-[#f97316] rounded-full shadow-[0_0_15px_#f97316]"></div>
                </div>
             </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row-reverse items-center gap-16 md:gap-32">
          <div className="flex-1 space-y-6">
            <div className="h-12 w-12 bg-neutral-900 flex items-center justify-center">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Instant Liquidity.</h2>
            <p className="text-neutral-400 text-lg leading-relaxed max-w-md">
              Once your transaction confirms, your EUR is deployed instantly. No credit checks, no lengthy approval processes. Pure mathematics and code execution.
            </p>
          </div>
          <div className="flex-1 w-full aspect-square bg-neutral-900/30 border border-neutral-800 flex items-center justify-center relative overflow-hidden group">
             {/* Abstract visual */}
             <div className="absolute inset-0 bg-gradient-to-tr from-neutral-800/10 to-transparent"></div>
             <div className="w-full max-w-[200px] h-48 border-l border-b border-neutral-700 relative group-hover:border-neutral-500 transition-colors duration-700">
               <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#f97316] w-0 group-hover:w-full transition-all duration-1000 ease-out"></div>
               <div className="absolute bottom-[2px] left-4 w-10 h-24 bg-neutral-800 group-hover:bg-neutral-700 transition-colors duration-500 delay-100"></div>
               <div className="absolute bottom-[2px] left-20 w-10 h-36 bg-neutral-800 group-hover:bg-neutral-700 transition-colors duration-500 delay-200"></div>
               <div className="absolute bottom-[2px] left-36 w-10 h-16 bg-neutral-800 group-hover:bg-neutral-700 transition-colors duration-500 delay-300"></div>
             </div>
          </div>
        </div>
      </section>

      {/* Footer Strip */}
      <footer className="border-t border-neutral-900 py-12 mt-12">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-xl font-bold tracking-tight text-neutral-600">Reconquest</div>
          <div className="text-sm text-neutral-600">
            &copy; {new Date().getFullYear()} Reconquest. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
