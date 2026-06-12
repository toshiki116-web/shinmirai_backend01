import { ArgumentsHost, BadRequestException, Logger, UnauthorizedException } from '@nestjs/common';
import { GlobalHttpExceptionFilter } from './http-exception.filter';

describe('GlobalHttpExceptionFilter', () => {
  let filter: GlobalHttpExceptionFilter;
  let status: jest.Mock;
  let json: jest.Mock;
  let host: ArgumentsHost;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new GlobalHttpExceptionFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue({ status }),
      }),
    } as unknown as ArgumentsHost;
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  it('想定外の内部例外では生メッセージを返さず汎用メッセージにする', () => {
    const error = new Error('Authentication failed against database credentials for sinmirai');

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      result: 'ng',
      error_code: 'INTERNAL_ERROR',
      message: '内部サーバーエラーが発生しました',
    });
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('credentials');
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('sinmirai');
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      `予期しないエラー: ${error.message}`,
      error.stack,
    );
  });

  it('UnauthorizedException の業務メッセージは従来どおり返す', () => {
    filter.catch(
      new UnauthorizedException('メールアドレスまたはパスワードが正しくありません'),
      host,
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      result: 'ng',
      error_code: 'UNAUTHORIZED',
      message: 'メールアドレスまたはパスワードが正しくありません',
    });
  });

  it('BadRequestException のバリデーションメッセージ配列はカンマ区切りにする', () => {
    filter.catch(
      new BadRequestException({
        message: ['email must be an email', 'password should not be empty'],
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      result: 'ng',
      error_code: 'BAD_REQUEST',
      message: 'email must be an email, password should not be empty',
    });
  });
});
