import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { FileText, Upload, Image, Download, User, Calendar, FileX } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface LoanDocument {
  id: number;
  loanId: number;
  uploadedBy: number;
  uploaderRole: 'borrower' | 'lender';
  fileName: string;
  fileType: 'pdf' | 'png' | 'jpg';
  fileSize: number;
  objectPath: string;
  description: string | null;
  uploadedAt: string;
  uploaderUsername: string;
}

interface LoanDocumentsProps {
  loanId: number;
  userRole: 'borrower' | 'lender' | 'admin';
  canUpload?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ fileType }: { fileType: string }) {
  if (fileType === 'pdf') {
    return <FileText className="h-5 w-5 text-red-500" />;
  }
  return <Image className="h-5 w-5 text-blue-500" />;
}

export function LoanDocuments({ loanId, userRole, canUpload = true }: LoanDocumentsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const { data: documentsData, isLoading } = useQuery<{ documents: LoanDocument[] }>({
    queryKey: ['/api/loans', loanId, 'documents'],
  });

  const documents = documentsData?.documents || [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Only PDF, PNG, and JPG files are allowed.",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "Maximum file size is 10MB.",
      });
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      const response = await apiRequest(`/api/loans/${loanId}/documents/request-upload`, "POST", {
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        contentType: selectedFile.type,
        description: description || null,
      }) as unknown as { uploadURL: string; objectPath: string; metadata: { fileType: string } };

      await fetch(response.uploadURL, {
        method: "PUT",
        body: selectedFile,
        headers: {
          "Content-Type": selectedFile.type,
        },
      });

      await apiRequest(`/api/loans/${loanId}/documents`, "POST", {
        fileName: selectedFile.name,
        fileType: response.metadata.fileType,
        fileSize: selectedFile.size,
        objectPath: response.objectPath,
        description: description || null,
      });

      toast({
        title: "Document uploaded",
        description: `${selectedFile.name} has been uploaded successfully.`,
      });

      queryClient.invalidateQueries({ queryKey: ['/api/loans', loanId, 'documents'] });
      setUploadDialogOpen(false);
      setSelectedFile(null);
      setDescription("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message || "Failed to upload document.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = useCallback((doc: LoanDocument) => {
    const objectPath = doc.objectPath.startsWith('/') ? doc.objectPath : `/${doc.objectPath}`;
    window.open(`/object-storage${objectPath}`, '_blank');
  }, []);

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Loan Documents
          </CardTitle>
          {canUpload && userRole !== 'admin' && (
            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="btn-upload-document">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Document
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Upload Document</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="file">Select File</Label>
                    <Input
                      id="file"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={handleFileChange}
                      data-testid="input-file-upload"
                    />
                    <p className="text-xs text-muted-foreground">
                      Accepted formats: PDF, PNG, JPG (max 10MB)
                    </p>
                  </div>
                  {selectedFile && (
                    <div className="p-3 bg-muted rounded-md flex items-center gap-2">
                      <FileIcon fileType={selectedFile.type.includes('pdf') ? 'pdf' : 'img'} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="description">Description (optional)</Label>
                    <Textarea
                      id="description"
                      placeholder="e.g., Bank transfer confirmation, Payment screenshot..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      data-testid="input-document-description"
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleUpload}
                    disabled={!selectedFile || isUploading}
                    data-testid="btn-confirm-upload"
                  >
                    {isUploading ? "Uploading..." : "Upload Document"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <FileX className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No documents uploaded yet</p>
            {canUpload && userRole !== 'admin' && (
              <p className="text-xs mt-1">Upload bank transfer proofs or screenshots to share with the other party</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                data-testid={`document-item-${doc.id}`}
              >
                <FileIcon fileType={doc.fileType} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.fileName}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {doc.uploaderUsername}
                    </span>
                    <Badge variant={doc.uploaderRole === 'borrower' ? 'default' : 'secondary'} className="text-xs py-0 px-1.5">
                      {doc.uploaderRole}
                    </Badge>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(doc.uploadedAt)}
                    </span>
                    <span>{formatFileSize(doc.fileSize)}</span>
                  </div>
                  {doc.description && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{doc.description}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(doc)}
                  data-testid={`btn-download-${doc.id}`}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function LoanDocumentsCompact({ loanId, userRole }: { loanId: number; userRole: 'borrower' | 'lender' | 'admin' }) {
  const { data: documentsData } = useQuery<{ documents: LoanDocument[] }>({
    queryKey: ['/api/loans', loanId, 'documents'],
  });

  const count = documentsData?.documents?.length || 0;

  if (count === 0) return null;

  return (
    <Badge variant="outline" className="text-xs">
      <FileText className="h-3 w-3 mr-1" />
      {count} doc{count !== 1 ? 's' : ''}
    </Badge>
  );
}
