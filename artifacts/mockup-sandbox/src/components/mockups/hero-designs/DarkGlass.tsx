import React from "react";
import { ArrowRight, ShieldCheck, TrendingUp, Lock, RefreshCcw } from "lucide-react";

export function DarkGlass() {
  return (
    <div className="min-h-screen bg-[#080b12] text-white font-sans selection:bg-sky-500/30 overflow-x-hidden relative">
      {/* Background Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-sky-500/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[20%] -right-[10%] w-[500px] h-[500px] bg-orange-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Navbar */}
      <nav className="relative z-10 border-b border-white/5 bg-[#080b12]/50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚔️</span>
            <span className="text-xl font-bold tracking-tight text-white">Reconquest</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <a href="#" className="hover:text-white transition-colors">Borrow</a>
            <a href="#" className="hover:text-white transition-colors">Lend</a>
            <a href="#" className="hover:text-white transition-colors">Markets</a>
            <a href="#" className="hover:text-white transition-colors">Company</a>
          </div>

          <div className="flex items-center gap-4 text-sm font-medium">
            <button className="text-slate-300 hover:text-white transition-colors px-4 py-2">
              Log In
            </button>
            <button className="bg-white/10 hover:bg-white/20 border border-white/10 transition-all rounded-full px-5 py-2">
              Sign Up
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-32 pb-24 flex flex-col items-center text-center min-h-[80vh] justify-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-400 text-sm font-medium mb-8">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
          </span>
          Live on Mainnet
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight max-w-4xl mb-8 leading-[1.1]">
          The Global Marketplace for <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-orange-400">
            Bitcoin-Backed Loans
          </span>
        </h1>

        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mb-12 leading-relaxed">
          Lock your Bitcoin in secure multi-sig escrow to access EUR liquidity instantly. No credit checks. No selling your stack. Lenders earn fixed, predictable returns.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 mb-20 w-full justify-center">
          <button className="w-full sm:w-auto px-8 py-4 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-semibold text-lg transition-all shadow-[0_0_30px_rgba(249,115,22,0.3)] hover:shadow-[0_0_40px_rgba(249,115,22,0.5)] transform hover:-translate-y-0.5 flex items-center justify-center gap-2">
            Start Borrowing <ArrowRight className="w-5 h-5" />
          </button>
          <button className="w-full sm:w-auto px-8 py-4 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-lg transition-all backdrop-blur-sm flex items-center justify-center gap-2">
            Start Lending
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-4xl border-y border-white/10 py-8">
          <div className="flex flex-col items-center justify-center gap-1">
            <span className="text-3xl font-bold text-white">€2.4M</span>
            <span className="text-sm text-slate-400 font-medium uppercase tracking-wider">Total Loans</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-1 sm:border-x border-white/10">
            <span className="text-3xl font-bold text-white">247</span>
            <span className="text-sm text-slate-400 font-medium uppercase tracking-wider">Active Borrowers</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-1">
            <span className="text-3xl font-bold text-green-400">8.5%</span>
            <span className="text-sm text-slate-400 font-medium uppercase tracking-wider">Avg. Return</span>
          </div>
        </div>
      </main>

      {/* How It Works Teaser */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">How it works</h2>
          <p className="text-slate-400 max-w-2xl mx-auto">A seamless peer-to-peer marketplace secured by native Bitcoin multisig technology.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Card 1 */}
          <div className="relative group rounded-2xl bg-white/[0.02] border border-white/10 p-8 backdrop-blur-xl hover:bg-white/[0.04] transition-all overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-sky-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10 flex flex-col gap-4">
              <div className="w-12 h-12 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400 mb-2">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">1. Deposit BTC</h3>
              <p className="text-slate-400 leading-relaxed text-sm">
                Borrower locks Bitcoin in a 2-of-3 multisig escrow. Keys are held by borrower, lender, and an independent arbiter.
              </p>
            </div>
          </div>

          {/* Card 2 */}
          <div className="relative group rounded-2xl bg-white/[0.02] border border-white/10 p-8 backdrop-blur-xl hover:bg-white/[0.04] transition-all overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10 flex flex-col gap-4">
              <div className="w-12 h-12 rounded-full bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 mb-2">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">2. Fund Loan</h3>
              <p className="text-slate-400 leading-relaxed text-sm">
                Lender provides EUR directly to the borrower's bank account. Smart contracts manage the terms and conditions securely.
              </p>
            </div>
          </div>

          {/* Card 3 */}
          <div className="relative group rounded-2xl bg-white/[0.02] border border-white/10 p-8 backdrop-blur-xl hover:bg-white/[0.04] transition-all overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-green-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10 flex flex-col gap-4">
              <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center text-green-400 mb-2">
                <RefreshCcw className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">3. Repay & Release</h3>
              <p className="text-slate-400 leading-relaxed text-sm">
                Borrower repays principal plus interest. The multisig escrow automatically releases the Bitcoin back to the borrower.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
