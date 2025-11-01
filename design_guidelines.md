# Reconquest - Bitcoin P2P Lending Platform Design Guidelines

## Design Approach

**Reference-Based Strategy**: Drawing from established fintech platforms (Stripe Dashboard, Plaid) for professional credibility combined with crypto-native platforms (Coinbase, Aave) for Bitcoin-specific patterns. The design emphasizes trustworthiness through clarity, restraint, and precise information hierarchy while maintaining visual impact through strategic use of Bitcoin orange accents.

---

## Typography System

**Font Families** (via Google Fonts):
- Primary: Inter (headings, UI elements, data tables)
- Secondary: JetBrains Mono (Bitcoin addresses, transaction hashes, numerical data)

**Hierarchy**:
- Hero Headlines: 3xl to 6xl, font-weight-700, tight tracking
- Section Headers: 2xl to 4xl, font-weight-600
- Card Titles: xl to 2xl, font-weight-600
- Body Text: base to lg, font-weight-400, leading-relaxed
- Data Labels: sm, font-weight-500, uppercase tracking-wide
- Monospaced Data: JetBrains Mono for Bitcoin addresses, amounts, hashes

---

## Layout System

**Spacing Primitives**: Use Tailwind units of 4, 6, 8, 12, 16 for consistent rhythm (p-4, gap-6, mt-8, py-12, mb-16)

**Grid Structure**:
- Container: max-w-7xl with px-4 to px-8
- Dashboard layouts: 12-column grid with gap-6
- Loan cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Detail panels: 2-column split (lg:grid-cols-3 with 2:1 ratio for main/sidebar)

**Vertical Rhythm**: py-12 md:py-20 for section spacing, py-6 to py-8 for card interiors

---

## Component Library

### Navigation
**Top Navigation Bar**:
- Fixed header with backdrop-blur effect, border-b
- Left: Logo with Bitcoin symbol integration
- Center: Primary navigation links (Browse Loans, Lend, Borrow, Dashboard)
- Right: Wallet connection status, notification bell, user avatar dropdown
- Mobile: Hamburger menu with slide-in drawer

### Hero Section
**Layout**: Full-width hero spanning 70vh with dramatic Bitcoin-themed imagery
- Background: High-quality image of Bitcoin concept (blockchain visualization, digital currency metaphor, or modern financial technology)
- Overlay: Subtle dark gradient (bg-gradient-to-br from-blue-900/90 to-slate-900/80) for text legibility
- Content positioning: Left-aligned in max-w-3xl container
- Primary CTA: Large button with backdrop-blur-md bg-white/10 border border-white/20
- Secondary CTA: Outlined button with same blur treatment
- Trust indicators below CTAs: "₿1,247 BTC locked • 3,421 active loans • $47M total volume" with icons
- Floating stats cards: 2-3 small cards with glass-morphism effect showing live platform metrics

### Loan Card Components
**Structure**: Elevated cards with hover transitions
- Card header: Loan amount (large, bold) + APR badge (Bitcoin orange background)
- Metadata grid: 2x2 or 3x2 grid showing LTV ratio, duration, collateral amount, borrower rating
- Progress indicators: Linear progress bars for funding status
- Risk badge: Color-coded pill (green/yellow/orange) with risk level
- Action footer: Primary CTA button spanning card width
- Border accent: Left border-l-4 in Bitcoin orange for featured/recommended loans

### Dashboard Layouts
**Lender Dashboard**:
- Top metrics row: 4-column stat cards (Total Lent, Active Loans, Interest Earned, Portfolio Health)
- Main content: Tab interface (Active Loans, Loan Opportunities, Transaction History)
- Data table: Sortable columns with monospaced numbers, status badges, action buttons
- Right sidebar: Quick actions panel, market insights widget

**Borrower Dashboard**:
- Hero stat: Large display of available credit against Bitcoin collateral
- Bitcoin wallet integration panel: Address display, balance, deposit CTA
- Active loans section: Timeline visualization of loan lifecycle
- Collateral health monitor: Visual gauge showing liquidation risk

### Bitcoin Workflow Components
**Key Generation Interface**:
- Step-by-step wizard with progress indicator at top
- Large monospaced display for generated keys with copy button
- Security checklist with checkboxes
- Warning callouts with amber background for security notices
- QR code display for address sharing

**Escrow Management Panel**:
- Split view: Left shows Bitcoin transaction details, right shows loan terms
- Real-time Bitcoin price ticker with sparkline chart
- Status timeline: Vertical timeline showing escrow stages
- Multi-signature badge showing required/collected signatures

### Forms
**Loan Request Form**:
- Multi-step form with visual progress bar
- Amount slider with Bitcoin conversion display
- Collateral calculator showing real-time LTV
- Term selector with radio button cards
- Summary panel sticky on right side
- Input fields with Bitcoin symbol prefixes where relevant

### Data Visualization
**Charts**: Use Recharts library
- Portfolio performance: Area chart with gradient fill
- Interest rate trends: Line chart with multiple loan types
- Market depth: Horizontal bar chart for available liquidity
- Collateral health: Radial progress gauge

### Modals & Overlays
- Transaction confirmation modals with detailed breakdown
- Bitcoin address verification dialogs
- Risk disclosure overlays with signature requirement
- Success/error states with illustrative icons

---

## Animations

**Minimal, purposeful motion**:
- Page transitions: Subtle fade-in (opacity + translate-y-4)
- Card hovers: Slight elevation increase (shadow-md to shadow-lg)
- Data updates: Number counter animations for statistics
- Loading states: Skeleton screens, not spinners
- Critical actions: Subtle pulse on CTAs, no constant animations

---

## Images

**Hero Section Image**: 
- High-resolution image depicting Bitcoin/blockchain technology in professional context
- Suggestions: Abstract Bitcoin network visualization, clean 3D rendered Bitcoin coins in architectural space, or modern trading desk with digital overlays
- Treatment: Apply dark gradient overlay for text contrast
- Placement: Full-width background, center-focused composition

**Trust Signals Section**:
- Partner logos: Grayscale logos of security providers, insurance partners (if applicable)
- Team photos: Professional headshots in circular frames

**Educational Content**:
- Infographic-style illustrations explaining loan process, escrow mechanics
- Icon-based visual guides for Bitcoin collateral workflow

---

## Accessibility & Quality

- WCAG AA compliant contrast ratios throughout
- Keyboard navigation for all interactive elements
- Clear focus states: ring-2 ring-offset-2 ring-blue-500
- Screen reader labels for all icons and data visualizations
- Form validation with inline error messages
- Disabled states clearly communicated with reduced opacity + cursor-not-allowed

---

**Design Principles Summary**:
1. Trust through transparency - all data visible, no hidden fees
2. Scannable information architecture - quick assessment of loan opportunities
3. Professional restraint - Bitcoin orange used sparingly for emphasis
4. Clarity over cleverness - straightforward language and obvious CTAs
5. Security-first messaging - constant reinforcement of platform safety measures