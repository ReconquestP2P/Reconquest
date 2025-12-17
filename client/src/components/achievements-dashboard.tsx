import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AchievementBadge } from './achievement-badge';
import { AchievementUnlockAnimation } from './achievement-unlock-animation';
import { AchievementService } from '@/services/achievementService';
import { Achievement, UserAchievements } from '@/types/achievements';
import { achievementCategories } from '@/data/achievements';
import { Trophy, Target, Zap, Users, TrendingUp, History, CheckCircle, Euro, Bitcoin } from 'lucide-react';
import { formatCurrency, formatBTC, formatPercentage, formatDate } from '@/lib/utils';
import type { Loan, User } from '@shared/schema';

interface AchievementsDashboardProps {
  userId: number;
}

export function AchievementsDashboard({ userId }: AchievementsDashboardProps) {
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [showUnlockAnimation, setShowUnlockAnimation] = useState(false);

  // Fetch user data and loans with proper typing
  const { data: user } = useQuery<User>({
    queryKey: [`/api/users/${userId}`],
  });

  const { data: userLoans = [] } = useQuery<Loan[]>({
    queryKey: [`/api/users/${userId}/loans`],
  });

  // Calculate achievements
  const userAchievements = user && userLoans 
    ? AchievementService.calculateUserAchievements(user, userLoans)
    : null;

  const stats = userAchievements ? AchievementService.getAchievementStats(userAchievements) : null;

  // Filter completed loans for track record (safely handle data)
  const loansArray = Array.isArray(userLoans) ? userLoans : [];
  const completedLoans = loansArray.filter(loan => loan.status === 'completed');
  const borrowerCompletedLoans = completedLoans.filter(loan => loan.borrowerId === userId);
  const lenderCompletedLoans = completedLoans.filter(loan => loan.lenderId === userId);
  
  // Calculate track record stats with safe parsing
  const safeParseFloat = (val: any): number => {
    const parsed = parseFloat(String(val));
    return isNaN(parsed) ? 0 : parsed;
  };
  
  const totalBorrowedCompleted = borrowerCompletedLoans.reduce((sum, loan) => sum + safeParseFloat(loan.amount), 0);
  const totalLentCompleted = lenderCompletedLoans.reduce((sum, loan) => sum + safeParseFloat(loan.amount), 0);
  const totalInterestPaid = borrowerCompletedLoans.reduce((sum, loan) => {
    const principal = safeParseFloat(loan.amount);
    const rate = safeParseFloat(loan.interestRate) / 100;
    const months = loan.termMonths || 0;
    return sum + (principal * rate * months / 12);
  }, 0);
  const totalInterestEarned = lenderCompletedLoans.reduce((sum, loan) => {
    const principal = safeParseFloat(loan.amount);
    const rate = safeParseFloat(loan.interestRate) / 100;
    const months = loan.termMonths || 0;
    return sum + (principal * rate * months / 12);
  }, 0);

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
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="borrower">Borrower</TabsTrigger>
          <TabsTrigger value="lender">Lender</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1">
            <History className="h-3 w-3" />
            Track Record
          </TabsTrigger>
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

        {/* Track Record / Loan History Tab */}
        <TabsContent value="history" className="space-y-6">
          {/* Track Record Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Completed Loans</p>
                    <p className="text-2xl font-bold text-green-600" data-testid="text-completed-loans-count">{completedLoans.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Euro className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Borrowed</p>
                    <p className="text-2xl font-bold text-blue-600" data-testid="text-total-borrowed">{formatCurrency(totalBorrowedCompleted, 'EUR')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Lent</p>
                    <p className="text-2xl font-bold text-purple-600" data-testid="text-total-lent">{formatCurrency(totalLentCompleted, 'EUR')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {lenderCompletedLoans.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Interest Earned</p>
                      <p className="text-2xl font-bold text-green-600" data-testid="text-interest-earned">{formatCurrency(totalInterestEarned, 'EUR')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {borrowerCompletedLoans.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <Bitcoin className="h-5 w-5 text-red-500" />
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Interest Paid</p>
                      <p className="text-2xl font-bold text-red-500" data-testid="text-interest-paid">{formatCurrency(totalInterestPaid, 'EUR')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Borrower History */}
          {borrowerCompletedLoans.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <History className="h-5 w-5 text-blue-600" />
                  <span>Borrowing History</span>
                  <Badge variant="secondary">{borrowerCompletedLoans.length} completed</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loan ID</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Collateral</TableHead>
                      <TableHead>Term</TableHead>
                      <TableHead>Interest Rate</TableHead>
                      <TableHead>Interest Paid</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {borrowerCompletedLoans.map(loan => {
                      const amount = safeParseFloat(loan.amount);
                      const rate = safeParseFloat(loan.interestRate);
                      const interest = amount * (rate / 100) * ((loan.termMonths || 0) / 12);
                      return (
                        <TableRow key={loan.id} data-testid={`row-borrower-history-${loan.id}`}>
                          <TableCell className="font-mono">#{loan.id}</TableCell>
                          <TableCell>{formatCurrency(amount, loan.currency)}</TableCell>
                          <TableCell>{formatBTC(safeParseFloat(loan.collateralBtc))}</TableCell>
                          <TableCell>{loan.termMonths} months</TableCell>
                          <TableCell>{formatPercentage(rate)}</TableCell>
                          <TableCell className="text-red-600">{formatCurrency(interest, loan.currency)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Completed
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Lender History */}
          {lenderCompletedLoans.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <History className="h-5 w-5 text-purple-600" />
                  <span>Lending History</span>
                  <Badge variant="secondary">{lenderCompletedLoans.length} completed</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loan ID</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Term</TableHead>
                      <TableHead>Interest Rate</TableHead>
                      <TableHead>Interest Earned</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lenderCompletedLoans.map(loan => {
                      const amount = safeParseFloat(loan.amount);
                      const rate = safeParseFloat(loan.interestRate);
                      const interest = amount * (rate / 100) * ((loan.termMonths || 0) / 12);
                      return (
                        <TableRow key={loan.id} data-testid={`row-lender-history-${loan.id}`}>
                          <TableCell className="font-mono">#{loan.id}</TableCell>
                          <TableCell>{formatCurrency(amount, loan.currency)}</TableCell>
                          <TableCell>{loan.termMonths} months</TableCell>
                          <TableCell>{formatPercentage(rate)}</TableCell>
                          <TableCell className="text-green-600">{formatCurrency(interest, loan.currency)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Completed
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {completedLoans.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center">
                <History className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-300 mb-2">No Completed Loans Yet</h3>
                <p className="text-gray-500 dark:text-gray-400">
                  Your completed loans will appear here as part of your track record.
                  Complete a loan to start building your reputation!
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
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