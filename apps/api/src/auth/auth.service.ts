import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const admin = await this.prisma.admin.findUnique({
      where: { loginId: dto.loginId },
    });

    if (!admin) {
      throw new UnauthorizedException('ログインIDまたはパスワードが正しくありません');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, admin.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('ログインIDまたはパスワードが正しくありません');
    }

    const payload = { sub: admin.id, loginId: admin.loginId };
    const accessToken = this.jwtService.sign(payload);

    this.logger.log(`管理者ログイン成功: ${admin.loginId}`);

    return {
      access_token: accessToken,
      admin: {
        id: admin.id,
        loginId: admin.loginId,
        name: admin.name,
      },
    };
  }
}
