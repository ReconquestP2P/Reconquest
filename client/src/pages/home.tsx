import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Shield, Zap, Lock, TrendingUp, ArrowRight, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { motion } from "framer-motion";

const noiseStyle = {
  backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")',
};

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.12, ease: "easeOut" } }),
};

function FaqItem({ question, children }: { question: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-neutral-900">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-6 text-left group"
      >
        <span className="text-white font-medium text-lg group-hover:text-[#f97316] transition-colors">{question}</span>
        <ChevronDown className={`h-5 w-5 text-neutral-500 flex-shrink-0 ml-4 transition-transform duration-300 ${open ? "rotate-180 text-[#f97316]" : ""}`} />
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
      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.025]" style={noiseStyle} />

      {/* ── HERO ─────────────────────────────────────── */}
      <section className="relative max-w-7xl mx-auto px-6 md:px-12 pt-28 pb-36">
        <motion.p
          variants={fadeUp} initial="hidden" animate="show" custom={0}
          className="text-sm uppercase tracking-[0.2em] text-neutral-500 mb-6 font-medium"
        >
          The Future of Lending Is Bitcoin-Backed
        </motion.p>
        <motion.h1
          variants={fadeUp} initial="hidden" animate="show" custom={1}
          className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tighter leading-[1.04] mb-8 max-w-5xl"
        >
          <span className="block">Unlock liquidity.</span>
          <span className="block text-[#f97316]">Keep your Bitcoin.</span>
        </motion.h1>
        <motion.p
          variants={fadeUp} initial="hidden" animate="show" custom={2}
          className="text-xl md:text-2xl text-neutral-400 max-w-2xl mb-12 font-light leading-relaxed"
        >
          The P2P lending platform where Bitcoin works for you. Lock BTC as
          collateral, receive EUR instantly — no selling required.
        </motion.p>
        <motion.div
          variants={fadeUp} initial="hidden" animate="show" custom={3}
          className="flex flex-col sm:flex-row gap-4"
        >
          <Link href={isAuthenticated ? "/borrower" : "/login"}>
            <Button size="lg" className="bg-[#f97316] hover:bg-[#ea580c] text-white rounded-none h-14 px-10 text-lg font-medium group border-0 w-full sm:w-auto">
              Start Borrowing <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <Link href={isAuthenticated ? "/lender" : "/login"}>
            <Button size="lg" variant="outline" className="border-neutral-700 bg-transparent text-white hover:bg-white hover:text-black rounded-none h-14 px-10 text-lg font-medium transition-colors w-full sm:w-auto">
              Explore Lending
            </Button>
          </Link>
        </motion.div>
      </section>

      {/* ── STATS BAR ────────────────────────────────── */}
      <div className="border-y border-neutral-900 bg-neutral-950/60">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { value: "€2.4M", label: "Total Lent" },
            { value: "247", label: "Active Borrowers" },
            { value: "8.5%", label: "Avg. Return" },
            { value: "0", label: "Security Incidents" },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-3xl md:text-4xl font-bold tracking-tight mb-1">{s.value}</div>
              <div className="text-xs text-neutral-500 uppercase tracking-widest font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── VIDEO ────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 md:px-12 py-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.7 }}
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

      {/* ── HOW IT WORKS ─────────────────────────────── */}
      <section id="how-it-works" className="max-w-7xl mx-auto px-6 md:px-12 py-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500 mb-3">Process</p>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight">How Reconquest Works</h2>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-16 md:gap-24">
          {/* Borrowers */}
          <motion.div
            initial={{ opacity: 0, x: -24 }} whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.6 }}
          >
            <h3 className="text-xl font-semibold mb-8 text-[#f97316] uppercase tracking-widest text-sm">For Borrowers</h3>
            <div className="space-y-8">
              {[
                { n: "01", title: "Set your Loan Terms", desc: "Define your preferred interest rate and duration." },
                { n: "02", title: "Get Matched", desc: "A lender accepts your terms on the marketplace." },
                { n: "03", title: "Deposit Collateral", desc: "Lock your Bitcoin in a 3-of-3 multisig escrow." },
                { n: "04", title: "Receive EUR", desc: "Funds arrive to your bank account instantly." },
              ].map((s) => (
                <div key={s.n} className="flex gap-6">
                  <span className="text-3xl font-bold text-neutral-800 tabular-nums leading-none mt-1">{s.n}</span>
                  <div>
                    <h4 className="font-semibold text-white mb-1">{s.title}</h4>
                    <p className="text-neutral-500 text-sm leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Lenders */}
          <motion.div
            initial={{ opacity: 0, x: 24 }} whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.1 }}
          >
            <h3 className="text-xl font-semibold mb-8 text-white uppercase tracking-widest text-sm">For Lenders</h3>
            <div className="space-y-8">
              {[
                { n: "01", title: "Browse Loan Requests", desc: "View vetted loans backed by Bitcoin collateral." },
                { n: "02", title: "Select a Loan", desc: "Confirm your interest and wait for collateral confirmation." },
                { n: "03", title: "Send Funds", desc: "Transfer the agreed EUR amount to the borrower." },
                { n: "04", title: "Earn Fixed Yield", desc: "Receive principal + interest at loan maturity." },
              ].map((s) => (
                <div key={s.n} className="flex gap-6">
                  <span className="text-3xl font-bold text-neutral-800 tabular-nums leading-none mt-1">{s.n}</span>
                  <div>
                    <h4 className="font-semibold text-white mb-1">{s.title}</h4>
                    <p className="text-neutral-500 text-sm leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-24 space-y-32">
        {[
          {
            icon: <Lock className="h-6 w-6 text-white" />,
            title: "Absolute Control.",
            body: "Your collateral sits in a deterministic 3-of-3 multisig escrow on the Bitcoin blockchain. We never co-mingle or rehypothecate your assets. Verifiable on-chain, always.",
            flip: false,
            visual: (
              <div className="w-48 h-48 border border-neutral-700 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-700">
                <div className="w-24 h-24 border border-[#f97316]/30 rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-[#f97316] rounded-full shadow-[0_0_15px_#f97316]" />
                </div>
              </div>
            ),
          },
          {
            icon: <Zap className="h-6 w-6 text-white" />,
            title: "Instant Liquidity.",
            body: "Once your transaction confirms, EUR is deployed immediately. No credit checks, no approval queues — pure mathematics and code.",
            flip: true,
            visual: (
              <div className="w-full max-w-[220px] h-48 border-l border-b border-neutral-700 relative group-hover:border-neutral-500 transition-colors duration-700">
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#f97316] w-0 group-hover:w-full transition-all duration-1000 ease-out" />
                {[{ left: 16, h: 96 }, { left: 80, h: 144 }, { left: 144, h: 64 }].map((b, i) => (
                  <div key={i} className="absolute bottom-[2px] w-10 bg-neutral-800 group-hover:bg-neutral-700 transition-colors duration-500" style={{ left: b.left, height: b.h, transitionDelay: `${i * 100}ms` }} />
                ))}
              </div>
            ),
          },
          {
            icon: <Shield className="h-6 w-6 text-white" />,
            title: "Protected Returns.",
            body: "Continuous LTV monitoring protects lenders at all times. If collateral value drops, borrowers top up — or the platform liquidates automatically before any loss occurs.",
            flip: false,
            visual: (
              <div className="w-48 h-48 relative flex items-center justify-center">
                <div className="absolute inset-0 border border-neutral-800 rotate-45 group-hover:rotate-[50deg] transition-transform duration-700" />
                <TrendingUp className="h-12 w-12 text-[#f97316]/60 group-hover:text-[#f97316] transition-colors duration-500" />
              </div>
            ),
          },
        ].map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.6 }}
            className={`flex flex-col ${f.flip ? "md:flex-row-reverse" : "md:flex-row"} items-center gap-16 md:gap-32 group`}
          >
            <div className="flex-1 space-y-6">
              <div className="h-12 w-12 bg-neutral-900 flex items-center justify-center">{f.icon}</div>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">{f.title}</h2>
              <p className="text-neutral-400 text-lg leading-relaxed max-w-md">{f.body}</p>
            </div>
            <div className="flex-1 w-full aspect-square bg-neutral-900/30 border border-neutral-800 flex items-center justify-center relative overflow-hidden">
              <div className={`absolute inset-0 bg-gradient-to-${f.flip ? "tl" : "br"} from-neutral-800/10 to-transparent`} />
              {f.visual}
            </div>
          </motion.div>
        ))}
      </section>

      {/* ── FAQ ──────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 md:px-12 py-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500 mb-3">Support</p>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight">Frequently Asked Questions</h2>
        </motion.div>

        <div className="border-t border-neutral-900">
          <FaqItem question="Why Reconquest?">
            <p>Unlike centralized lenders that have collapsed, Reconquest never touches your Bitcoin collateral — it is locked in a multisig contract on the Bitcoin network. We only provide the technology for secure interaction between borrower and investor; we never access members' funds.</p>
          </FaqItem>
          <FaqItem question="What is Bitcoin-backed lending?">
            <p>Bitcoin-backed lending lets you use Bitcoin as collateral to secure EUR loans without selling. Lenders earn a fixed yield by funding these collateralized loans.</p>
          </FaqItem>
          <FaqItem question="What currencies can I borrow?">
            <p>Reconquest supports EUR loans using Bitcoin as collateral.</p>
          </FaqItem>
          <FaqItem question="What are the available loan terms?">
            <p>Loan terms range from 3 to 18 months (3, 6, 9, 12, 18-month options). Interest rates are set through marketplace dynamics.</p>
          </FaqItem>
          <FaqItem question="How secure is the platform?">
            <p>Reconquest uses 3-of-3 multisig escrow. Your Bitcoin is held in a smart contract requiring multiple cryptographic signatures for any transaction, ensuring maximum security for both parties.</p>
          </FaqItem>
          <FaqItem question="What if Bitcoin's price drops?">
            <p>We continuously monitor all LTV ratios. If Bitcoin's price drops significantly, borrowers receive collateral top-up warnings. If the LTV reaches 95%, the position is automatically liquidated to protect lenders' principal and interest.</p>
          </FaqItem>
          <FaqItem question="What happens to my BTC if Reconquest disappears?">
            <p>A signed Recovery Transaction is generated at loan creation. If Reconquest infrastructure ever fails completely, you can broadcast this transaction on any block explorer (e.g. Mempool.space) one month after loan maturity to recover your Bitcoin.</p>
          </FaqItem>
          <FaqItem question="When will I receive funds from the investor?">
            <p>EUR SEPA transfers typically arrive same-day to 2 business days. SWIFT may take a few additional days. All timelines are confirmed on the loan card before you lock collateral.</p>
          </FaqItem>
          <FaqItem question="Who handles liquidation?">
            <p><strong className="text-white">Self-Liquidation</strong> — You receive Bitcoin collateral directly to your designated address.</p>
            <p><strong className="text-white">Reconquest Liquidation</strong> — We manage the process and return your investment in EUR. This mode is ideal for investors who prefer not to handle private keys or exchange interactions.</p>
          </FaqItem>
        </div>
      </section>

      {/* ── CTA STRIP ────────────────────────────────── */}
      <section className="border-t border-neutral-900 py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-center justify-between gap-8">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">Ready to get started?</h2>
            <p className="text-neutral-500">Join hundreds of borrowers and lenders already on Reconquest.</p>
          </div>
          <div className="flex gap-4">
            <Link href={isAuthenticated ? "/borrower" : "/login"}>
              <Button size="lg" className="bg-[#f97316] hover:bg-[#ea580c] text-white rounded-none h-14 px-10 font-medium border-0 group">
                Start Borrowing <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link href={isAuthenticated ? "/lender" : "/login"}>
              <Button size="lg" variant="outline" className="border-neutral-700 bg-transparent text-white hover:bg-white hover:text-black rounded-none h-14 px-10 font-medium transition-colors">
                Start Lending
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────── */}
      <footer className="border-t border-neutral-900 py-10">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-lg font-bold tracking-tight text-neutral-600">Reconquest</span>
          <span className="text-sm text-neutral-600">&copy; {new Date().getFullYear()} Reconquest. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
