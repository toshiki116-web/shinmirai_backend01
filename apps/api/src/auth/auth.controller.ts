import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
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

  @Public()
  @Post('refresh')
  @ApiOperation({
    summary: 'アクセストークンを更新',
    description: 'リフレッシュトークンを検証し、新しいアクセストークンとリフレッシュトークンを返す',
  })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 401, description: 'リフレッシュトークンが無効' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refresh_token);
  }

  @Public()
  @Post('logout')
  @ApiOperation({
    summary: 'ログアウト',
    description: 'リフレッシュトークンを失効する',
  })
  @ApiResponse({ status: 200, description: 'ログアウト成功' })
  async logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refresh_token);
  }
}
