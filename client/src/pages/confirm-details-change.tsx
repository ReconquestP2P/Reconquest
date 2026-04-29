import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function ConfirmDetailsChange() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const confirmChanges = async () => {
      const token = new URLSearchParams(window.location.search).get("token");
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
      } catch {
        setStatus("error");
        setMessage("An error occurred. Please try again later.");
      }
    };
    confirmChanges();
  }, []);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-lg p-8 text-center space-y-6">
        <div className="space-y-3">
          <div className="mx-auto w-12 h-12 flex items-center justify-center">
            {status === "loading" && <Loader2 className="h-8 w-8 animate-spin text-[#f97316]" />}
            {status === "success" && <CheckCircle className="h-8 w-8 text-green-500" />}
            {status === "error" && <XCircle className="h-8 w-8 text-red-500" />}
          </div>
          <h2 className="text-2xl font-bold text-white">
            {status === "loading" ? "Confirming Changes..." : status === "success" ? "Changes Confirmed!" : "Confirmation Failed"}
          </h2>
          <p className="text-neutral-400 text-sm">{message || "Processing your request..."}</p>
        </div>
        {status !== "loading" && (
          <Button
            onClick={() => setLocation("/my-account")}
            className="w-full bg-[#f97316] hover:bg-[#ea580c] text-white rounded-none h-11 border-0"
            data-testid="button-go-to-account"
          >
            Go to My Account
          </Button>
        )}
      </div>
    </div>
  );
}
