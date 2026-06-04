import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('認証')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: '管理ユーザーログイン', description: 'メールアドレスとパスワードでJWTトークンを発行' })
  @ApiResponse({ status: 200, description: 'ログイン成功。access_tokenを返却' })
  @ApiResponse({ status: 401, description: '認証失敗' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
