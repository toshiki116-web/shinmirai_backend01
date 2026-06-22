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
          ALLOWED_THUMBNAIL_MIME: 'image/jpeg,image/png,image/webp',
          MAX_THUMBNAIL_SIZE_BYTES: '5242880',
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
});
