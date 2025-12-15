import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function ConfirmDetailsChange() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const confirmChanges = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");

      if (!token) {
        setStatus("error");
        setMessage("Invalid confirmation link. No token provided.");
        return;
      }

      try {
        const response = await fetch("/api/auth/confirm-details-change", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          setStatus("success");
          setMessage(data.message || "Your personal details have been updated successfully!");
        } else {
          setStatus("error");
          setMessage(data.message || "Failed to confirm changes. Please try again.");
        }
      } catch (error) {
        setStatus("error");
        setMessage("An error occurred. Please try again later.");
      }
    };

    confirmChanges();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            {status === "loading" && <Loader2 className="h-6 w-6 animate-spin text-blue-500" />}
            {status === "success" && <CheckCircle className="h-6 w-6 text-green-500" />}
            {status === "error" && <XCircle className="h-6 w-6 text-red-500" />}
            {status === "loading" ? "Confirming Changes..." : status === "success" ? "Changes Confirmed!" : "Confirmation Failed"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">{message || "Processing your request..."}</p>
          
          {status !== "loading" && (
            <Button 
              onClick={() => setLocation("/my-account")}
              className="w-full"
              data-testid="button-go-to-account"
            >
              Go to My Account
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
