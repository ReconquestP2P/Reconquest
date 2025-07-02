import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SimpleSignupForm() {
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-center">Join the Waitlist</CardTitle>
      </CardHeader>
      <CardContent>
        <form action="/api/signups" method="POST" className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">Email *</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="your@email.com"
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">Name (Optional)</label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Your name"
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="interest" className="text-sm font-medium">I'm interested in *</label>
            <select 
              id="interest" 
              name="interest" 
              required
              className="w-full p-2 border border-gray-300 rounded-md bg-white"
            >
              <option value="borrower">Borrowing with Bitcoin collateral</option>
              <option value="lender">Lending to earn yield</option>
              <option value="both">Both borrowing and lending</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="message" className="text-sm font-medium">Message (Optional)</label>
            <textarea
              id="message"
              name="message"
              placeholder="Tell us about your use case or any questions..."
              rows={3}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>

          <Button 
            type="submit" 
            className="w-full bg-primary hover:bg-primary/90 text-black"
          >
            Join Waitlist
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}