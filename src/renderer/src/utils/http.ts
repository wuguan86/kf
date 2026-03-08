import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { AppConfig } from '../config'
import { readAuthSnapshot, clearAuthSnapshot } from '../auth/authStore'

export interface Result<T = any> {
  code: number
  msg: string
  data: T
}

// Define a custom interface that overrides the return type to be Promise<R> (defaulting to T)
// This matches the behavior of the response interceptor which unwraps the data
export interface HttpInstance extends AxiosInstance {
  request<T = any, R = T, D = any>(config: AxiosRequestConfig<D>): Promise<R>
  get<T = any, R = T, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<R>
  delete<T = any, R = T, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<R>
  head<T = any, R = T, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<R>
  options<T = any, R = T, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<R>
  post<T = any, R = T, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R>
  put<T = any, R = T, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R>
  patch<T = any, R = T, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R>
  postForm<T = any, R = T, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R>
  putForm<T = any, R = T, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R>
  patchForm<T = any, R = T, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R>
}

const http = axios.create({
  baseURL: AppConfig.apiBaseUrl.replace(/\/api\/?$/, '').replace(/\/$/, ''),
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
}) as unknown as HttpInstance

// Request Interceptor
http.interceptors.request.use(
  (config) => {
    const { token, tenantId } = readAuthSnapshot()
    const storedBaseUrl = localStorage.getItem('backendBaseUrl')
    if (storedBaseUrl) {
      config.baseURL = storedBaseUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
    }
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    if (tenantId) {
      config.headers['X-Tenant-Id'] = tenantId
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response Interceptor
http.interceptors.response.use(
  (response: AxiosResponse<Result>) => {
    const res = response.data
    // If the response is not in unified format (e.g. raw string or non-standard JSON), try to handle it
    if (!res || typeof res !== 'object' || !('code' in res)) {
      // Fallback: assume it's data or raw response
      return response
    }

    if (res.code === 0) {
      // Unwrap data
      // Return the data part directly to the caller
      return res.data
    } else {
      // Business error
      return Promise.reject(new Error(res.msg || 'Error'))
    }
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      clearAuthSnapshot()
      window.location.hash = '#/login' // Simple redirect for hash router
    }
    return Promise.reject(error)
  }
)

export default http
