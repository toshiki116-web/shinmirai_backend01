import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** リクエストから認証済み筐体情報を取得するデコレータ */
export const CurrentDevice = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.device;
});
