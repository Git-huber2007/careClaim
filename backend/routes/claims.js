import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import {
  createClaim,
  listClaims,
  getClaim,
  processClaim,
  listPolicies,
} from '../controllers/claimsController.js';

export const claimsRouter = Router();
claimsRouter.use(requireAuth);

claimsRouter.post('/', asyncHandler(createClaim));
claimsRouter.get('/', asyncHandler(listClaims));
claimsRouter.get('/:id', asyncHandler(getClaim));
claimsRouter.post('/:id/process', asyncHandler(processClaim));

export const policiesRouter = Router();
policiesRouter.use(requireAuth);
policiesRouter.get('/', asyncHandler(listPolicies));
