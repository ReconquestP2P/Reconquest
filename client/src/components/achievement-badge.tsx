import { Achievement } from '@/types/achievements';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface AchievementBadgeProps {
  achievement: Achievement;
  showProgress?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

export function AchievementBadge({ 
  achievement, 
  showProgress = false, 
  size = 'md',
  onClick 
}: AchievementBadgeProps) {
  const tierColors = {
    bronze: 'from-yellow-600 to-yellow-800',
    silver: 'from-gray-400 to-gray-600',
    gold: 'from-yellow-400 to-yellow-600',
    diamond: 'from-blue-400 to-purple-600'
  };

  const tierBorderColors = {
    bronze: 'border-yellow-600',
    silver: 'border-gray-400',
    gold: 'border-yellow-400',
    diamond: 'border-blue-400'
  };

  const sizeClasses = {
    sm: 'w-16 h-20 p-2',
    md: 'w-24 h-32 p-3',
    lg: 'w-32 h-40 p-4'
  };

  const iconSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl'
  };

  return (
    <Card 
      className={cn(
        'relative cursor-pointer transition-all duration-300 hover:scale-105',
        sizeClasses[size],
        achievement.isUnlocked 
          ? `border-2 ${tierBorderColors[achievement.tier]} bg-gradient-to-br ${tierColors[achievement.tier]} text-white shadow-lg`
          : 'border-2 border-gray-300 bg-gray-100 text-gray-400 grayscale'
      )}
      onClick={onClick}
    >
      <CardContent className="p-0 flex flex-col items-center justify-center h-full text-center">
        {achievement.isUnlocked && (
          <div className="absolute -top-2 -right-2 w-4 h-4 bg-green-500 rounded-full animate-pulse shadow-lg" />
        )}
        
        <div className={cn('mb-1', iconSizes[size])}>
          {achievement.icon}
        </div>
        
        <div className="text-xs font-bold mb-1 leading-tight">
          {achievement.name}
        </div>
        
        <Badge 
          variant="secondary" 
          className={cn(
            'text-xs px-1 py-0',
            achievement.isUnlocked 
              ? 'bg-white/20 text-white' 
              : 'bg-gray-200 text-gray-500'
          )}
        >
          {achievement.tier.toUpperCase()}
        </Badge>
        
        {showProgress && !achievement.isUnlocked && (
          <div className="mt-2 w-full">
            <Progress 
              value={(achievement.progress / achievement.maxProgress) * 100} 
              className="h-1"
            />
            <div className="text-xs mt-1 text-gray-600">
              {achievement.progress}/{achievement.maxProgress}
            </div>
          </div>
        )}
        
        {achievement.blockchain?.txHash && (
          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-orange-500 rounded-full animate-pulse" 
               title="Blockchain Verified" />
        )}
      </CardContent>
    </Card>
  );
}