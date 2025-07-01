import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Signup } from "@shared/schema";

export default function AdminSignups() {
  const { data: signups, isLoading, error } = useQuery<Signup[]>({
    queryKey: ["/api/admin/signups"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">Loading signups...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-red-600">Error loading signups</div>
        </div>
      </div>
    );
  }

  const getInterestBadgeColor = (interest: string) => {
    switch (interest) {
      case "borrower":
        return "bg-blue-100 text-blue-800";
      case "lender":
        return "bg-green-100 text-green-800";
      case "both":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">User Signups</h1>
          <p className="text-gray-600 mt-2">
            Total signups: {signups?.length || 0}
          </p>
        </div>

        <div className="grid gap-6">
          {signups?.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-500">No signups yet.</p>
              </CardContent>
            </Card>
          ) : (
            signups?.map((signup) => (
              <Card key={signup.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">
                        {signup.name || "Anonymous"}
                      </CardTitle>
                      <p className="text-gray-600">{signup.email}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge className={getInterestBadgeColor(signup.interest)}>
                        {signup.interest === "borrower" && "Borrowing"}
                        {signup.interest === "lender" && "Lending"}
                        {signup.interest === "both" && "Both"}
                      </Badge>
                      <p className="text-sm text-gray-500">
                        {formatDate(signup.createdAt)}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                {signup.message && (
                  <CardContent>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-700">{signup.message}</p>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}