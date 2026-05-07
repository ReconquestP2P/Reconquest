import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Shield, Zap, Lock, TrendingUp, ArrowRight, ChevronDown, FileText, Handshake, Bitcoin, Banknote, Search, Wallet, Send } from "lucide-react";
import bitcoinIcon from "@assets/image_1752547022307.png";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { motion } from "framer-motion";

const noiseStyle = {
  backgroundImage:
    'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")',
};

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.12, ease: "easeOut" },
  }),
};

function FaqItem({
  question,
  children,
}: {
  question: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-neutral-900">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-6 text-left group"
      >
        <span className="text-white font-medium text-lg group-hover:text-[#f97316] transition-colors">
          {question}
        </span>
        <ChevronDown
          className={`h-5 w-5 text-neutral-500 flex-shrink-0 ml-4 transition-transform duration-300 ${
            open ? "rotate-180 text-[#f97316]" : ""
          }`}
        />
      </button>
      {open && (
        <div className="pb-6 text-neutral-400 leading-relaxed space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {/* Noise texture */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.025]"
        style={noiseStyle}
      />

      {/* ── HERO ──────────────────────────────────────────── */}
      <section className="relative max-w-7xl mx-auto px-6 md:px-12 pt-28 pb-36 text-center">
        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={0}
          className="inline-flex items-center gap-2 text-xs tracking-[0.2em] text-neutral-200 mb-6 font-medium uppercase border border-neutral-700 px-4 py-1.5"
        >
          The Future of Lending Is Bitcoin-Backed
        </motion.p>

        <motion.h1
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={1}
          className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tighter leading-[1.04] mb-8"
        >
          <span className="block text-white">The Global Marketplace for</span>
          <span className="flex items-center justify-center gap-0.5 text-[#f97316]">
            <img src={bitcoinIcon} alt="Bitcoin" className="w-[0.85em] h-[0.85em] rounded-full object-cover floating" />
            <span>itcoin-Backed Loans</span>
          </span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={2}
          className="flex flex-col items-center gap-3 mb-12"
        >
          <span className="text-xl md:text-2xl text-white font-bold tracking-tight">
            For Bitcoiners who need liquidity. Borrow without selling.
          </span>
          <span className="text-xl md:text-2xl text-white font-bold tracking-tight">
            For Investors who demand safe, fixed returns. Lend protected by real collateral.
          </span>
        </motion.p>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={3}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Link href={isAuthenticated ? "/borrower" : "/login"}>
            <Button
              size="lg"
              className="bg-[#f97316] hover:bg-[#ea580c] text-white rounded-full h-12 text-base font-medium border-0 w-full sm:w-44"
            >
              Start Borrowing
            </Button>
          </Link>
          <Link href={isAuthenticated ? "/lender" : "/login"}>
            <Button
              size="lg"
              variant="outline"
              className="border-neutral-700 bg-transparent text-white hover:bg-white hover:text-black rounded-full h-12 text-base font-medium transition-colors w-full sm:w-44"
            >
              Start Lending
            </Button>
          </Link>
        </motion.div>
      </section>

      {/* ── TRUST BAR ─────────────────────────────────────── */}
      <div className="border-y border-neutral-900 bg-neutral-950/60">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-10 grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div>
            <div className="text-2xl font-bold tracking-tight mb-1">
              3-of-3 Multisig
            </div>
            <div className="text-sm text-neutral-500 leading-snug">
              Collateral secured by three independent keys — borrower, lender,
              and platform. No single party can move funds alone.
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight mb-1">
              Non-Custodial
            </div>
            <div className="text-sm text-neutral-500 leading-snug">
              We never hold your keys. Your BTC cannot be re-hypothecated.
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight mb-1">
              Recovery Transaction
            </div>
            <div className="text-sm text-neutral-500 leading-snug">
              A pre-signed time-locked transaction lets you reclaim collateral
              even if Reconquest disappears.
            </div>
          </div>
        </div>
      </div>

      {/* ── VIDEO ─────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 md:px-12 py-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="border border-neutral-800 overflow-hidden"
        >
          <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src="https://www.youtube.com/embed/6XizFXdNDUs"
              title="Welcome to Reconquest"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </motion.div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────── */}
      <section
        id="how-it-works"
        className="max-w-7xl mx-auto px-6 md:px-12 py-24"
      >
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500 mb-3">
            Process
          </p>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
            How it works
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-16 md:gap-24">
          {/* Borrowers */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h3 className="text-sm font-semibold mb-8 text-[#f97316] uppercase tracking-widest">
              For Borrowers
            </h3>
            <div className="relative">
              {/* Connector line */}
              <div className="absolute left-5 top-10 bottom-10 w-px border-l-2 border-dashed border-neutral-800 z-0" />
              <div className="space-y-4 relative z-10">
                {[
                  { n: "01", title: "Post a loan request", desc: "Set the amount in EUR, loan duration, and interest rate.", Icon: FileText },
                  { n: "02", title: "A lender accepts", desc: "A lender on the marketplace accepts your request. A 3-of-3 multisignature escrow address is then generated for the loan.", Icon: Handshake },
                  { n: "03", title: "Deposit BTC collateral", desc: "Send the required Bitcoin to the 3-of-3 multisignature address. Reconquest monitors the blockchain for confirmation of deposit and makes sure the required LTV is met.", Icon: Bitcoin },
                  { n: "04", title: "Receive EUR", desc: "Reconquest informs the lender once collateral has been properly deposited, so the lender can send EUR directly to your bank account.", Icon: Banknote },
                ].map((s) => (
                  <div key={s.n} className="flex gap-4 p-4 rounded-lg border border-neutral-800 bg-neutral-950 hover:border-neutral-600 hover:shadow-[0_0_16px_rgba(249,115,22,0.08)] transition-all duration-200">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full border-2 border-[#f97316] flex items-center justify-center">
                      <span className="text-xs font-bold text-[#f97316] tabular-nums">{s.n}</span>
                    </div>
                    <div className="pt-0.5">
                      <h4 className="font-semibold text-white mb-1 flex items-center gap-2">
                        {s.title}
                        <s.Icon className="h-3.5 w-3.5 text-[#f97316] flex-shrink-0" />
                      </h4>
                      <p className="text-neutral-500 text-sm leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Lenders */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <h3 className="text-sm font-semibold mb-8 text-white uppercase tracking-widest">
              For Lenders
            </h3>
            <div className="relative">
              {/* Connector line */}
              <div className="absolute left-5 top-10 bottom-10 w-px border-l-2 border-dashed border-neutral-800 z-0" />
              <div className="space-y-4 relative z-10">
                {[
                  { n: "01", title: "Browse loan requests", desc: "View open borrower requests, each showing the loan amount, term, and interest rate.", Icon: Search },
                  { n: "02", title: "Fund a loan", desc: "Select a loan and confirm. Reconquest handles the Bitcoin escrow setup on your behalf — no crypto knowledge needed.", Icon: Wallet },
                  { n: "03", title: "Send EUR to the borrower", desc: "Reconquest will inform you once collateral has been properly deposited on the 3-of-3 multisignature address. Transfer the agreed EUR amount to the borrower's bank account via SEPA.", Icon: Send },
                  { n: "04", title: "Receive principal + interest", desc: "At maturity, the borrower repays you. Confirmed repayment by the borrower automatically releases the Bitcoin deposit back to them.", Icon: TrendingUp },
                ].map((s) => (
                  <div key={s.n} className="flex gap-4 p-4 rounded-lg border border-neutral-800 bg-neutral-950 hover:border-neutral-600 hover:shadow-[0_0_16px_rgba(249,115,22,0.08)] transition-all duration-200">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full border-2 border-[#f97316] flex items-center justify-center">
                      <span className="text-xs font-bold text-[#f97316] tabular-nums">{s.n}</span>
                    </div>
                    <div className="pt-0.5">
                      <h4 className="font-semibold text-white mb-1 flex items-center gap-2">
                        {s.title}
                        <s.Icon className="h-3.5 w-3.5 text-[#f97316] flex-shrink-0" />
                      </h4>
                      <p className="text-neutral-500 text-sm leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-24 space-y-32">
        {/* Feature 1 */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-col md:flex-row items-center gap-16 md:gap-32 group"
        >
          <div className="flex-1 space-y-6">
            <div className="h-12 w-12 bg-neutral-900 flex items-center justify-center">
              <Lock className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Collateral you control.
            </h2>
            <p className="text-neutral-400 text-lg leading-relaxed max-w-md">
              Your Bitcoin sits in a 3-of-3 multisig escrow on the Bitcoin
              blockchain. The platform never has unilateral access — every
              spending transaction requires your key, the lender key, and the
              platform key together.
            </p>
          </div>
          <div className="flex-1 w-full aspect-square bg-neutral-900/30 border border-neutral-800 flex items-center justify-center relative overflow-hidden">
            <svg viewBox="0 0 280 210" className="w-full max-w-[280px] px-4" xmlns="http://www.w3.org/2000/svg">
              {/* Static background lines */}
              <path d="M140,50 L35,178" stroke="#2a2a2a" strokeWidth="1" fill="none"/>
              <path d="M35,178 L245,178" stroke="#2a2a2a" strokeWidth="1" fill="none"/>
              <path d="M245,178 L140,50" stroke="#2a2a2a" strokeWidth="1" fill="none"/>
              {/* Traveling pulse: You → Lender */}
              <path d="M140,50 L35,178" stroke="#f97316" strokeWidth="2" fill="none"
                strokeDasharray="15 85" pathLength="100"
                style={{animation:"pulse-travel 3s linear infinite"}}/>
              {/* Traveling pulse: Lender → Platform */}
              <path d="M35,178 L245,178" stroke="#f97316" strokeWidth="2" fill="none"
                strokeDasharray="15 85" pathLength="100"
                style={{animation:"pulse-travel 3s linear infinite", animationDelay:"-1s"}}/>
              {/* Traveling pulse: Platform → You */}
              <path d="M245,178 L140,50" stroke="#f97316" strokeWidth="2" fill="none"
                strokeDasharray="15 85" pathLength="100"
                style={{animation:"pulse-travel 3s linear infinite", animationDelay:"-2s"}}/>
              {/* Center lock */}
              <rect x="127" y="108" width="26" height="18" rx="3" fill="#1a1a1a" stroke="#404040" strokeWidth="1.5"/>
              <path d="M133,108 V102 a7,7 0 0 1 14,0 V108" fill="none" stroke="#404040" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="140" cy="117" r="2.5" fill="#525252"/>
              {/* "You" node — orange */}
              <circle cx="140" cy="28" r="22" fill="rgba(249,115,22,0.12)" stroke="#f97316" strokeWidth="2"/>
              <text x="140" y="33" textAnchor="middle" fill="#f97316" fontSize="12" fontWeight="700" fontFamily="sans-serif">You</text>
              {/* "Lender" node */}
              <circle cx="35" cy="178" r="22" fill="#111" stroke="#404040" strokeWidth="1.5"/>
              <text x="35" y="182" textAnchor="middle" fill="#a3a3a3" fontSize="9" fontWeight="600" fontFamily="sans-serif">Lender</text>
              {/* "Platform" node */}
              <circle cx="245" cy="178" r="22" fill="#111" stroke="#404040" strokeWidth="1.5"/>
              <text x="245" y="182" textAnchor="middle" fill="#a3a3a3" fontSize="9" fontWeight="600" fontFamily="sans-serif">Platform</text>
              {/* Label */}
              <text x="140" y="207" textAnchor="middle" fill="#3a3a3a" fontSize="7.5" letterSpacing="1.5" fontFamily="sans-serif">2-OF-3 SIGNATURES REQUIRED</text>
            </svg>
          </div>
        </motion.div>

        {/* Feature 2 */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-col md:flex-row-reverse items-center gap-16 md:gap-32 group"
        >
          <div className="flex-1 space-y-6">
            <div className="h-12 w-12 bg-neutral-900 flex items-center justify-center">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Bitcoin-blind for lenders.
            </h2>
            <p className="text-neutral-400 text-lg leading-relaxed max-w-md">
              Lenders work entirely in EUR — no Bitcoin wallet, no crypto knowledge needed. Reconquest handles the Bitcoin side automatically. And because the borrower cryptographically locks in every possible outcome before the loan begins, the platform can only release collateral to you in the event of a default — never arbitrarily, never for any other reason.
            </p>
          </div>
          <div className="flex-1 w-full aspect-square bg-neutral-900/30 border border-neutral-800 flex items-center justify-center relative overflow-hidden">
            <svg viewBox="0 0 300 130" className="w-full max-w-[300px] px-4" xmlns="http://www.w3.org/2000/svg">
              {/* EUR node */}
              <circle cx="32" cy="60" r="24" fill="none" stroke="#333" strokeWidth="1.5"/>
              <text x="32" y="67" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold" fontFamily="monospace">€</text>
              <text x="32" y="98" textAnchor="middle" fill="#a3a3a3" fontSize="8" letterSpacing="1.5" fontFamily="sans-serif">EUR IN</text>
              {/* Arrow EUR → Escrow (dim layer) */}
              <line x1="57" y1="60" x2="110" y2="60" stroke="#2a2a2a" strokeWidth="1.5" strokeDasharray="5 4"/>
              {/* Animated orange flow */}
              <line x1="57" y1="60" x2="110" y2="60" stroke="#f97316" strokeWidth="1.5" strokeDasharray="5 4"
                style={{animation:"flow-right 1.1s linear infinite"}}/>
              {/* Arrowhead */}
              <path d="M108,56 L114,60 L108,64" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              {/* BTC Escrow vault */}
              <rect x="114" y="38" width="72" height="44" rx="4" fill="rgba(249,115,22,0.07)" stroke="#f97316" strokeWidth="1.5"/>
              {/* Lock shackle */}
              <path d="M141,56 V50 a9,9 0 0 1 18,0 V56" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round"/>
              {/* Lock body */}
              <rect x="138" y="56" width="24" height="17" rx="3" fill="#f97316"/>
              <circle cx="150" cy="64.5" r="3" fill="rgba(0,0,0,0.4)"/>
              <text x="150" y="98" textAnchor="middle" fill="#f97316" fontSize="7.5" letterSpacing="1.5" fontFamily="sans-serif">BTC ESCROW</text>
              {/* Arrow Escrow → Yield (dim) */}
              <line x1="187" y1="60" x2="240" y2="60" stroke="#2a2a2a" strokeWidth="1.5" strokeDasharray="5 4"/>
              {/* Animated orange flow (offset) */}
              <line x1="187" y1="60" x2="240" y2="60" stroke="#f97316" strokeWidth="1.5" strokeDasharray="5 4"
                style={{animation:"flow-right 1.1s linear infinite", animationDelay:"-0.55s"}}/>
              {/* Arrowhead */}
              <path d="M238,56 L244,60 L238,64" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              {/* Yield node */}
              <circle cx="268" cy="60" r="24" fill="none" stroke="#333" strokeWidth="1.5"/>
              <text x="268" y="55" textAnchor="middle" fill="#d4d4d4" fontSize="11" fontWeight="600" fontFamily="monospace">+</text>
              <text x="268" y="70" textAnchor="middle" fill="white" fontSize="15" fontWeight="700" fontFamily="monospace">%</text>
              <text x="268" y="98" textAnchor="middle" fill="#a3a3a3" fontSize="8" letterSpacing="1.5" fontFamily="sans-serif">YIELD</text>
            </svg>
          </div>
        </motion.div>

        {/* Feature 3 */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-col md:flex-row items-center gap-16 md:gap-32 group"
        >
          <div className="flex-1 space-y-6">
            <div className="h-12 w-12 bg-neutral-900 flex items-center justify-center">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Continuous LTV protection.
            </h2>
            <p className="text-neutral-400 text-lg leading-relaxed max-w-md">
              The platform monitors every loan's LTV in real time. Borrowers
              receive an early warning at 75% and a critical alert at 85%,
              giving them time to top up collateral. Automatic liquidation
              triggers at 95% — protecting lenders before any loss occurs.
            </p>
          </div>
          <div className="flex-1 w-full aspect-square bg-neutral-900/30 border border-neutral-800 flex items-center justify-center relative overflow-hidden">
            <div className="w-full px-8 space-y-5">
              {/* LTV label */}
              <div className="text-[10px] tracking-[0.2em] text-neutral-500 uppercase">LTV Ratio</div>
              {/* Bar */}
              <div className="relative h-3 w-full flex rounded-sm overflow-hidden">
                <div className="h-full bg-green-700/80" style={{width:"72%"}}/>
                <div className="h-full bg-yellow-500/80" style={{width:"10%"}}/>
                <div className="h-full bg-[#f97316]/80" style={{width:"10%"}}/>
                <div className="ltv-danger h-full bg-red-600/80" style={{width:"8%"}}/>
                {/* Animated indicator */}
                <div className="ltv-indicator absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" style={{left:"0%"}}/>
              </div>
              {/* Bell icons at thresholds */}
              <div className="relative h-6 text-base">
                <span className="ltv-bell-75 absolute -translate-x-1/2 select-none" style={{left:"72%"}}>🔔</span>
                <span className="ltv-bell-85 absolute -translate-x-1/2 select-none" style={{left:"82%"}}>🔔</span>
              </div>
              {/* Threshold markers */}
              <div className="relative text-[9px] text-neutral-600 h-4">
                <span className="absolute -translate-x-1/2" style={{left:"72%"}}>75%</span>
                <span className="absolute -translate-x-1/2" style={{left:"82%"}}>85%</span>
                <span className="absolute -translate-x-1/2 text-red-600" style={{left:"94%"}}>95%</span>
              </div>
              {/* Zone labels */}
              <div className="flex text-[9px] font-semibold tracking-wider pt-1">
                <span className="text-green-600" style={{width:"72%"}}>SAFE</span>
                <span className="text-yellow-500" style={{width:"10%"}}>WARN</span>
                <span className="text-orange-500" style={{width:"10%"}}>CRIT</span>
                <span className="text-red-600" style={{width:"8%"}}>LIQ</span>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 md:px-12 py-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500 mb-3">
            Support
          </p>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
            Frequently asked questions
          </h2>
        </motion.div>

        <div className="border-t border-neutral-900">
          <FaqItem question="Why Reconquest?">
            <p>
              Unlike centralised lenders that have collapsed, Reconquest never
              touches your Bitcoin collateral. It is locked in a 3-of-3
              multisig contract on the Bitcoin network. We provide the
              technology for secure interaction between borrower and lender —
              no single party, including Reconquest, can move funds
              unilaterally.
            </p>
          </FaqItem>

          <FaqItem question="What is Bitcoin-backed lending?">
            <p>
              Bitcoin-backed lending lets you lock your Bitcoin as collateral
              to receive a EUR loan, without selling. Lenders fund these
              collateralised loans and earn a fixed interest return agreed
              upfront.
            </p>
          </FaqItem>

          <FaqItem question="What currencies are supported?">
            <p>
              Loans are denominated in EUR. The borrower receives EUR directly
              to their bank account via SEPA transfer from the lender.
            </p>
          </FaqItem>

          <FaqItem question="What loan terms are available?">
            <p>
              Loan durations range from 3 to 18 months. Interest rates are set
              freely by borrowers and accepted by lenders through the
              marketplace.
            </p>
          </FaqItem>

          <FaqItem question="How does the 3-of-3 multisig escrow work?">
            <p>
              Three keys are required to move your Bitcoin — yours, the lender's, and the platform's. Since most lenders on Reconquest are not Bitcoin users, we hold the lender's key on their behalf as a convenience. But here is the important part: <strong>before your loan even starts, you pre-sign every possible outcome</strong> — repayment back to you, default to the lender, and an emergency recovery to yourself. Those are the only transactions the escrow can ever execute. No new transaction can be created after that point. This means that even though Reconquest co-signs twice, it is mathematically impossible for us to send your Bitcoin anywhere you have not already agreed to. The escrow is a vault with pre-set doors — we hold keys to those doors, but you decided where every door leads.
            </p>
          </FaqItem>

          <FaqItem question="How does LTV monitoring work?">
            <p>
              The platform checks every loan's LTV ratio continuously. If
              Bitcoin's price falls and LTV reaches:
            </p>
            <ul className="space-y-1 list-none pl-0">
              <li>
                <strong className="text-white">75%</strong> — an early warning
                email is sent to the borrower.
              </li>
              <li>
                <strong className="text-white">85%</strong> — a critical alert
                is sent; the borrower can top up collateral to lower the LTV.
              </li>
              <li>
                <strong className="text-white">95%</strong> — automatic
                liquidation is triggered to protect the lender's principal and
                interest.
              </li>
            </ul>
          </FaqItem>

          <FaqItem question="What happens to my BTC if Reconquest disappears?">
            <p>
              At loan setup, a signed Recovery Transaction is generated and
              provided to you. If Reconquest infrastructure fails completely,
              you can broadcast this transaction on any block explorer (e.g.
              Mempool.space) one month after loan maturity to recover your
              Bitcoin — no Reconquest involvement required.
            </p>
          </FaqItem>

          <FaqItem question="When will I receive EUR from the lender?">
            <p>
              Once your Bitcoin collateral is confirmed on-chain and the signing
              ceremony is complete, the lender initiates a SEPA transfer. EUR
              SEPA payments typically arrive same-day to 2 business days.
            </p>
          </FaqItem>

          <FaqItem question="Who handles liquidation if I default?">
            <p>
              <strong className="text-white">Self-Liquidation</strong> — The
              lender receives the Bitcoin collateral directly to their designated
              address.
            </p>
            <p>
              <strong className="text-white">
                Platform-Managed Liquidation
              </strong>{" "}
              — Reconquest handles the process and returns the lender's
              investment in EUR. This mode is designed for lenders who prefer
              not to interact with cryptocurrency directly.
            </p>
          </FaqItem>
        </div>
      </section>

      {/* ── CTA STRIP ─────────────────────────────────────── */}
      <section className="border-t border-neutral-900 py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
            Ready to get started?
          </h2>
          <p className="text-neutral-500 mb-8">
            Create an account and post your first loan request or browse
            available opportunities as a lender.
          </p>
          <div className="flex gap-4">
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
                className="border-neutral-700 bg-transparent text-white hover:bg-white hover:text-black rounded-full h-12 text-base font-medium transition-colors w-44"
              >
                Start Lending
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── NEED HELP ─────────────────────────────────────── */}
      <section className="border-t border-neutral-900 py-16">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">Need Help?</h2>
          <p className="text-neutral-400 mb-6">
            Have questions about Bitcoin-backed lending or need support with your account?
          </p>
          <a
            href="mailto:admin@reconquestp2p.com"
            className="inline-flex items-center gap-2 text-[#f97316] hover:text-[#ea580c] font-medium transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
            admin@reconquestp2p.com
          </a>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────── */}
      <footer className="border-t border-neutral-900 py-10">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-lg font-bold tracking-tight text-neutral-600">
            Reconquest
          </span>
          <span className="text-sm text-neutral-600">
            &copy; {new Date().getFullYear()} Reconquest. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}
