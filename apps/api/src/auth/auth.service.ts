import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private static readonly REFRESH_TOKEN_TTL_DAYS = 7;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const admin = await this.prisma.admin.findUnique({
      where: { email: dto.email },
    });

    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('メールアドレスまたはパスワードが正しくありません');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, admin.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('メールアドレスまたはパスワードが正しくありません');
    }

    const accessToken = this.signAccessToken(admin);
    const refreshToken = await this.createRefreshToken(admin.id);

    this.logger.log(`管理ユーザーログイン成功: ${admin.email}`);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      admin: {
        id: admin.id,
        loginId: admin.loginId,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    };
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { admin: true },
    });

    const now = new Date();
    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt <= now) {
      throw new UnauthorizedException('リフレッシュトークンが無効です');
    }

    if (!storedToken.admin.isActive) {
      throw new UnauthorizedException('管理ユーザーが無効です');
    }

    const newRefreshToken = this.generateRefreshToken();
    const newRefreshTokenHash = this.hashRefreshToken(newRefreshToken);

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: now },
      }),
      this.prisma.refreshToken.create({
        data: {
          adminId: storedToken.adminId,
          tokenHash: newRefreshTokenHash,
          expiresAt: this.getRefreshTokenExpiresAt(),
        },
      }),
    ]);

    return {
      access_token: this.signAccessToken(storedToken.admin),
      refresh_token: newRefreshToken,
    };
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: this.hashRefreshToken(refreshToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  private signAccessToken(admin: { id: string; email: string; role: string }) {
    return this.jwtService.sign({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
    });
  }

  private async createRefreshToken(adminId: string) {
    const refreshToken = this.generateRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        adminId,
        tokenHash: this.hashRefreshToken(refreshToken),
        expiresAt: this.getRefreshTokenExpiresAt(),
      },
    });

    return refreshToken;
  }

  private generateRefreshToken() {
    return randomBytes(48).toString('hex');
  }

  private hashRefreshToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private getRefreshTokenExpiresAt() {
    return new Date(
      Date.now() + AuthService.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
  }
}
