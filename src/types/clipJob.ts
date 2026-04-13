export interface ClipJobData {
  jobId: string;
  tempFilePath: string;
  mimeType: string;
  prompt: string;
  ratio: string;
  cleanupDir?: string;
}