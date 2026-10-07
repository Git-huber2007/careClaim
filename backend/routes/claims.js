import { Router } from 'express';
import { requireAuth, requireProfile, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import {
  createClaim,
  listClaims,
  getClaim,
  processClaim,
  listPolicies,
  getStats,
} from '../controllers/claimsController.js';
import { createDispute, listDisputes, respondToDispute } from '../controllers/disputesController.js';
import { createProfile, getMe } from '../controllers/profileController.js';

// Account setup: the only routes reachable before a role is chosen.
export const meRouter = Router();
meRouter.use(requireAuth);
meRouter.get('/', asyncHandler(getMe));
meRouter.post('/profile', asyncHandler(createProfile));

export const claimsRouter = Router();
claimsRouter.use(requireAuth, requireProfile);

claimsRouter.post('/', asyncHandler(createClaim));
claimsRouter.get('/', asyncHandler(listClaims));
claimsRouter.get('/:id', asyncHandler(getClaim));
claimsRouter.post('/:id/process', asyncHandler(processClaim));
claimsRouter.post('/:id/disputes', requireRole('PATIENT'), asyncHandler(createDispute));

export const disputesRouter = Router();
disputesRouter.use(requireAuth, requireProfile);
disputesRouter.get('/', asyncHandler(listDisputes));
disputesRouter.post('/:id/respond', requireRole('HOSPITAL'), asyncHandler(respondToDispute));

export const statsRouter = Router();
statsRouter.use(requireAuth, requireProfile);
statsRouter.get('/', asyncHandler(getStats));

export const policiesRouter = Router();
policiesRouter.use(requireAuth, requireProfile);
policiesRouter.get('/', asyncHandler(listPolicies));
