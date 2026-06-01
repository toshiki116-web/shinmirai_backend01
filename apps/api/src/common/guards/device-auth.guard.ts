import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 筐体向けAPI用の認証ガード
 * AuthorizationヘッダーからBearer <device_token>を取得し、DBで照合する
 */
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('device_tokenが必要です');
    }

    const token = authHeader.replace('Bearer ', '');

    const unit = await this.prisma.unit.findUnique({
      where: { deviceToken: token },
      include: {
        site: { select: { siteId: true, siteName: true } },
      },
    });

    if (!unit || unit.status === 'deleted') {
      throw new UnauthorizedException('無効なdevice_tokenです');
    }

    // リクエストに筐体情報をセット
    request.device = unit;
    return true;
  }
}
