import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: string | number, currency: string = "USD"): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency === "USDC" ? "USD" : currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatBTC(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return `${num.toFixed(8)} BTC`;
}

export function formatPercentage(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return `${num.toFixed(1)}%`;
}

export function calculateCollateral(loanAmount: number, btcPrice: number): number {
  return (loanAmount * 2) / btcPrice;
}

export function calculateLTV(loanAmount: number, collateralValue: number): number {
  return (loanAmount / collateralValue) * 100;
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function getDaysUntil(date: string | Date): number {
  const target = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffTime = target.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
