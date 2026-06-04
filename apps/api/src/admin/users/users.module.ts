import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PasswordPolicyConstraint } from './dto/password-policy.validator';

@Module({
  controllers: [UsersController],
  providers: [UsersService, PasswordPolicyConstraint],
})
export class UsersModule {}
