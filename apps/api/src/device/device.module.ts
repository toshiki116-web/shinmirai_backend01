import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { DeviceController } from './device.controller';
import { DeviceService } from './device.service';

@Module({
  imports: [MailModule],
  controllers: [DeviceController],
  providers: [DeviceService],
})
export class DeviceModule {}
