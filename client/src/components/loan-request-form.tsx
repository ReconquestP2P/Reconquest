import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const loanRequestSchema = z.object({
  amount: z.string().min(1, "Amount is required"),
  currency: z.string().min(1, "Currency is required"),
  interestRate: z.string().min(1, "Interest rate is required"),
  termMonths: z.number().min(3).max(18),
  purpose: z.string().optional(),
});

type LoanRequestForm = z.infer<typeof loanRequestSchema>;

export default function LoanRequestForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<LoanRequestForm>({
    resolver: zodResolver(loanRequestSchema),
    defaultValues: {
      amount: "",
      currency: "USDC",
      interestRate: "",
      termMonths: 6,
      purpose: "",
    },
  });

  const createLoan = useMutation({
    mutationFn: async (data: LoanRequestForm) => {
      const response = await apiRequest("POST", "/api/loans", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Loan Request Submitted",
        description: "Your loan request has been created and is now visible to lenders.",
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to submit loan request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LoanRequestForm) => {
    createLoan.mutate(data);
  };

  return (
    <Card className="border-gray-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-900">
          Request New Loan
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loan Amount</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input placeholder="25000" {...field} className="pr-20" />
                      </FormControl>
                      <FormField
                        control={form.control}
                        name="currency"
                        render={({ field: currencyField }) => (
                          <Select
                            value={currencyField.value}
                            onValueChange={currencyField.onChange}
                          >
                            <SelectTrigger className="absolute right-1 top-1 w-20 h-8 border-0 bg-transparent">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USDC">USDC</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                              <SelectItem value="CHF">CHF</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="termMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loan Term</FormLabel>
                    <Select
                      value={field.value.toString()}
                      onValueChange={(value) => field.onChange(parseInt(value))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="3">3 months</SelectItem>
                        <SelectItem value="6">6 months</SelectItem>
                        <SelectItem value="12">12 months</SelectItem>
                        <SelectItem value="18">18 months</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="interestRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Interest Rate Preference (% p.a.)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="8.0"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <Label className="text-sm font-medium text-gray-700">
                  Required Collateral (Est.)
                </Label>
                <div className="mt-1 bg-gray-50 px-4 py-3 rounded-lg">
                  <span className="text-lg font-semibold text-gray-900">
                    {form.watch("amount") && !isNaN(parseFloat(form.watch("amount")))
                      ? `${((parseFloat(form.watch("amount")) * 2) / 67245).toFixed(8)} BTC`
                      : "0.00000000 BTC"}
                  </span>
                  <p className="text-xs text-gray-500">2:1 collateral ratio (50% LTV)</p>
                </div>
              </div>
            </div>

            <FormField
              control={form.control}
              name="purpose"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Loan Purpose (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the purpose of your loan..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-black"
              disabled={createLoan.isPending}
            >
              {createLoan.isPending ? "Submitting..." : "Submit Loan Request"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
