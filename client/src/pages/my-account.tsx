import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { User, CreditCard, Phone, Save, Bitcoin } from "lucide-react";

export default function MyAccount() {
  const { user, isAuthenticated, token } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    phonePrefix: user?.phonePrefix || "+34",
    phoneNumber: user?.phoneNumber || "",
    iban: user?.iban || "",
    bankAccountHolder: user?.bankAccountHolder || "",
    btcAddress: user?.btcAddress || "",
  });

  if (!isAuthenticated || !user) {
    navigate("/login");
    return null;
  }

  const updateProfile = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update profile");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Profile Updated",
        description: "Your account details have been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate(formData);
  };

  const handleChange = (field: keyof typeof formData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const phonePrefixes = [
    { value: "+1", label: "🇺🇸 +1" },
    { value: "+34", label: "🇪🇸 +34" },
    { value: "+44", label: "🇬🇧 +44" },
    { value: "+49", label: "🇩🇪 +49" },
    { value: "+33", label: "🇫🇷 +33" },
    { value: "+39", label: "🇮🇹 +39" },
    { value: "+351", label: "🇵🇹 +351" },
    { value: "+31", label: "🇳🇱 +31" },
    { value: "+41", label: "🇨🇭 +41" },
    { value: "+43", label: "🇦🇹 +43" },
    { value: "+32", label: "🇧🇪 +32" },
    { value: "+352", label: "🇱🇺 +352" },
    { value: "+353", label: "🇮🇪 +353" },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <User className="h-8 w-8 text-primary" />
            My Account
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your personal information and bank details
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
              <CardDescription>
                Your name and contact details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    placeholder="John"
                    value={formData.firstName}
                    onChange={handleChange("firstName")}
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    value={formData.lastName}
                    onChange={handleChange("lastName")}
                    data-testid="input-last-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={user.username}
                  disabled
                  className="bg-muted"
                  data-testid="input-username"
                />
                <p className="text-xs text-muted-foreground">Username cannot be changed</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={user.email}
                  disabled
                  className="bg-muted"
                  data-testid="input-email"
                />
                <p className="text-xs text-muted-foreground">Contact support to change email</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="flex gap-2">
                  <select
                    value={formData.phonePrefix}
                    onChange={(e) => setFormData((prev) => ({ ...prev, phonePrefix: e.target.value }))}
                    className="flex h-10 w-28 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    data-testid="select-phone-prefix"
                  >
                    {phonePrefixes.map((prefix) => (
                      <option key={prefix.value} value={prefix.value}>
                        {prefix.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    id="phone"
                    placeholder="612345678"
                    value={formData.phoneNumber}
                    onChange={handleChange("phoneNumber")}
                    className="flex-1"
                    data-testid="input-phone-number"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Bank Details
              </CardTitle>
              <CardDescription>
                Your bank account for receiving loan funds. This information will be shared with lenders when you borrow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bankAccountHolder">Account Holder Name</Label>
                <Input
                  id="bankAccountHolder"
                  placeholder="John Doe"
                  value={formData.bankAccountHolder}
                  onChange={handleChange("bankAccountHolder")}
                  data-testid="input-bank-account-holder"
                />
                <p className="text-xs text-muted-foreground">
                  Full name as it appears on your bank account
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="iban">IBAN</Label>
                <Input
                  id="iban"
                  placeholder="ES00 0000 0000 0000 0000 0000"
                  value={formData.iban}
                  onChange={handleChange("iban")}
                  className="font-mono"
                  data-testid="input-iban"
                />
                <p className="text-xs text-muted-foreground">
                  International Bank Account Number (for European banks)
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bitcoin className="h-5 w-5 text-orange-500" />
                Bitcoin Address
              </CardTitle>
              <CardDescription>
                Your Bitcoin address for receiving collateral returns, recovery funds, and refunds.
                <span className="block mt-1 text-orange-600 dark:text-orange-400 font-medium">
                  Required for borrowers before generating a recovery plan.
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="btcAddress">BTC Address</Label>
                <Input
                  id="btcAddress"
                  placeholder="bc1q... or 3... or 1..."
                  value={formData.btcAddress}
                  onChange={handleChange("btcAddress")}
                  className="font-mono"
                  data-testid="input-btc-address"
                />
                <p className="text-xs text-muted-foreground">
                  Enter a valid Bitcoin address (mainnet or testnet). This is where your Bitcoin will be sent in case of loan completion, cancellation, or recovery.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => window.history.back()}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateProfile.isPending}
              data-testid="button-save-profile"
            >
              {updateProfile.isPending ? (
                "Saving..."
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
