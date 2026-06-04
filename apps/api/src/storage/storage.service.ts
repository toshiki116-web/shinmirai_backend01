import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getSignedUrl as getCloudFrontSignedUrl } from '@aws-sdk/cloudfront-signer';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

type CreateUploadUrlParams = {
  contentId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
};

type UploadUrlResult = {
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
};

type HeadObjectResult = {
  fileSize: bigint;
  checksum: string | null;
  contentType: string | null;
};

@Injectable()
export class StorageService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly uploadUrlExpiresIn: number;
  private readonly maxUploadSizeBytes: number;
  private readonly allowedVideoMime: Set<string>;
  private readonly cloudFrontDomain: string | null;
  private readonly cloudFrontKeyPairId: string | null;
  private readonly cloudFrontPrivateKey: string | null;
  private readonly signedUrlTtlSeconds: number;

  constructor(configService: ConfigService) {
    const region = configService.get<string>('AWS_REGION') ?? 'ap-northeast-3';
    this.s3 = new S3Client({ region });
    this.bucket =
      configService.get<string>('S3_CONTENTS_BUCKET') ??
      configService.get<string>('AWS_S3_BUCKET') ??
      '';
    this.uploadUrlExpiresIn = Number(configService.get<string>('UPLOAD_URL_EXPIRES_IN') ?? 900);
    this.maxUploadSizeBytes = Number(
      configService.get<string>('MAX_UPLOAD_SIZE_BYTES') ?? 5 * 1024 * 1024 * 1024,
    );
    this.allowedVideoMime = new Set(
      (configService.get<string>('ALLOWED_VIDEO_MIME') ?? 'video/mp4,video/quicktime')
        .split(',')
        .map((mime) => mime.trim())
        .filter(Boolean),
    );
    this.cloudFrontDomain =
      configService.get<string>('CLOUDFRONT_CONTENTS_DOMAIN') ??
      configService.get<string>('AWS_CLOUDFRONT_DOMAIN') ??
      null;
    this.cloudFrontKeyPairId =
      configService.get<string>('CLOUDFRONT_KEY_PAIR_ID') ??
      configService.get<string>('AWS_CLOUDFRONT_KEY_PAIR_ID') ??
      null;
    const privateKey =
      configService.get<string>('CLOUDFRONT_PRIVATE_KEY') ??
      configService.get<string>('AWS_CLOUDFRONT_PRIVATE_KEY') ??
      null;
    this.cloudFrontPrivateKey = privateKey ? privateKey.replace(/\\n/g, '\n') : null;
    this.signedUrlTtlSeconds = Number(configService.get<string>('SIGNED_URL_TTL_SECONDS') ?? 21600);
  }

  async createUploadUrl(params: CreateUploadUrlParams): Promise<UploadUrlResult> {
    this.ensureBucketConfigured();
    this.validateUpload(params.contentType, params.fileSize);

    const objectKey = this.createObjectKey(params.contentId, params.fileName, params.contentType);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: params.contentType,
    });
    const uploadUrl = await getS3SignedUrl(this.s3, command, {
      expiresIn: this.uploadUrlExpiresIn,
    });

    return {
      uploadUrl,
      objectKey,
      expiresIn: this.uploadUrlExpiresIn,
    };
  }

  async headObject(objectKey: string): Promise<HeadObjectResult> {
    this.ensureBucketConfigured();
    const result = await this.s3.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
    );

    if (result.ContentLength === undefined) {
      throw new BadRequestException('アップロード済みファイルのサイズを確認できません');
    }

    return {
      fileSize: BigInt(result.ContentLength),
      checksum: result.ETag?.replaceAll('"', '') ?? null,
      contentType: result.ContentType ?? null,
    };
  }

  signContentUrl(objectKey: string): string {
    if (!this.cloudFrontDomain || !this.cloudFrontKeyPairId || !this.cloudFrontPrivateKey) {
      throw new InternalServerErrorException('CloudFront署名設定が不足しています');
    }

    const domain = this.cloudFrontDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
    const url = `https://${domain}/${encodedKey}`;
    const dateLessThan = new Date(Date.now() + this.signedUrlTtlSeconds * 1000).toISOString();

    return getCloudFrontSignedUrl({
      url,
      keyPairId: this.cloudFrontKeyPairId,
      privateKey: this.cloudFrontPrivateKey,
      dateLessThan,
    });
  }

  validateUpload(contentType: string, fileSize: number) {
    if (!this.allowedVideoMime.has(contentType)) {
      throw new BadRequestException('許可されていない動画形式です');
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      throw new BadRequestException('ファイルサイズが不正です');
    }
    if (fileSize > this.maxUploadSizeBytes) {
      throw new BadRequestException('アップロード可能なファイルサイズを超えています');
    }
  }

  private ensureBucketConfigured() {
    if (!this.bucket) {
      throw new InternalServerErrorException('S3バケット設定が不足しています');
    }
  }

  private createObjectKey(contentId: string, fileName: string, contentType: string) {
    const ext = this.getExtension(fileName, contentType);
    return `contents/${contentId}/${randomUUID()}.${ext}`;
  }

  private getExtension(fileName: string, contentType: string) {
    const fileExt = fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (fileExt) return fileExt;
    if (contentType === 'video/quicktime') return 'mov';
    return 'mp4';
  }
}
