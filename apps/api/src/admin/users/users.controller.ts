import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UsersService } from './users.service';

type RequestUser = {
  id: string;
  role: string;
};

@ApiTags('ユーザー管理')
@ApiBearerAuth()
@Roles('master')
@Controller('admin/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'ユーザー一覧取得' })
  @ApiResponse({ status: 200, description: 'ユーザー一覧' })
  findAll(@Query() query: UserQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ユーザー詳細取得' })
  @ApiResponse({ status: 200, description: 'ユーザー詳細' })
  @ApiResponse({ status: 404, description: 'ユーザーが見つからない' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'ユーザー作成' })
  @ApiResponse({ status: 201, description: 'ユーザー作成成功' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'ユーザー更新' })
  @ApiResponse({ status: 200, description: 'ユーザー更新成功' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: RequestUser) {
    return this.usersService.update(id, dto, user.id);
  }

  @Patch(':id/password')
  @ApiOperation({ summary: 'ユーザーパスワードリセット' })
  @ApiResponse({ status: 200, description: 'パスワードリセット成功' })
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.usersService.resetPassword(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'ユーザー削除（無効化）' })
  @ApiResponse({ status: 200, description: 'ユーザー無効化成功' })
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.usersService.remove(id, user.id);
  }
}
