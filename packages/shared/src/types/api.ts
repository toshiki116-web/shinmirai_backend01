/** API成功レスポンス */
export interface ApiSuccessResponse<T = unknown> {
  result: 'ok';
  data: T;
  message: string;
}

/** APIエラーレスポンス */
export interface ApiErrorResponse {
  result: 'ng';
  error_code: string;
  message: string;
}

/** ページネーションされたレスポンス */
export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
