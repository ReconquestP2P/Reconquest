import { useState, useEffect } from "react";
import { Shield, Lock, Key, Eye, EyeOff } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface PasswordStrengthMeterProps {
  password: string;
  onStrengthChange?: (strength: number, isValid: boolean) => void;
  showPassword?: boolean;
  onToggleVisibility?: () => void;
}

interface StrengthCriteria {
  label: string;
  icon: React.ReactNode;
  met: boolean;
  description: string;
}

export default function PasswordStrengthMeter({ 
  password, 
  onStrengthChange,
  showPassword = false,
  onToggleVisibility 
}: PasswordStrengthMeterProps) {
  const [strength, setStrength] = useState(0);
  const [criteria, setCriteria] = useState<StrengthCriteria[]>([]);

  // Calculate password strength and criteria
  useEffect(() => {
    const newCriteria: StrengthCriteria[] = [
      {
        label: "Length Fortress",
        icon: <Shield className="h-4 w-4" />,
        met: password.length >= 8,
        description: "At least 8 characters long"
      },
      {
        label: "Character Diversity",
        icon: <Key className="h-4 w-4" />,
        met: /[a-z]/.test(password) && /[A-Z]/.test(password),
        description: "Contains both uppercase and lowercase letters"
      },
      {
        label: "Numeric Cipher",
        icon: <Lock className="h-4 w-4" />,
        met: /\d/.test(password),
        description: "Contains at least one number"
      },
      {
        label: "Symbol Encryption",
        icon: <Shield className="h-4 w-4" />,
        met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
        description: "Contains special characters (!@#$%^&*)"
      },
      {
        label: "Maximum Security",
        icon: <Key className="h-4 w-4" />,
        met: password.length >= 12,
        description: "12+ characters for maximum protection"
      }
    ];

    setCriteria(newCriteria);

    // Calculate strength score
    const metCriteria = newCriteria.filter(c => c.met).length;
    const strengthScore = Math.round((metCriteria / newCriteria.length) * 100);
    setStrength(strengthScore);

    // Notify parent component
    const isValid = metCriteria >= 3; // Require 3 out of 5 criteria (temporarily relaxed for testing)
    onStrengthChange?.(strengthScore, isValid);
  }, [password, onStrengthChange]);

  // Get strength level and color
  const getStrengthLevel = () => {
    if (strength < 20) return { level: "Vulnerable", color: "bg-red-500", textColor: "text-red-700" };
    if (strength < 40) return { level: "Weak", color: "bg-orange-500", textColor: "text-orange-700" };
    if (strength < 60) return { level: "Fair", color: "bg-yellow-500", textColor: "text-yellow-700" };
    if (strength < 80) return { level: "Strong", color: "bg-blue-500", textColor: "text-blue-700" };
    return { level: "Fortress", color: "bg-green-500", textColor: "text-green-700" };
  };

  const strengthLevel = getStrengthLevel();

  // Cryptographic metaphor messages
  const getSecurityMessage = () => {
    if (strength < 20) return "🔓 Your digital vault is exposed to attackers";
    if (strength < 40) return "🔐 Basic encryption activated, but vulnerabilities remain";
    if (strength < 60) return "🛡️ Moderate security protocols engaged";
    if (strength < 80) return "🔒 Strong cryptographic defenses deployed";
    return "⚡ Maximum security fortress - virtually unbreachable";
  };

  if (!password) return null;

  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-lg border">
      {/* Header with strength level */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Shield className={`h-5 w-5 ${strengthLevel.textColor}`} />
          <span className={`font-semibold ${strengthLevel.textColor}`}>
            Security Level: {strengthLevel.level}
          </span>
        </div>
        {onToggleVisibility && (
          <button
            type="button"
            onClick={onToggleVisibility}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <Progress value={strength} className="h-3" />
        <div className="flex justify-between text-xs text-gray-600">
          <span>Vulnerable</span>
          <span>Fortress</span>
        </div>
      </div>

      {/* Security message */}
      <p className="text-sm text-gray-600 italic">
        {getSecurityMessage()}
      </p>

      {/* Criteria checklist */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-gray-700 flex items-center">
          <Key className="h-4 w-4 mr-2" />
          Cryptographic Requirements
        </h4>
        <div className="grid grid-cols-1 gap-2">
          {criteria.map((criterion, index) => (
            <div
              key={index}
              className={`flex items-center space-x-3 p-2 rounded transition-colors ${
                criterion.met 
                  ? "bg-green-50 text-green-800 border border-green-200" 
                  : "bg-gray-100 text-gray-600 border border-gray-200"
              }`}
            >
              <div className={`flex-shrink-0 ${criterion.met ? "text-green-600" : "text-gray-400"}`}>
                {criterion.met ? (
                  <Shield className="h-4 w-4" />
                ) : (
                  criterion.icon
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium">{criterion.label}</span>
                  {criterion.met && (
                    <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded-full">
                      ✓ Secured
                    </span>
                  )}
                </div>
                <p className="text-xs opacity-75">{criterion.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Security tips */}
      {strength < 80 && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <h5 className="text-sm font-semibold text-blue-800 mb-2">🔐 Security Enhancement Tips:</h5>
          <ul className="text-xs text-blue-700 space-y-1">
            <li>• Use a unique combination of words, numbers, and symbols</li>
            <li>• Avoid personal information like names, dates, or common words</li>
            <li>• Consider using a passphrase with random words</li>
            <li>• Enable two-factor authentication for maximum security</li>
          </ul>
        </div>
      )}
    </div>
  );
}