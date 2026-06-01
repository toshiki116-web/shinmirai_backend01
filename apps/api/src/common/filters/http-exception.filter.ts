import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * 全HTTPエラーレスポンスを仕様書の統一形式に変換するフィルター
 * { result: "ng", error_code: "XXXX", message: "..." }
 */
@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '内部サーバーエラーが発生しました';
    let errorCode = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const res = exceptionResponse as Record<string, unknown>;
        message = (res['message'] as string) || exception.message;
        errorCode = (res['error_code'] as string) || this.statusToErrorCode(status);

        // class-validatorのバリデーションエラー配列を文字列に変換
        if (Array.isArray(res['message'])) {
          message = (res['message'] as string[]).join(', ');
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`予期しないエラー: ${exception.message}`, exception.stack);
    }

    if (!errorCode || errorCode === 'INTERNAL_ERROR') {
      errorCode = this.statusToErrorCode(status);
    }

    response.status(status).json({
      result: 'ng',
      error_code: errorCode,
      message,
    });
  }

  private statusToErrorCode(status: number): string {
    const codeMap: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_ERROR',
    };
    return codeMap[status] || 'UNKNOWN_ERROR';
  }
}
