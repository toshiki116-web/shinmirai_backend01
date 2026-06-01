import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * 全成功レスポンスを仕様書の統一形式に変換するインターセプター
 * { result: "ok", data: {...}, message: "" }
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => ({
        result: 'ok',
        data: data ?? {},
        message: '',
      })),
    );
  }
}
