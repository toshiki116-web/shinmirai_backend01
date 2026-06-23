import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getSignedUrl as getCloudFrontSignedUrl } from '@aws-sdk/cloudfront-signer';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

type CreateUploadUrlParams = {
  contentId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
};

type CreateLogUploadUrlParams = {
  unitId: string;
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
  private readonly logsBucket: string;
  private readonly uploadUrlExpiresIn: number;
  private readonly logUploadUrlExpiresIn: number;
  private readonly logDownloadUrlExpiresIn: number;
  private readonly maxUploadSizeBytes: number;
  private readonly maxThumbnailSizeBytes: number;
  private readonly maxLogSizeBytes: number;
  private readonly allowedVideoMime: Set<string>;
  private readonly allowedImageMime: Set<string>;
  private readonly allowedLogMime: Set<string>;
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
    this.logsBucket = configService.get<string>('S3_LOGS_BUCKET') ?? '';
    this.logUploadUrlExpiresIn = Number(
      configService.get<string>('LOG_UPLOAD_URL_EXPIRES_IN') ?? 900,
    );
    this.logDownloadUrlExpiresIn = Number(
      configService.get<string>('LOG_DOWNLOAD_URL_EXPIRES_IN') ?? 300,
    );
    this.maxUploadSizeBytes = Number(
      configService.get<string>('MAX_UPLOAD_SIZE_BYTES') ?? 5 * 1024 * 1024 * 1024,
    );
    this.maxThumbnailSizeBytes = Number(
      configService.get<string>('MAX_THUMBNAIL_SIZE_BYTES') ?? 5 * 1024 * 1024,
    );
    this.maxLogSizeBytes = Number(
      configService.get<string>('MAX_LOG_SIZE_BYTES') ?? 50 * 1024 * 1024,
    );
    this.allowedVideoMime = new Set(
      (configService.get<string>('ALLOWED_VIDEO_MIME') ?? 'video/mp4,video/quicktime')
        .split(',')
        .map((mime) => mime.trim())
        .filter(Boolean),
    );
    this.allowedImageMime = new Set(
      (configService.get<string>('ALLOWED_THUMBNAIL_MIME') ?? 'image/jpeg,image/png,image/webp')
        .split(',')
        .map((mime) => mime.trim())
        .filter(Boolean),
    );
    this.allowedLogMime = new Set(
      (configService.get<string>('ALLOWED_LOG_MIME') ?? 'text/plain,application/gzip')
        .split(',')
        .map((mime) => this.normalizeContentType(mime))
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

  async createThumbnailUploadUrl(params: CreateUploadUrlParams): Promise<UploadUrlResult> {
    this.ensureBucketConfigured();
    this.validateImageUpload(params.contentType, params.fileSize);

    const objectKey = this.createThumbnailObjectKey(params.contentId, params.contentType);
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

  async createLogUploadUrl(params: CreateLogUploadUrlParams): Promise<UploadUrlResult> {
    this.ensureLogBucketConfigured();
    this.validateLogUpload(params.contentType, params.fileSize);

    const objectKey = this.buildLogObjectKey(params.unitId, params.fileName);
    const command = new PutObjectCommand({
      Bucket: this.logsBucket,
      Key: objectKey,
      ContentType: this.normalizeContentType(params.contentType),
    });
    const uploadUrl = await getS3SignedUrl(this.s3, command, {
      expiresIn: this.logUploadUrlExpiresIn,
    });

    return {
      uploadUrl,
      objectKey,
      expiresIn: this.logUploadUrlExpiresIn,
    };
  }

  async createLogDownloadUrl(s3Key: string): Promise<{ downloadUrl: string; expiresIn: number }> {
    this.ensureLogBucketConfigured();
    const command = new GetObjectCommand({
      Bucket: this.logsBucket,
      Key: s3Key,
    });
    const downloadUrl = await getS3SignedUrl(this.s3, command, {
      expiresIn: this.logDownloadUrlExpiresIn,
    });

    return {
      downloadUrl,
      expiresIn: this.logDownloadUrlExpiresIn,
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

  async headLogObject(objectKey: string): Promise<HeadObjectResult> {
    this.ensureLogBucketConfigured();
    const result = await this.s3.send(
      new HeadObjectCommand({
        Bucket: this.logsBucket,
        Key: objectKey,
      }),
    );

    if (result.ContentLength === undefined) {
      throw new BadRequestException('Uploaded log file size could not be confirmed');
    }

    return {
      fileSize: BigInt(result.ContentLength),
      checksum: result.ETag?.replaceAll('"', '') ?? null,
      contentType: result.ContentType ?? null,
    };
  }

  async deleteLogObject(s3Key: string): Promise<void> {
    this.ensureLogBucketConfigured();
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.logsBucket,
        Key: s3Key,
      }),
    );
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

  validateImageUpload(contentType: string, fileSize: number) {
    const normalizedContentType = this.normalizeImageContentType(contentType);
    if (!this.allowedImageMime.has(normalizedContentType)) {
      throw new BadRequestException('許可されていない画像形式です');
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      throw new BadRequestException('ファイルサイズが不正です');
    }
    if (fileSize > this.maxThumbnailSizeBytes) {
      throw new BadRequestException('サムネイルの最大サイズを超えています');
    }
  }

  validateLogUpload(contentType: string | null | undefined, fileSize: number) {
    const normalizedContentType = this.normalizeContentType(contentType ?? '');
    if (!this.allowedLogMime.has(normalizedContentType)) {
      throw new BadRequestException('Unsupported log MIME type');
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      throw new BadRequestException('Invalid log file size');
    }
    if (fileSize > this.maxLogSizeBytes) {
      throw new BadRequestException('Log file size exceeds the allowed limit');
    }
  }

  validateLogFileName(fileName: string) {
    const byteLength = Buffer.byteLength(fileName, 'utf8');
    if (!fileName || fileName.trim() !== fileName || byteLength > 255) {
      throw new BadRequestException('Invalid log file name');
    }
    if (!/^[A-Za-z0-9._-]+$/.test(fileName)) {
      throw new BadRequestException('Invalid log file name');
    }
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      throw new BadRequestException('Invalid log file name');
    }
    return fileName;
  }

  buildLogObjectKey(unitId: string, fileName: string) {
    const safeFileName = this.validateLogFileName(fileName);
    return `logs/${unitId}/${safeFileName}`;
  }

  normalizeImageContentType(contentType: string) {
    return this.normalizeContentType(contentType);
  }

  normalizeContentType(contentType: string) {
    return contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  }

  private ensureBucketConfigured() {
    if (!this.bucket) {
      throw new InternalServerErrorException('S3バケット設定が不足しています');
    }
  }

  private ensureLogBucketConfigured() {
    if (!this.logsBucket) {
      throw new InternalServerErrorException('S3 logs bucket is not configured');
    }
    if (this.bucket && this.logsBucket === this.bucket) {
      throw new InternalServerErrorException('S3 logs bucket must differ from the contents bucket');
    }
  }

  private createObjectKey(contentId: string, fileName: string, contentType: string) {
    const ext = this.getExtension(fileName, contentType);
    return `contents/${contentId}/${randomUUID()}.${ext}`;
  }

  private createThumbnailObjectKey(contentId: string, contentType: string) {
    const ext = this.imageExtFromMime(contentType);
    return `contents/${contentId}/thumbnails/${randomUUID()}.${ext}`;
  }

  imageExtFromMime(contentType: string) {
    switch (this.normalizeImageContentType(contentType)) {
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      case 'image/jpeg':
        return 'jpg';
      default:
        throw new BadRequestException('許可されていない画像形式です');
    }
  }

  private getExtension(fileName: string, contentType: string) {
    const fileExt = fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (fileExt) return fileExt;
    if (contentType === 'video/quicktime') return 'mov';
    return 'mp4';
  }
}
