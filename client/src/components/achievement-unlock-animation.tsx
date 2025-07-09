import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Achievement } from '@/types/achievements';
import { AchievementBadge } from './achievement-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, X } from 'lucide-react';

interface AchievementUnlockAnimationProps {
  achievement: Achievement;
  isVisible: boolean;
  onClose: () => void;
}

export function AchievementUnlockAnimation({ 
  achievement, 
  isVisible, 
  onClose 
}: AchievementUnlockAnimationProps) {
  const [showConfetti, setShowConfetti] = useState(false);
  const [showBlockchain, setShowBlockchain] = useState(false);

  useEffect(() => {
    if (isVisible) {
      const confettiTimer = setTimeout(() => setShowConfetti(true), 500);
      const blockchainTimer = setTimeout(() => setShowBlockchain(true), 1000);
      
      return () => {
        clearTimeout(confettiTimer);
        clearTimeout(blockchainTimer);
      };
    }
  }, [isVisible]);

  const confettiItems = Array.from({ length: 50 }, (_, i) => (
    <motion.div
      key={i}
      className="absolute w-2 h-2 bg-primary rounded-full"
      initial={{ 
        x: Math.random() * 400 - 200,
        y: -50,
        opacity: 0,
        scale: 0
      }}
      animate={{
        y: 600,
        opacity: [0, 1, 0],
        scale: [0, 1, 0],
        rotate: Math.random() * 360
      }}
      transition={{
        duration: 3,
        delay: Math.random() * 0.5,
        ease: "easeOut"
      }}
    />
  ));

  const blockchainBlocks = Array.from({ length: 5 }, (_, i) => (
    <motion.div
      key={i}
      className="w-8 h-8 bg-blue-500 border-2 border-blue-700 rounded-sm flex items-center justify-center text-white text-xs font-bold"
      initial={{ x: -100, opacity: 0 }}
      animate={{ 
        x: i * 50,
        opacity: 1,
        scale: [1, 1.1, 1]
      }}
      transition={{
        duration: 0.5,
        delay: i * 0.1,
        scale: {
          duration: 0.3,
          delay: i * 0.1 + 0.5,
          repeat: Infinity,
          repeatType: "reverse"
        }
      }}
    >
      {i + 1}
    </motion.div>
  ));

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="relative"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 180 }}
            transition={{ 
              type: "spring", 
              stiffness: 260, 
              damping: 20 
            }}
          >
            <Card className="w-96 bg-gradient-to-br from-primary/10 to-secondary/10 border-2 border-primary/20 shadow-2xl">
              <CardHeader className="text-center relative">
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute -top-2 -right-2 w-8 h-8 p-0 hover:bg-red-500 hover:text-white"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </Button>
                
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.3, type: "spring" }}
                >
                  <Sparkles className="h-8 w-8 text-primary mx-auto mb-2" />
                </motion.div>
                
                <CardTitle className="text-2xl font-bold text-primary">
                  Achievement Unlocked!
                </CardTitle>
              </CardHeader>
              
              <CardContent className="text-center space-y-4">
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.5, type: "spring" }}
                  className="flex justify-center"
                >
                  <AchievementBadge achievement={achievement} size="lg" />
                </motion.div>
                
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.7 }}
                >
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    {achievement.name}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 mt-2">
                    {achievement.description}
                  </p>
                </motion.div>
                
                {showBlockchain && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gray-900 dark:bg-gray-800 rounded-lg p-4 text-white"
                  >
                    <p className="text-sm font-semibold mb-2">Blockchain Verification</p>
                    <div className="flex justify-center space-x-2 mb-2">
                      {blockchainBlocks}
                    </div>
                    <p className="text-xs text-gray-300">
                      Achievement verified on Bitcoin testnet
                    </p>
                  </motion.div>
                )}
                
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 1 }}
                >
                  <Button 
                    onClick={onClose}
                    className="w-full bg-primary hover:bg-primary/90"
                  >
                    Awesome!
                  </Button>
                </motion.div>
              </CardContent>
            </Card>
          </motion.div>
          
          {showConfetti && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {confettiItems}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}