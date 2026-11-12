import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * 处理一张上传的图片：
 *   <id>.webp    大图，最长边不超过 1600px
 *   <id>-s.webp  列表缩略图，宽度不超过 480px
 * 同时生成一张 16px 宽的模糊小图（内联进页面，用于加载前的占位）。
 *
 * @param {'photo'|'qr'} kind 二维码用无损压缩，保证能被识别
 */
export async function processImage(uploadsDir, buffer, kind = 'photo') {
  if (buffer.length > MAX_UPLOAD_BYTES) throw new ImageError('图片不能超过 10MB');
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new ImageError('无法识别这张图片，请换一张 JPG、PNG 或 WebP');
  }
  if (!meta.width || !meta.height) throw new ImageError('无法识别这张图片');

  const base = () => sharp(buffer, { failOn: 'none' }).rotate();
  const id = crypto.randomBytes(8).toString('hex');
  const webp = kind === 'qr' ? { lossless: true } : { quality: 82 };

  const large = await base().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp(webp).toBuffer({ resolveWithObject: true });
  const small = await base().resize({ width: 480, withoutEnlargement: true }).webp(kind === 'qr' ? webp : { quality: 78 }).toBuffer();
  const tiny = await base().resize({ width: 16 }).webp({ quality: 40 }).toBuffer();

  await fs.writeFile(path.join(uploadsDir, `${id}.webp`), large.data);
  await fs.writeFile(path.join(uploadsDir, `${id}-s.webp`), small);

  return { id, w: large.info.width, h: large.info.height, blur: `data:image/webp;base64,${tiny.toString('base64')}` };
}

export async function removeImageFiles(uploadsDir, id) {
  await Promise.all([`${id}.webp`, `${id}-s.webp`].map((f) => fs.rm(path.join(uploadsDir, f), { force: true })));
}

export class ImageError extends Error {}
