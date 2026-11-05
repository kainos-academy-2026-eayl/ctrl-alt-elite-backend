import type { Request, Response } from 'express';
import { validateOwnProfileUpdate } from '../models/profile_model';
import type { ProfileService } from '../service/profile_service';

export class ProfileController {
  constructor(private readonly service: ProfileService) {}

  get = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.service.getOwnProfile(res.locals.userId));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    if (!req.is('application/json')) {
      res
        .status(415)
        .json({ message: 'Content-Type must be application/json.' });
      return;
    }
    res.json(
      await this.service.updateOwnProfile(
        res.locals.userId,
        validateOwnProfileUpdate(req.body),
      ),
    );
  };

  uploadPhoto = async (req: Request, res: Response): Promise<void> => {
    res.json(
      await this.service.updateProfilePhoto(res.locals.userId, req.body),
    );
  };

  getPhoto = async (_req: Request, res: Response): Promise<void> => {
    const photo = await this.service.getProfilePhoto(res.locals.userId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(photo.contentType).send(photo.bytes);
  };

  removePhoto = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.service.removeProfilePhoto(res.locals.userId));
  };
}
