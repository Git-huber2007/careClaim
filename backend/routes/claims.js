import express, { Router } from 'express';
import { requireAuth, requireProfile, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import {
  createClaim,
  extractBill,
  listClaims,
  getClaim,
  processClaim,
  listPolicies,
  getStats,
  getAnalytics,
  listReferencePrices,
  estimatePayout,
  verifyClaim,
  attachDocument,
  getDocument,
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

// A scanned document arrives as base64 inside JSON; only the two routes that take one accept a large body.
const documentBody = express.json({ limit: '15mb' });

claimsRouter.post('/', asyncHandler(createClaim));
claimsRouter.post('/extract-bill', documentBody, asyncHandler(extractBill));
claimsRouter.get('/', asyncHandler(listClaims));
claimsRouter.get('/:id', asyncHandler(getClaim));
claimsRouter.post('/:id/process', asyncHandler(processClaim));
claimsRouter.post('/:id/disputes', requireRole('PATIENT'), asyncHandler(createDispute));
claimsRouter.post('/:id/document', documentBody, asyncHandler(attachDocument));
claimsRouter.get('/:id/document', asyncHandler(getDocument));

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

// Read-only views over the caller's claims and the shared rate card, and the no-model estimate.
// Mounted on /api itself, so the sign-in check sits on each route instead of on
// the router, where it would also answer for paths that do not exist.
export const insightsRouter = Router();
const signedIn = [requireAuth, requireProfile];
insightsRouter.get('/analytics', signedIn, asyncHandler(getAnalytics));
insightsRouter.get('/reference-prices', signedIn, asyncHandler(listReferencePrices));
insightsRouter.post('/estimate', signedIn, asyncHandler(estimatePayout));

// Public: what the QR code on a discharge slip opens.
export const verifyRouter = Router();
verifyRouter.get('/:id', asyncHandler(verifyClaim));
