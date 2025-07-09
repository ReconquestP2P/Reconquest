import { AchievementCategory } from '@/types/achievements';

export const achievementCategories: AchievementCategory[] = [
  {
    id: 'borrower',
    name: 'Borrower Achievements',
    description: 'Unlock rewards for successful borrowing',
    color: 'bg-primary',
    achievements: [
      {
        id: 'first_loan',
        name: 'Genesis Block',
        description: 'Complete your first Bitcoin-backed loan',
        icon: '🎯',
        tier: 'bronze',
        category: 'borrower',
        requirement: { type: 'loans_completed', value: 1 },
        isUnlocked: false,
        progress: 0,
        maxProgress: 1
      },
      {
        id: 'loan_veteran',
        name: 'Chain Builder',
        description: 'Complete 5 successful loans',
        icon: '🔗',
        tier: 'silver',
        category: 'borrower',
        requirement: { type: 'loans_completed', value: 5 },
        isUnlocked: false,
        progress: 0,
        maxProgress: 5
      },
      {
        id: 'loan_master',
        name: 'Block Validator',
        description: 'Complete 10 successful loans',
        icon: '⚡',
        tier: 'gold',
        category: 'borrower',
        requirement: { type: 'loans_completed', value: 10 },
        isUnlocked: false,
        progress: 0,
        maxProgress: 10
      },
      {
        id: 'btc_whale',
        name: 'Bitcoin Whale',
        description: 'Collateralize over 10 BTC in total',
        icon: '🐋',
        tier: 'diamond',
        category: 'borrower',
        requirement: { type: 'loan_amount', value: 10 },
        isUnlocked: false,
        progress: 0,
        maxProgress: 10
      },
      {
        id: 'perfect_streak',
        name: 'Hash Rate Hero',
        description: 'Complete 3 consecutive loans without default',
        icon: '💎',
        tier: 'gold',
        category: 'borrower',
        requirement: { type: 'consecutive_loans', value: 3 },
        isUnlocked: false,
        progress: 0,
        maxProgress: 3
      }
    ]
  },
  {
    id: 'lender',
    name: 'Lender Achievements',
    description: 'Earn rewards for providing capital',
    color: 'bg-blue-600',
    achievements: [
      {
        id: 'first_investment',
        name: 'Mining Rookie',
        description: 'Fund your first Bitcoin-backed loan',
        icon: '⛏️',
        tier: 'bronze',
        category: 'lender',
        requirement: { type: 'loans_completed', value: 1 },
        isUnlocked: false,
        progress: 0,
        maxProgress: 1
      },
      {
        id: 'yield_farmer',
        name: 'Yield Miner',
        description: 'Fund 5 successful loans',
        icon: '🌾',
        tier: 'silver',
        category: 'lender',
        requirement: { type: 'loans_completed', value: 5 },
        isUnlocked: false,
        progress: 0,
        maxProgress: 5
      },
      {
        id: 'capital_provider',
        name: 'Node Operator',
        description: 'Fund 15 successful loans',
        icon: '🏗️',
        tier: 'gold',
        category: 'lender',
        requirement: { type: 'loans_completed', value: 15 },
        isUnlocked: false,
        progress: 0,
        maxProgress: 15
      },
      {
        id: 'lending_titan',
        name: 'Network Validator',
        description: 'Provide over $100K in lending capital',
        icon: '👑',
        tier: 'diamond',
        category: 'lender',
        requirement: { type: 'loan_amount', value: 100000 },
        isUnlocked: false,
        progress: 0,
        maxProgress: 100000
      }
    ]
  },
  {
    id: 'general',
    name: 'Platform Achievements',
    description: 'General milestones and reputation rewards',
    color: 'bg-green-600',
    achievements: [
      {
        id: 'reputation_builder',
        name: 'Consensus Seeker',
        description: 'Reach 100 reputation score',
        icon: '📈',
        tier: 'bronze',
        category: 'general',
        requirement: { type: 'reputation_score', value: 100 },
        isUnlocked: false,
        progress: 0,
        maxProgress: 100
      },
      {
        id: 'trusted_member',
        name: 'Proof of Trust',
        description: 'Reach 500 reputation score',
        icon: '🛡️',
        tier: 'silver',
        category: 'general',
        requirement: { type: 'reputation_score', value: 500 },
        isUnlocked: false,
        progress: 0,
        maxProgress: 500
      },
      {
        id: 'platform_veteran',
        name: 'Blockchain Pioneer',
        description: 'Reach 1000 reputation score',
        icon: '🚀',
        tier: 'gold',
        category: 'general',
        requirement: { type: 'reputation_score', value: 1000 },
        isUnlocked: false,
        progress: 0,
        maxProgress: 1000
      },
      {
        id: 'ecosystem_leader',
        name: 'Satoshi\'s Vision',
        description: 'Reach 2000 reputation score',
        icon: '🌟',
        tier: 'diamond',
        category: 'general',
        requirement: { type: 'reputation_score', value: 2000 },
        isUnlocked: false,
        progress: 0,
        maxProgress: 2000
      }
    ]
  }
];