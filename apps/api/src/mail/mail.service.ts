import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const SES_MAX_DESTINATION_RECIPIENTS = 50;

export type IncidentMailPayload = {
  siteName: string | null;
  unitId: string;
  unitName: string;
  alertType: string;
  level: string;
  detail: string | null;
  occurredAt: Date;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly ses: SESClient;
  private readonly fromAddress: string;
  private readonly webBaseUrl: string;

  constructor(configService: ConfigService) {
    const region = configService.get<string>('AWS_REGION') ?? 'ap-northeast-3';
    this.ses = new SESClient({ region });
    this.fromAddress = configService.get<string>('MAIL_FROM_ADDRESS') ?? '';
    this.webBaseUrl = (configService.get<string>('WEB_BASE_URL') ?? '').replace(/\/$/, '');
  }

  async sendIncidentAlert(to: string[], payload: IncidentMailPayload): Promise<void> {
    if (!this.fromAddress) {
      this.logger.error('MAIL_FROM_ADDRESS is not configured. Incident mail was skipped.');
      return;
    }

    const recipients = Array.from(
      new Set(
        to
          .map((email) => email.trim())
          .filter((email) => email && email !== this.fromAddress),
      ),
    );
    if (recipients.length === 0) {
      return;
    }

    const subject = `【シン・ミライ人間洗濯機】不具合アラート ${payload.unitName} (${payload.level})`;
    const text = this.buildIncidentText(payload);
    const bccChunkSize = SES_MAX_DESTINATION_RECIPIENTS - 1;

    for (let i = 0; i < recipients.length; i += bccChunkSize) {
      const bcc = recipients.slice(i, i + bccChunkSize);
      try {
        await this.ses.send(
          new SendEmailCommand({
            Source: this.fromAddress,
            Destination: {
              ToAddresses: [this.fromAddress],
              BccAddresses: bcc,
            },
            Message: {
              Subject: {
                Charset: 'UTF-8',
                Data: subject,
              },
              Body: {
                Text: {
                  Charset: 'UTF-8',
                  Data: text,
                },
              },
            },
          }),
        );
      } catch (error) {
        this.logger.error(
          `Failed to send incident mail chunk for unit ${payload.unitId}: ${this.formatError(error)}`,
        );
      }
    }
  }

  private buildIncidentText(payload: IncidentMailPayload) {
    const unitUrl = this.webBaseUrl
      ? `${this.webBaseUrl}/units/${encodeURIComponent(payload.unitId)}`
      : '';
    const occurredAt = payload.occurredAt.toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
    });

    return [
      '不具合アラートを検知しました。',
      '',
      `拠点名: ${payload.siteName ?? '未設定'}`,
      `筐体名: ${payload.unitName}`,
      `筐体ID: ${payload.unitId}`,
      `アラート種別: ${payload.alertType}`,
      `レベル: ${payload.level}`,
      `詳細: ${payload.detail ?? '-'}`,
      `発生日時: ${occurredAt}`,
      unitUrl ? `管理画面URL: ${unitUrl}` : '管理画面URL: WEB_BASE_URL未設定',
      '',
      'このメールはシン・ミライ人間洗濯機 管理基盤から自動送信されています。',
    ].join('\n');
  }

  private formatError(error: unknown) {
    if (error instanceof Error) {
      return error.stack ?? error.message;
    }
    return String(error);
  }
}
