export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'diamond';
  category: 'borrower' | 'lender' | 'general';
  requirement: {
    type: 'loans_completed' | 'loan_amount' | 'reputation_score' | 'consecutive_loans' | 'platform_usage';
    value: number;
  };
  unlockedAt?: Date;
  isUnlocked: boolean;
  progress: number;
  maxProgress: number;
  blockchain?: {
    txHash?: string;
    blockHeight?: number;
    timestamp?: Date;
  };
}

export interface AchievementCategory {
  id: string;
  name: string;
  description: string;
  color: string;
  achievements: Achievement[];
}

export interface UserAchievements {
  userId: number;
  achievements: Achievement[];
  totalUnlocked: number;
  completionRate: number;
  nextMilestone?: Achievement;
}