import { toast } from 'sonner';

interface RequestOptions extends RequestInit {
  params?: Record<string, string>;
}

const BASE_URL = '/api';

class ApiClient {
  private getHeaders(): Record<string, string> {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      'X-Tenant-Id': '1', // Default tenant ID
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { params, headers: customHeaders, ...customConfig } = options;
    
    let url = `${BASE_URL}${endpoint}`;
    if (params) {
      const queryString = new URLSearchParams(params).toString();
      url += `?${queryString}`;
    }

    const headers = {
      ...this.getHeaders(),
      ...(customHeaders as Record<string, string>),
    };

    if (customConfig.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    const config: RequestInit = {
      ...customConfig,
      headers,
    };

    try {
      const response = await fetch(url, config);
      
      // Use text() first to safely handle empty responses or non-JSON errors
      const text = await response.text();
      let result;
      try {
        result = text ? JSON.parse(text) : {};
      } catch (e) {
        console.warn('Response is not JSON:', text);
        result = { msg: text || response.statusText, code: -1 };
      }

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('adminUser');
          window.location.href = '/login';
          throw new Error('会话已过期，请重新登录');
        }
        const errorMessage = (result && result.msg) || '请求失败';
        throw new Error(errorMessage);
      }

      // Handle unified Result<T> format
      if (result && typeof result === 'object' && 'code' in result) {
        if (result.code === 0) {
          return result.data as T;
        } else {
          throw new Error(result.msg || '业务处理失败');
        }
      }

      // Fallback for endpoints not yet using Result<T> (if any)
      return result as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : '网络错误';
      toast.error(message);
      throw error;
    }
  }

  get<T>(endpoint: string, params?: Record<string, string>) {
    return this.request<T>(endpoint, { method: 'GET', params });
  }

  post<T>(endpoint: string, body: unknown) {
    const isFormData = body instanceof FormData;
    return this.request<T>(endpoint, { 
      method: 'POST', 
      body: isFormData ? (body as FormData) : JSON.stringify(body) 
    });
  }

  put<T>(endpoint: string, body: unknown) {
    const isFormData = body instanceof FormData;
    return this.request<T>(endpoint, { 
      method: 'PUT', 
      body: isFormData ? (body as FormData) : JSON.stringify(body) 
    });
  }

  delete<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
