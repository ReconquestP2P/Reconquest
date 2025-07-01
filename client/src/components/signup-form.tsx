import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { insertSignupSchema } from "@shared/schema";
import { z } from "zod";

type SignupForm = z.infer<typeof insertSignupSchema>;

export default function SignupForm() {
  const { toast } = useToast();
  const [formData, setFormData] = useState<SignupForm>({
    email: "",
    name: "",
    interest: "borrower",
    message: "",
  });

  const mutation = useMutation({
    mutationFn: async (data: SignupForm) => {
      return await apiRequest("/api/signups", "POST", data);
    },
    onSuccess: () => {
      toast({
        title: "Thank you for your interest!",
        description: "We've received your information and will be in touch soon.",
      });
      setFormData({
        email: "",
        name: "",
        interest: "borrower",
        message: "",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to submit your information. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  const handleChange = (field: keyof SignupForm, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-center">Join the Waitlist</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="your@email.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name (Optional)</Label>
            <Input
              id="name"
              type="text"
              value={formData.name || ""}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="Your name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="interest">I'm interested in *</Label>
            <Select value={formData.interest} onValueChange={(value) => handleChange("interest", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select your interest" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="borrower">Borrowing with Bitcoin collateral</SelectItem>
                <SelectItem value="lender">Lending to earn yield</SelectItem>
                <SelectItem value="both">Both borrowing and lending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message (Optional)</Label>
            <Textarea
              id="message"
              value={formData.message || ""}
              onChange={(e) => handleChange("message", e.target.value)}
              placeholder="Tell us about your use case or any questions..."
              rows={3}
            />
          </div>

          <Button 
            type="submit" 
            className="w-full bg-primary hover:bg-primary/90 text-black"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Submitting..." : "Join Waitlist"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}