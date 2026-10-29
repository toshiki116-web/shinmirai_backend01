jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.example.test/upload'),
}));

import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

describe('StorageService thumbnail validation', () => {
  let service: StorageService;

  beforeEach(() => {
    service = new StorageService({
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          S3_CONTENTS_BUCKET: 'test-bucket',
          S3_LOGS_BUCKET: 'test-logs-bucket',
          ALLOWED_THUMBNAIL_MIME: 'image/jpeg,image/png,image/webp',
          MAX_THUMBNAIL_SIZE_BYTES: '5242880',
          ALLOWED_LOG_MIME: 'text/plain,application/gzip',
          MAX_LOG_SIZE_BYTES: '52428800',
        };
        return values[key];
      }),
    } as unknown as ConfigService);
  });

  it('accepts allowed image MIME types at the size limit', () => {
    expect(() => service.validateImageUpload('image/jpeg', 5 * 1024 * 1024)).not.toThrow();
    expect(() => service.validateImageUpload('image/png; charset=binary', 1024)).not.toThrow();
  });

  it('rejects non-image MIME types and invalid sizes', () => {
    expect(() => service.validateImageUpload('text/plain', 1024)).toThrow(BadRequestException);
    expect(() => service.validateImageUpload('image/jpeg', 0)).toThrow(BadRequestException);
    expect(() => service.validateImageUpload('image/jpeg', 5 * 1024 * 1024 + 1)).toThrow(
      BadRequestException,
    );
  });

  it('maps image MIME types to safe extensions', () => {
    expect(service.imageExtFromMime('image/jpeg')).toBe('jpg');
    expect(service.imageExtFromMime('image/png')).toBe('png');
    expect(service.imageExtFromMime('image/webp')).toBe('webp');
    expect(() => service.imageExtFromMime('application/octet-stream')).toThrow(BadRequestException);
  });

  it('accepts safe log file names and rejects unsafe names', () => {
    expect(service.validateLogFileName('app-20260623.log')).toBe('app-20260623.log');
    expect(() => service.validateLogFileName('../app.log')).toThrow(BadRequestException);
    expect(() => service.validateLogFileName('dir/app.log')).toThrow(BadRequestException);
    expect(() => service.validateLogFileName('dir\\app.log')).toThrow(BadRequestException);
    expect(() => service.validateLogFileName(' app.log')).toThrow(BadRequestException);
    expect(() => service.validateLogFileName('a'.repeat(256))).toThrow(BadRequestException);
  });

  it('validates log MIME types and sizes', () => {
    expect(() => service.validateLogUpload('text/plain; charset=utf-8', 1024)).not.toThrow();
    expect(() => service.validateLogUpload('application/gzip', 50 * 1024 * 1024)).not.toThrow();
    expect(() => service.validateLogUpload('application/json', 1024)).toThrow(BadRequestException);
    expect(() => service.validateLogUpload('text/plain', 0)).toThrow(BadRequestException);
    expect(() => service.validateLogUpload('text/plain', 50 * 1024 * 1024 + 1)).toThrow(
      BadRequestException,
    );
  });
});

describe('StorageService video upload key', () => {
  let service: StorageService;

  beforeEach(() => {
    service = new StorageService({
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          S3_CONTENTS_BUCKET: 'test-bucket',
          AWS_ACCESS_KEY_ID: 'test',
        };
        return values[key];
      }),
    } as unknown as ConfigService);
  });

  it('decides the extension from the MIME type only, ignoring the file name', async () => {
    const mp4 = await service.createUploadUrl({
      contentId: 'CNT-00001',
      fileName: 'x.html',
      contentType: 'video/mp4',
      fileSize: 1024,
    });
    expect(mp4.objectKey).toMatch(/^contents\/CNT-00001\/[0-9a-f-]+\.mp4$/);

    const mov = await service.createUploadUrl({
      contentId: 'CNT-00001',
      fileName: 'x.mp4',
      contentType: 'video/quicktime',
      fileSize: 1024,
    });
    expect(mov.objectKey).toMatch(/\.mov$/);
  });

  it('rejects MIME types that have no video extension', () => {
    expect(service.videoExtFromMime('video/mp4; codecs=avc1')).toBe('mp4');
    expect(() => service.videoExtFromMime('text/html')).toThrow(BadRequestException);
  });
});
