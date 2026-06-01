import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** リクエストから認証済み管理者情報を取得するデコレータ */
export const CurrentUser = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
