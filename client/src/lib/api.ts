import { apiRequest } from "./queryClient";

export interface UploadResponse {
  id: number;
  filename: string;
  status: string;
}

export interface VerificationResponse {
  id: number;
  result: 'genuine' | 'suspicious' | 'fake';
  confidence: number;
  details: any;
}

export interface StatsResponse {
  trustedPatterns: number;
  verificationsToday: number;
  suspiciousDocs: number;
  successRate: string;
}

export const api = {
  async uploadTrustedPattern(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiRequest('POST', '/api/admin/upload-pattern', formData);
    return response.json();
  },

  async verifyDocument(file: File): Promise<VerificationResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiRequest('POST', '/api/verify', formData);
    return response.json();
  },

  async getStats(): Promise<StatsResponse> {
    const response = await apiRequest('GET', '/api/stats');
    return response.json();
  },

  async getTrustedPatterns(): Promise<any[]> {
    const response = await apiRequest('GET', '/api/trusted-patterns');
    return response.json();
  },

  async getRecentActivity(): Promise<any[]> {
    const response = await apiRequest('GET', '/api/admin/recent-activity');
    return response.json();
  },

  async deleteTrustedPattern(id: number): Promise<void> {
    await apiRequest('DELETE', `/api/admin/trusted-patterns/${id}`);
  }
};
