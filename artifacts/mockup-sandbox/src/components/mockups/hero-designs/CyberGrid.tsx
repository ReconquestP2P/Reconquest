import React, { useEffect, useState } from 'react';
import { ArrowRight, Shield, Zap, BarChart3, Activity } from 'lucide-react';

export function CyberGrid() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#0d1117] text-white font-sans overflow-x-hidden selection:bg-[#00d4ff] selection:text-[#0d1117]">
      {/* Animated Grid Background */}
      <div 
        className="fixed inset-0 z-0 pointer-events-none opacity-[0.15]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #00d4ff 1px, transparent 1px),
            linear-gradient(to bottom, #00d4ff 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)',
        }}
      />
      
      {/* Subtle animated glow behind hero */}
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-[#00d4ff] rounded-full blur-[150px] opacity-10 pointer-events-none animate-pulse" style={{ animationDuration: '4s' }} />

      <div className="relative z-10">
        {/* Ticker Bar */}
        <div className="bg-[#00d4ff]/10 border-b border-[#00d4ff]/20 px-4 py-1.5 flex items-center justify-center text-xs font-mono tracking-wider text-[#00d4ff]">
          <span className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00d4ff] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00d4ff]"></span>
            </span>
            LIVE: ₿ BTC/EUR €63,247 <span className="text-green-400">▲ +1.2%</span>
          </span>
        </div>

        {/* Navbar */}
        <nav className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#0d1117]/90 backdrop-blur-md border-b border-white/5' : 'bg-transparent'}`}>
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <div className="text-2xl font-mono font-bold tracking-widest text-white">
              RECONQUEST
            </div>
            
            <div className="hidden md:flex items-center gap-8 font-mono text-sm">
              <a href="#" className="relative text-white group">
                MARKETS
                <span className="absolute -bottom-2 left-0 w-full h-[2px] bg-[#00d4ff] shadow-[0_0_8px_#00d4ff]"></span>
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">BORROW</a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">EARN</a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">DOCS</a>
            </div>

            <div className="flex items-center gap-4">
              <button className="hidden md:block px-4 py-2 font-mono text-sm text-[#00d4ff] hover:text-white transition-colors">
                SIGN IN
              </button>
              <button className="px-5 py-2.5 font-mono text-sm font-bold bg-[#00d4ff] text-[#0d1117] hover:bg-white transition-all duration-300 shadow-[0_0_15px_rgba(0,212,255,0.4)] hover:shadow-[0_0_25px_rgba(0,212,255,0.6)]">
                CONNECT WALLET
              </button>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <main className="max-w-7xl mx-auto px-6 pt-24 pb-32">
          <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
            
            {/* Status Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#f7931a]/30 bg-[#f7931a]/10 text-[#f7931a] font-mono text-xs mb-8">
              <Zap size={14} />
              V2 MAINNET IS LIVE
            </div>

            {/* Typography */}
            <h1 className="text-6xl md:text-8xl font-black tracking-tight leading-[1.1] mb-6 flex flex-col items-center uppercase">
              <span className="text-white drop-shadow-md">Bitcoin-Backed</span>
              <span 
                className="text-transparent bg-clip-text"
                style={{ 
                  WebkitTextStroke: '2px #00d4ff',
                  textShadow: '0 0 20px rgba(0, 212, 255, 0.3)'
                }}
              >
                Lending
              </span>
              <span className="text-white drop-shadow-md">Marketplace</span>
            </h1>

            <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mb-12 leading-relaxed">
              Lock your BTC as collateral to receive EUR loans instantly. 
              No intermediaries, fixed returns for lenders, deep DeFi liquidity.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center gap-6 mb-16">
              <button className="w-full sm:w-auto px-8 py-4 bg-[#00d4ff] text-[#0d1117] font-mono font-bold text-lg flex items-center justify-center gap-3 transition-all duration-300 shadow-[0_0_20px_rgba(0,212,255,0.3)] hover:shadow-[0_0_40px_rgba(0,212,255,0.5)] hover:bg-white hover:scale-105">
                START BORROWING <ArrowRight size={20} />
              </button>
              <button className="w-full sm:w-auto px-8 py-4 border border-[#00d4ff]/50 text-[#00d4ff] font-mono font-bold text-lg flex items-center justify-center gap-3 transition-all duration-300 hover:bg-[#00d4ff]/10 hover:border-[#00d4ff] hover:shadow-[0_0_20px_rgba(0,212,255,0.2)]">
                EARN YIELD
              </button>
            </div>

            {/* Live Stats Ticker */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 py-6 px-10 border-y border-white/10 bg-white/[0.02] backdrop-blur-sm w-full max-w-3xl rounded-2xl border border-white/5">
              <div className="flex flex-col items-center gap-1">
                <span className="text-gray-500 font-mono text-sm uppercase">Total Value Locked</span>
                <div className="flex items-center gap-2">
                  <Activity size={16} className="text-[#00d4ff]" />
                  <span className="text-2xl font-bold text-white tracking-wide">€42.8M</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-1 sm:border-x sm:border-white/10 px-4">
                <span className="text-gray-500 font-mono text-sm uppercase">Active Borrowers</span>
                <span className="text-2xl font-bold text-white tracking-wide">1,248</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-gray-500 font-mono text-sm uppercase">Avg. Fixed Yield</span>
                <div className="flex items-center gap-2">
                  <span className="text-[#f7931a] drop-shadow-[0_0_8px_rgba(247,147,26,0.5)] text-2xl font-bold tracking-wide">8.4%</span>
                </div>
              </div>
            </div>

          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-32 relative z-10">
            {[
              {
                icon: <Shield className="w-8 h-8 text-[#00d4ff]" />,
                title: "Non-Custodial Escrow",
                desc: "Your Bitcoin is locked in a 2-of-3 multisig. No single party can access your funds without consensus."
              },
              {
                icon: <Zap className="w-8 h-8 text-[#00d4ff]" />,
                title: "Instant Liquidity",
                desc: "Get EUR loans settled directly to your bank account within minutes of the on-chain confirmation."
              },
              {
                icon: <BarChart3 className="w-8 h-8 text-[#f7931a]" />,
                title: "Predictable Returns",
                desc: "Lenders earn fixed interest rates backed by overcollateralized Bitcoin. No variable APY surprises."
              }
            ].map((feature, i) => (
              <div 
                key={i} 
                className="group relative p-8 bg-[#0d1117] border border-white/10 overflow-hidden transition-all duration-300 hover:border-[#00d4ff]/50 hover:-translate-y-1"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[#00d4ff]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                {/* Top highlight line */}
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00d4ff] to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-500" />

                <div className="relative z-10">
                  <div className="w-14 h-14 bg-[#00d4ff]/10 rounded-lg flex items-center justify-center mb-6 border border-[#00d4ff]/20 group-hover:border-[#00d4ff]/50 transition-colors">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-white">{feature.title}</h3>
                  <p className="text-gray-400 leading-relaxed text-sm">
                    {feature.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

        </main>
      </div>
    </div>
  );
}
