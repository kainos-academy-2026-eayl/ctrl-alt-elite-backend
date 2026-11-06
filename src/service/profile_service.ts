import sharp from 'sharp';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../errors/appErrors';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import {
  MAX_PROFILE_PHOTO_BYTES,
  type ProfileUpdate,
} from '../models/profile_model';

const profileSelect = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  email: true,
  addressLine1: true,
  addressLine2: true,
  town: true,
  postcode: true,
  phoneNumber: true,
  profilePhoto: true,
} satisfies Prisma.UserSelect;

type ProfileRecord = Prisma.UserGetPayload<{ select: typeof profileSelect }>;

function publicProfile(user: ProfileRecord) {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    addressLine1: user.addressLine1,
    addressLine2: user.addressLine2,
    town: user.town,
    postcode: user.postcode,
    phoneNumber: user.phoneNumber,
    hasPhoto: user.profilePhoto !== null,
  };
}

function handleUpdateError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      throw new ConflictError('That username is already in use.');
    }
    if (error.code === 'P2025') {
      throw new NotFoundError('Profile not found.');
    }
  }
  throw error;
}

async function preparePhoto(body: unknown): Promise<Buffer> {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new ValidationError([
      { field: 'photo', message: 'Choose a picture to upload.' },
    ]);
  }
  if (body.length > MAX_PROFILE_PHOTO_BYTES) {
    throw new ValidationError([
      { field: 'photo', message: 'Pictures must be 20 MiB or smaller.' },
    ]);
  }
  try {
    const image = sharp(body, {
      limitInputPixels: 16_000_000,
      failOn: 'warning',
    });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) {
      throw new Error('Unsupported image format.');
    }
    return await image
      .rotate()
      .resize(512, 512, {
        fit: 'cover',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
  } catch (error) {
    console.warn(
      'Profile picture rejected:',
      error instanceof Error ? error.name : 'Unknown error',
    );
    throw new ValidationError([
      {
        field: 'photo',
        message:
          'Choose a valid JPG, PNG or WebP picture, up to 16 megapixels.',
      },
    ]);
  }
}

export function createProfileService(database: PrismaClient) {
  async function update(userId: string, data: Prisma.UserUpdateInput) {
    try {
      return publicProfile(
        await database.user.update({
          where: { id: userId },
          data,
          select: profileSelect,
        }),
      );
    } catch (error) {
      handleUpdateError(error);
    }
  }

  return {
    async getOwnProfile(userId: string) {
      const user = await database.user.findUnique({
        where: { id: userId },
        select: profileSelect,
      });
      if (!user) throw new NotFoundError('Profile not found.');
      return publicProfile(user);
    },
    updateOwnProfile(userId: string, profile: ProfileUpdate) {
      return update(userId, {
        ...(profile.username !== undefined
          ? { username: profile.username }
          : {}),
        ...(profile.firstName !== undefined
          ? { firstName: profile.firstName }
          : {}),
        ...(profile.lastName !== undefined
          ? { lastName: profile.lastName }
          : {}),
        ...(profile.addressLine1 !== undefined
          ? { addressLine1: profile.addressLine1 }
          : {}),
        ...(profile.addressLine2 !== undefined
          ? { addressLine2: profile.addressLine2 }
          : {}),
        ...(profile.town !== undefined ? { town: profile.town } : {}),
        ...(profile.postcode !== undefined
          ? { postcode: profile.postcode }
          : {}),
        ...(profile.phoneNumber !== undefined
          ? { phoneNumber: profile.phoneNumber }
          : {}),
      });
    },
    async updateProfilePhoto(userId: string, body: unknown) {
      return update(userId, {
        profilePhoto: new Uint8Array(await preparePhoto(body)),
      });
    },
    async getProfilePhoto(userId: string) {
      const user = await database.user.findUnique({
        where: { id: userId },
        select: { profilePhoto: true },
      });
      if (!user?.profilePhoto)
        throw new NotFoundError('Profile picture not found.');
      const bytes = Buffer.from(user.profilePhoto);
      const { format } = await sharp(bytes).metadata();
      const types = {
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
      };
      if (format !== 'jpeg' && format !== 'png' && format !== 'webp') {
        throw new Error('Stored profile picture has an unsupported format.');
      }
      return { bytes, contentType: types[format] };
    },
    removeProfilePhoto(userId: string) {
      return update(userId, { profilePhoto: null });
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
