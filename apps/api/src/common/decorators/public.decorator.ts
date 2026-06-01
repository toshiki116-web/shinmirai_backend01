import { SetMetadata } from '@nestjs/common';

/** 認証不要エンドポイントに付与するデコレータ */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
