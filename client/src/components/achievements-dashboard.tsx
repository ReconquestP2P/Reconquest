import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { AchievementBadge } from './achievement-badge';
import { AchievementUnlockAnimation } from './achievement-unlock-animation';
import { AchievementService } from '@/services/achievementService';
import { Achievement, UserAchievements } from '@/types/achievements';
import { achievementCategories } from '@/data/achievements';
import { Trophy, Target, Zap, Users, TrendingUp } from 'lucide-react';

interface AchievementsDashboardProps {
  userId: number;
}

export function AchievementsDashboard({ userId }: AchievementsDashboardProps) {
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [showUnlockAnimation, setShowUnlockAnimation] = useState(false);

  // Fetch user data and loans
  const { data: user } = useQuery({
    queryKey: [`/api/users/${userId}`],
  });

  const { data: userLoans = [] } = useQuery({
    queryKey: [`/api/users/${userId}/loans`],
  });

  // Calculate achievements
  const userAchievements = user && userLoans 
    ? AchievementService.calculateUserAchievements(user, userLoans)
    : null;

  const stats = userAchievements ? AchievementService.getAchievementStats(userAchievements) : null;

  const handleAchievementClick = (achievement: Achievement) => {
    setSelectedAchievement(achievement);
    if (achievement.isUnlocked) {
      setShowUnlockAnimation(true);
    }
  };

  const handleCloseAnimation = () => {
    setShowUnlockAnimation(false);
    setSelectedAchievement(null);
  };

  if (!userAchievements || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading achievements...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Trophy className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Unlocked</p>
                <p className="text-2xl font-bold text-primary">{stats.totalUnlocked}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Target className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Completion</p>
                <p className="text-2xl font-bold text-blue-600">{stats.completionRate.toFixed(0)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Zap className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Next Milestone</p>
                <p className="text-sm font-bold text-green-600">
                  {userAchievements.nextMilestone?.name || 'Complete!'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Reputation</p>
                <p className="text-2xl font-bold text-purple-600">{user.reputation}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress to Next Milestone */}
      {userAchievements.nextMilestone && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5" />
              <span>Next Milestone</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{userAchievements.nextMilestone.name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {userAchievements.nextMilestone.description}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {userAchievements.nextMilestone.tier.toUpperCase()}
                </Badge>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>
                    {userAchievements.nextMilestone.progress} / {userAchievements.nextMilestone.maxProgress}
                  </span>
                </div>
                <Progress 
                  value={(userAchievements.nextMilestone.progress / userAchievements.nextMilestone.maxProgress) * 100} 
                  className="h-2"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Achievement Categories */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="borrower">Borrower</TabsTrigger>
          <TabsTrigger value="lender">Lender</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-6">
          {achievementCategories.map(category => (
            <Card key={category.id}>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <div className={`w-4 h-4 rounded-full ${category.color}`} />
                  <span>{category.name}</span>
                  <Badge variant="secondary">
                    {AchievementService.getAchievementsByCategory(userAchievements, category.id).filter(a => a.isUnlocked).length}/
                    {AchievementService.getAchievementsByCategory(userAchievements, category.id).length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {AchievementService.getAchievementsByCategory(userAchievements, category.id).map(achievement => (
                    <AchievementBadge
                      key={achievement.id}
                      achievement={achievement}
                      showProgress={true}
                      onClick={() => handleAchievementClick(achievement)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {['borrower', 'lender', 'general'].map(categoryId => (
          <TabsContent key={categoryId} value={categoryId}>
            <Card>
              <CardHeader>
                <CardTitle>
                  {achievementCategories.find(c => c.id === categoryId)?.name} Achievements
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {AchievementService.getAchievementsByCategory(userAchievements, categoryId).map(achievement => (
                    <AchievementBadge
                      key={achievement.id}
                      achievement={achievement}
                      showProgress={true}
                      onClick={() => handleAchievementClick(achievement)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Tier Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Achievement Tiers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.tierStats.map(tier => (
              <div key={tier.tier} className="text-center">
                <div className={`w-16 h-16 mx-auto mb-2 rounded-full flex items-center justify-center ${
                  tier.tier === 'bronze' ? 'bg-yellow-600' :
                  tier.tier === 'silver' ? 'bg-gray-400' :
                  tier.tier === 'gold' ? 'bg-yellow-400' :
                  'bg-gradient-to-br from-blue-400 to-purple-600'
                }`}>
                  <span className="text-white font-bold text-lg">
                    {tier.unlocked}
                  </span>
                </div>
                <p className="font-semibold capitalize">{tier.tier}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {tier.unlocked} / {tier.total}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Achievement Unlock Animation */}
      {selectedAchievement && (
        <AchievementUnlockAnimation
          achievement={selectedAchievement}
          isVisible={showUnlockAnimation}
          onClose={handleCloseAnimation}
        />
      )}
    </div>
  );
}