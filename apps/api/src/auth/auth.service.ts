import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
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

    // bcrypt照合中にパスワードリセットが完了していた場合にトークンを発行しないよう、admins行のロック下で読み直す
    const refreshToken = await this.prisma.$transaction(async (tx) => {
      await this.lockAdmin(tx, admin.id);
      const current = await tx.admin.findUnique({ where: { id: admin.id } });
      if (!current || !current.isActive || current.password !== admin.password) {
        throw new UnauthorizedException('メールアドレスまたはパスワードが正しくありません');
      }
      return this.createRefreshToken(tx, admin.id);
    });
    const accessToken = this.signAccessToken(admin);

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
    // adminId を得るだけの読み取り。有効性はロック取得後に条件付き更新で判定し直す
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!storedToken) {
      throw new UnauthorizedException('リフレッシュトークンが無効です');
    }

    const newRefreshToken = this.generateRefreshToken();
    const now = new Date();

    const admin = await this.prisma.$transaction(async (tx) => {
      await this.lockAdmin(tx, storedToken.adminId);

      // リセットで失効済み、または同じトークンの二重使用なら更新件数が0になる
      const revoked = await tx.refreshToken.updateMany({
        where: { id: storedToken.id, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      if (revoked.count !== 1) {
        throw new UnauthorizedException('リフレッシュトークンが無効です');
      }

      const current = await tx.admin.findUnique({ where: { id: storedToken.adminId } });
      if (!current || !current.isActive) {
        throw new UnauthorizedException('管理ユーザーが無効です');
      }

      await tx.refreshToken.create({
        data: {
          adminId: storedToken.adminId,
          tokenHash: this.hashRefreshToken(newRefreshToken),
          expiresAt: this.getRefreshTokenExpiresAt(),
        },
      });
      return current;
    });

    return {
      access_token: this.signAccessToken(admin),
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

  // 同じ管理者のトークン発行とパスワードリセットを直列化する（呼び出し元のトランザクション内で使う）
  private async lockAdmin(tx: Prisma.TransactionClient, adminId: string) {
    await tx.$queryRaw`SELECT id FROM admins WHERE id = ${adminId} FOR UPDATE`;
  }

  private async createRefreshToken(tx: Prisma.TransactionClient, adminId: string) {
    const refreshToken = this.generateRefreshToken();
    await tx.refreshToken.create({
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
