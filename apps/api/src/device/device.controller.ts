import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DeviceService } from './device.service';
import { DeviceAuthGuard } from '../common/guards/device-auth.guard';
import { CurrentDevice } from '../common/decorators/current-device.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ActivateDto } from './dto/activate.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { CreateAlertDto } from './dto/alert.dto';
import { DailyAnalyticsDto } from './dto/analytics.dto';
import { CreateLogUploadUrlDto } from './dto/create-log-upload-url.dto';
import { CompleteLogUploadDto } from './dto/complete-log-upload.dto';

@ApiTags('筐体向けAPI')
@ApiBearerAuth()
@Controller('device')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Public()
  @UseGuards(DeviceAuthGuard)
  @Post('activate')
  @ApiOperation({ summary: '筐体紐付け登録', description: '認証済み筐体にPC端末UUIDを登録' })
  @ApiResponse({ status: 200, description: '紐付け成功' })
  @ApiResponse({ status: 400, description: '拠点未割当またはリクエスト不正' })
  @ApiResponse({ status: 409, description: '既に紐付け済み' })
  activate(@CurrentDevice() device: any, @Body() dto: ActivateDto) {
    return this.deviceService.activate(device, dto);
  }

  @Public()
  @UseGuards(DeviceAuthGuard)
  @Get('contents')
  @ApiOperation({ summary: '配信コンテンツ一覧取得', description: '拠点IDに紐づく配信可能動画一覧を返却' })
  @ApiResponse({ status: 200, description: 'コンテンツ一覧' })
  getContents(@CurrentDevice() device: any, @Query('language') language?: string) {
    return this.deviceService.getContents(device, language);
  }

  @Public()
  @UseGuards(DeviceAuthGuard)
  @Get('license-check')
  @ApiOperation({ summary: 'ライセンス確認', description: '筐体のライセンス有効性を確認' })
  @ApiResponse({ status: 200, description: 'ライセンス状態' })
  checkLicense(@CurrentDevice() device: any) {
    return this.deviceService.checkLicense(device);
  }

  @Public()
  @UseGuards(DeviceAuthGuard)
  @Post('heartbeat')
  @ApiOperation({ summary: '稼働状況送信', description: '筐体の稼働状況・デバイスステータスを送信' })
  @ApiResponse({ status: 200, description: '受信成功' })
  sendHeartbeat(@CurrentDevice() device: any, @Body() dto: HeartbeatDto) {
    return this.deviceService.sendHeartbeat(device, dto);
  }

  @Public()
  @UseGuards(DeviceAuthGuard)
  @Post('alerts')
  @ApiOperation({ summary: 'アラート送信', description: '未接続発生時や復旧時のアラート通知' })
  @ApiResponse({ status: 200, description: '受信成功' })
  sendAlert(@CurrentDevice() device: any, @Body() dto: CreateAlertDto) {
    return this.deviceService.sendAlert(device, dto);
  }

  @Public()
  @UseGuards(DeviceAuthGuard)
  @Post('analytics/daily')
  @ApiOperation({ summary: '日次利用回数送信', description: '日次の利用回数をUPSERT' })
  @ApiResponse({ status: 200, description: '受信成功' })
  sendDailyAnalytics(@CurrentDevice() device: any, @Body() dto: DailyAnalyticsDto) {
    return this.deviceService.sendDailyAnalytics(device, dto);
  }

  @Public()
  @UseGuards(DeviceAuthGuard)
  @Post('logs/upload-url')
  @ApiOperation({ summary: 'ログアップロードURL発行', description: 'ローテーション済みログファイル用のPresigned PUT URLを発行' })
  @ApiResponse({ status: 201, description: 'URL発行成功' })
  createLogUploadUrl(@CurrentDevice() device: any, @Body() dto: CreateLogUploadUrlDto) {
    return this.deviceService.createLogUploadUrl(device, dto);
  }

  @Public()
  @UseGuards(DeviceAuthGuard)
  @Post('logs/upload-complete')
  @ApiOperation({ summary: 'ログアップロード完了', description: 'S3上のログファイルを検証しメタデータを保存' })
  @ApiResponse({ status: 201, description: '保存成功' })
  completeLogUpload(@CurrentDevice() device: any, @Body() dto: CompleteLogUploadDto) {
    return this.deviceService.completeLogUpload(device, dto);
  }
}
