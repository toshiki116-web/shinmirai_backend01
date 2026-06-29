import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';

const userSelect = {
  id: true,
  loginId: true,
  email: true,
  name: true,
  role: true,
  note: true,
  isActive: true,
  notifyOnIncident: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AdminSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: UserQueryDto) {
    const where: Prisma.AdminWhereInput = {};

    if (query.keyword) {
      where.OR = [
        { email: { contains: query.keyword, mode: 'insensitive' } },
        { name: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    if (query.role) {
      where.role = query.role;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const [items, total] = await Promise.all([
      this.prisma.admin.findMany({
        where,
        select: userSelect,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.admin.count({ where }),
    ]);

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.admin.findUnique({
      where: { id },
      select: userSelect,
    });

    if (!user) {
      throw new NotFoundException(`ユーザー ${id} が見つかりません`);
    }

    return user;
  }

  async create(dto: CreateUserDto) {
    await this.ensureEmailAvailable(dto.email);

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    try {
      return await this.prisma.admin.create({
        data: {
          loginId: null,
          email: dto.email,
          password: hashedPassword,
          name: dto.name,
          role: dto.role,
          note: dto.note,
          isActive: true,
          notifyOnIncident: dto.notifyOnIncident ?? false,
        },
        select: userSelect,
      });
    } catch (error) {
      this.handleUniqueError(error);
      throw error;
    }
  }

  async update(id: string, dto: UpdateUserDto, currentUserId: string) {
    const user = await this.ensureExists(id);
    await this.ensureSelfProtection(user, dto, currentUserId);
    await this.ensureLastMasterProtection(user, dto);

    if (dto.email && dto.email !== user.email) {
      await this.ensureEmailAvailable(dto.email, id);
    }

    try {
      return await this.prisma.admin.update({
        where: { id },
        data: {
          email: dto.email,
          name: dto.name,
          role: dto.role,
          note: dto.note,
          isActive: dto.isActive,
          notifyOnIncident: dto.notifyOnIncident,
        },
        select: userSelect,
      });
    } catch (error) {
      this.handleUniqueError(error);
      throw error;
    }
  }

  async resetPassword(id: string, dto: ResetPasswordDto) {
    await this.ensureExists(id);

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    return this.prisma.admin.update({
      where: { id },
      data: { password: hashedPassword },
      select: userSelect,
    });
  }

  async remove(id: string, currentUserId: string) {
    const user = await this.ensureExists(id);

    if (id === currentUserId) {
      throw new BadRequestException('自分自身を削除することはできません');
    }

    await this.ensureLastMasterProtection(user, { isActive: false });

    return this.prisma.admin.update({
      where: { id },
      data: { isActive: false },
      select: userSelect,
    });
  }

  private async ensureExists(id: string) {
    const user = await this.prisma.admin.findUnique({
      where: { id },
      select: userSelect,
    });

    if (!user) {
      throw new NotFoundException(`ユーザー ${id} が見つかりません`);
    }

    return user;
  }

  private async ensureEmailAvailable(email: string, excludeId?: string) {
    const existing = await this.prisma.admin.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing && existing.id !== excludeId) {
      throw new ConflictException('このメールアドレスは既に使用されています');
    }
  }

  private async ensureSelfProtection(
    user: Prisma.AdminGetPayload<{ select: typeof userSelect }>,
    dto: UpdateUserDto,
    currentUserId: string,
  ) {
    if (user.id !== currentUserId) {
      return;
    }

    if (dto.isActive === false) {
      throw new BadRequestException('自分自身を無効化することはできません');
    }

    if (dto.role && dto.role !== 'master') {
      throw new BadRequestException('自分自身のロールを降格することはできません');
    }
  }

  private async ensureLastMasterProtection(
    user: Prisma.AdminGetPayload<{ select: typeof userSelect }>,
    dto: Pick<UpdateUserDto, 'role' | 'isActive'>,
  ) {
    const disablesMaster =
      user.role === 'master' &&
      user.isActive &&
      (dto.isActive === false || (dto.role !== undefined && dto.role !== 'master'));

    if (!disablesMaster) {
      return;
    }

    const activeMasterCount = await this.prisma.admin.count({
      where: { role: 'master', isActive: true },
    });

    if (activeMasterCount <= 1) {
      throw new BadRequestException('最後の有効なmasterユーザーは無効化または降格できません');
    }
  }

  private handleUniqueError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('このメールアドレスは既に使用されています');
    }
  }
}
