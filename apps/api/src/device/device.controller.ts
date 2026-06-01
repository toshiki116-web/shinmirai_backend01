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
import { SendLogsDto } from './dto/send-logs.dto';

@ApiTags('筐体向けAPI')
@ApiBearerAuth()
@Controller('device')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Public()
  @UseGuards(DeviceAuthGuard)
  @Get('master/sites-units')
  @ApiOperation({ summary: '拠点・筐体マスタ取得', description: '初期設定時に拠点名・筐体名を選択するための候補を取得' })
  @ApiResponse({ status: 200, description: '拠点・筐体一覧' })
  getMasterSitesUnits() {
    return this.deviceService.getMasterSitesUnits();
  }

  @Public()
  @UseGuards(DeviceAuthGuard)
  @Post('activate')
  @ApiOperation({ summary: '筐体紐付け登録', description: '筐体を拠点ID・筐体IDと紐付けてpc_uuidを登録' })
  @ApiResponse({ status: 200, description: '紐付け成功' })
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
  @Post('logs')
  @ApiOperation({ summary: 'ログ一括送信', description: 'アプリログ・障害ログ・イベントログを一括送信（最大100件）' })
  @ApiResponse({ status: 200, description: '受信成功' })
  sendLogs(@CurrentDevice() device: any, @Body() dto: SendLogsDto) {
    return this.deviceService.sendLogs(device, dto);
  }
}
