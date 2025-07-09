import { Achievement, UserAchievements } from '@/types/achievements';
import { achievementCategories } from '@/data/achievements';
import { User, Loan } from '@shared/schema';

export class AchievementService {
  /**
   * Calculate user's achievement progress based on their stats
   */
  static calculateUserAchievements(user: User, userLoans: Loan[]): UserAchievements {
    const allAchievements = achievementCategories.flatMap(cat => cat.achievements);
    const userAchievements: Achievement[] = [];

    // Calculate stats from user data
    const completedLoans = userLoans.filter(loan => loan.status === 'completed').length;
    const totalCollateral = userLoans.reduce((sum, loan) => sum + parseFloat(loan.collateralBtc || '0'), 0);
    const totalLoanAmount = userLoans.reduce((sum, loan) => sum + parseFloat(loan.amount || '0'), 0);
    const consecutiveLoans = this.calculateConsecutiveLoans(userLoans);

    // Process each achievement
    allAchievements.forEach(achievement => {
      const achievementCopy = { ...achievement };
      let progress = 0;
      let isUnlocked = false;

      switch (achievement.requirement.type) {
        case 'loans_completed':
          progress = completedLoans;
          isUnlocked = progress >= achievement.requirement.value;
          break;
        case 'loan_amount':
          if (achievement.category === 'borrower') {
            progress = totalCollateral;
          } else {
            progress = totalLoanAmount;
          }
          isUnlocked = progress >= achievement.requirement.value;
          break;
        case 'reputation_score':
          progress = user.reputation;
          isUnlocked = progress >= achievement.requirement.value;
          break;
        case 'consecutive_loans':
          progress = consecutiveLoans;
          isUnlocked = progress >= achievement.requirement.value;
          break;
        default:
          break;
      }

      achievementCopy.progress = Math.min(progress, achievement.maxProgress);
      achievementCopy.isUnlocked = isUnlocked;
      
      if (isUnlocked) {
        achievementCopy.unlockedAt = new Date();
        achievementCopy.blockchain = {
          txHash: this.generateMockTxHash(),
          blockHeight: Math.floor(Math.random() * 1000000) + 800000,
          timestamp: new Date()
        };
      }

      userAchievements.push(achievementCopy);
    });

    const unlockedCount = userAchievements.filter(a => a.isUnlocked).length;
    const nextMilestone = userAchievements
      .filter(a => !a.isUnlocked)
      .sort((a, b) => (a.progress / a.maxProgress) - (b.progress / b.maxProgress))
      .reverse()[0];

    return {
      userId: user.id,
      achievements: userAchievements,
      totalUnlocked: unlockedCount,
      completionRate: (unlockedCount / userAchievements.length) * 100,
      nextMilestone
    };
  }

  /**
   * Check if user has newly unlocked any achievements
   */
  static checkNewAchievements(
    previousAchievements: UserAchievements,
    currentAchievements: UserAchievements
  ): Achievement[] {
    const newlyUnlocked: Achievement[] = [];
    
    currentAchievements.achievements.forEach(current => {
      const previous = previousAchievements.achievements.find(p => p.id === current.id);
      if (current.isUnlocked && (!previous || !previous.isUnlocked)) {
        newlyUnlocked.push(current);
      }
    });

    return newlyUnlocked;
  }

  /**
   * Get achievements by category
   */
  static getAchievementsByCategory(userAchievements: UserAchievements, category: string) {
    return userAchievements.achievements.filter(a => a.category === category);
  }

  /**
   * Get user's achievement summary stats
   */
  static getAchievementStats(userAchievements: UserAchievements) {
    const achievements = userAchievements.achievements;
    const tiers = ['bronze', 'silver', 'gold', 'diamond'];
    
    const stats = tiers.map(tier => ({
      tier,
      total: achievements.filter(a => a.tier === tier).length,
      unlocked: achievements.filter(a => a.tier === tier && a.isUnlocked).length
    }));

    return {
      totalAchievements: achievements.length,
      totalUnlocked: userAchievements.totalUnlocked,
      completionRate: userAchievements.completionRate,
      tierStats: stats
    };
  }

  /**
   * Calculate consecutive successful loans (no defaults)
   */
  private static calculateConsecutiveLoans(loans: Loan[]): number {
    const sortedLoans = loans
      .filter(loan => loan.status === 'completed' || loan.status === 'defaulted')
      .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());

    let consecutive = 0;
    for (const loan of sortedLoans) {
      if (loan.status === 'completed') {
        consecutive++;
      } else {
        break;
      }
    }

    return consecutive;
  }

  /**
   * Generate mock blockchain transaction hash
   */
  private static generateMockTxHash(): string {
    const chars = '0123456789abcdef';
    let hash = '';
    for (let i = 0; i < 64; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return hash;
  }

  /**
   * Get achievement rarity text
   */
  static getAchievementRarity(achievement: Achievement): string {
    const rarityMap = {
      bronze: 'Common',
      silver: 'Uncommon', 
      gold: 'Rare',
      diamond: 'Legendary'
    };
    return rarityMap[achievement.tier];
  }

  /**
   * Get achievement category color
   */
  static getCategoryColor(category: string): string {
    const colorMap = {
      borrower: 'bg-primary',
      lender: 'bg-blue-600',
      general: 'bg-green-600'
    };
    return colorMap[category as keyof typeof colorMap] || 'bg-gray-600';
  }
}