import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-lg p-8 text-center space-y-6">
        <div className="space-y-3">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
          <h1 className="text-2xl font-bold text-white">404 — Page Not Found</h1>
          <p className="text-sm text-neutral-400">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
        <Link href="/">
          <Button className="bg-[#f97316] hover:bg-[#ea580c] text-white rounded-none h-11 border-0 w-full">
            Back to Homepage
          </Button>
        </Link>
      </div>
    </div>
  );
}
