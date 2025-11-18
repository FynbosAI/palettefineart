#!/usr/bin/env tsx

import fastify from 'fastify';
import fastifyCors from '@fastify/cors';

import health from '../api/health.ts';
import processImages from '../api/process-images.ts';
import emissions from '../api/emissions.ts';
import acceptBid from '../api/accept-bid.ts';
import acceptCounter from '../api/accept-counter-offer.ts';
import approveChange from '../api/approve-change-request.ts';
import cancelShipment from '../api/cancel-shipment.ts';
import counterChange from '../api/counter-change-request.ts';
import createChange from '../api/create-change-request.ts';
import rejectChange from '../api/reject-change-request.ts';
import rejectCounter from '../api/reject-counter-offer.ts';
import reopenShipment from '../api/reopen-shipment.ts';
import withdrawBid from '../api/withdraw-bid.ts';
import withdrawQuote from '../api/withdraw-quote.ts';
import markDelivered from '../api/mark-delivered.ts';
import exportEstimatePdf from '../api/estimates/export-pdf.ts';
import createSessionLink from '../api/auth/session-link/create.ts';
import consumeSessionLink from '../api/auth/session-link/consume.ts';
import passwordResetRequest from '../api/auth/password-reset/request.ts';
import createUpload from '../api/documents/create-upload.ts';
import confirmUpload from '../api/documents/confirm-upload.ts';
import getDownloadUrl from '../api/documents/get-download-url.ts';
import deleteDocument from '../api/documents/delete.ts';
import deletePermissions from '../api/documents/delete-permissions.ts';
import createArtworkImageUpload from '../api/artwork-images/create-upload.ts';
import confirmArtworkImageUpload from '../api/artwork-images/confirm-upload.ts';
import getArtworkImageDownloadUrl from '../api/artwork-images/get-download-url.ts';
import branchNetwork from '../api/branch-network.ts';
import currencyLatest from '../api/currency/latest.ts';
import chatProvision from '../api/chat/provision.ts';
import geocode from '../api/geocode.ts';

const server = fastify({ logger: true });
const PORT = Number(process.env.PORT || 3002);

await server.register(fastifyCors, {
  origin: true,
  credentials: true
});

// Allow multipart/form-data requests to pass through to Vercel-style handlers
const MULTIPART_LIMIT_BYTES = 100 * 1024 * 1024;

server.addContentTypeParser(/^multipart\/(form-data)(;.*)?$/, { bodyLimit: MULTIPART_LIMIT_BYTES }, (request, payload, done) => {
  done(null, payload);
});

const adaptHandler = (handler: any) => async (request: any, reply: any) => {
  const rawRequest = request.raw as any;

  const req = Object.assign(rawRequest, {
    body: request.body,
    query: request.query,
    cookies: request.cookies,
    headers: request.headers,
    method: request.method,
    url: request.url
  });

  let finished = false;
  const waitForResponse = new Promise<void>((resolve) => {
    const done = () => {
      if (!finished) {
        finished = true;
        resolve();
      }
    };
    reply.raw.once('finish', done);
    reply.raw.once('close', done);
    reply.raw.once('error', done);
  });

  const res = {
    status(code: number) {
      if (reply.sent || reply.raw.writableEnded || reply.raw.destroyed) {
        return res;
      }
      reply.status(code);
      return res;
    },
    setHeader(name: string, value: any) {
      if (reply.sent || reply.raw.writableEnded || reply.raw.destroyed) {
        return res;
      }
      reply.header(name, value);
      return res;
    },
    getHeader(name: string) {
      return reply.getHeader(name);
    },
    end(payload?: any) {
      if (reply.sent || reply.raw.writableEnded || reply.raw.destroyed) {
        return;
      }
      if (payload !== undefined) {
        reply.send(payload);
      } else if (!reply.sent) {
        reply.send();
      }
    },
    json(payload: any) {
      if (reply.sent || reply.raw.writableEnded || reply.raw.destroyed) {
        return;
      }
      reply.send(payload);
    }
  };

  try {
    const maybePromise = handler(req, res);
    await Promise.resolve(maybePromise);

    if (!reply.sent && !reply.raw.writableEnded && !reply.raw.destroyed) {
      await waitForResponse;
    }
  } catch (error) {
    request.log.error(error, 'Handler error');
    if (!reply.sent) {
      reply.status(500).send({ ok: false, error: (error as Error).message ?? 'Internal Server Error' });
    }
  }

  if (!finished) {
    await waitForResponse;
  }

  if (!reply.sent && !reply.raw.writableEnded && !reply.raw.destroyed) {
    request.log.warn('Handler returned without sending a response. Ending request with empty body.');
    reply.send();
  }
};

const route = (method: 'GET' | 'POST' | 'OPTIONS', path: string, handler: any) => {
  server.route({
    method,
    url: path,
    handler: adaptHandler(handler)
  });
};

route('GET', '/api/health', health);
route('OPTIONS', '/api/health', health);
route('POST', '/api/process-images', processImages);
route('OPTIONS', '/api/process-images', processImages);
route('POST', '/api/emissions', emissions);
route('OPTIONS', '/api/emissions', emissions);
route('POST', '/api/accept-bid', acceptBid);
route('OPTIONS', '/api/accept-bid', acceptBid);
route('POST', '/api/accept-counter-offer', acceptCounter);
route('OPTIONS', '/api/accept-counter-offer', acceptCounter);
route('POST', '/api/approve-change-request', approveChange);
route('OPTIONS', '/api/approve-change-request', approveChange);
route('POST', '/api/cancel-shipment', cancelShipment);
route('OPTIONS', '/api/cancel-shipment', cancelShipment);
route('POST', '/api/counter-change-request', counterChange);
route('OPTIONS', '/api/counter-change-request', counterChange);
route('POST', '/api/create-change-request', createChange);
route('OPTIONS', '/api/create-change-request', createChange);
route('POST', '/api/reject-change-request', rejectChange);
route('OPTIONS', '/api/reject-change-request', rejectChange);
route('POST', '/api/reject-counter-offer', rejectCounter);
route('OPTIONS', '/api/reject-counter-offer', rejectCounter);
route('POST', '/api/reopen-shipment', reopenShipment);
route('OPTIONS', '/api/reopen-shipment', reopenShipment);
route('POST', '/api/mark-delivered', markDelivered);
route('OPTIONS', '/api/mark-delivered', markDelivered);
route('POST', '/api/withdraw-bid', withdrawBid);
route('OPTIONS', '/api/withdraw-bid', withdrawBid);
route('POST', '/api/withdraw-quote', withdrawQuote);
route('OPTIONS', '/api/withdraw-quote', withdrawQuote);
route('POST', '/api/documents/create-upload', createUpload);
route('OPTIONS', '/api/documents/create-upload', createUpload);
route('POST', '/api/documents/confirm-upload', confirmUpload);
route('OPTIONS', '/api/documents/confirm-upload', confirmUpload);
route('GET', '/api/documents/get-download-url', getDownloadUrl);
route('OPTIONS', '/api/documents/get-download-url', getDownloadUrl);
route('POST', '/api/documents/delete', deleteDocument);
route('OPTIONS', '/api/documents/delete', deleteDocument);
route('POST', '/api/documents/delete-permissions', deletePermissions);
route('OPTIONS', '/api/documents/delete-permissions', deletePermissions);
route('POST', '/api/artwork-images/create-upload', createArtworkImageUpload);
route('OPTIONS', '/api/artwork-images/create-upload', createArtworkImageUpload);
route('POST', '/api/artwork-images/confirm-upload', confirmArtworkImageUpload);
route('OPTIONS', '/api/artwork-images/confirm-upload', confirmArtworkImageUpload);
route('GET', '/api/artwork-images/get-download-url', getArtworkImageDownloadUrl);
route('OPTIONS', '/api/artwork-images/get-download-url', getArtworkImageDownloadUrl);
route('GET', '/api/branch-network', branchNetwork);
route('OPTIONS', '/api/branch-network', branchNetwork);
route('POST', '/api/auth/session-link/create', createSessionLink);
route('OPTIONS', '/api/auth/session-link/create', createSessionLink);
route('POST', '/api/auth/session-link/consume', consumeSessionLink);
route('OPTIONS', '/api/auth/session-link/consume', consumeSessionLink);
route('POST', '/api/auth/password-reset/request', passwordResetRequest);
route('OPTIONS', '/api/auth/password-reset/request', passwordResetRequest);
route('POST', '/api/chat/provision', chatProvision);
route('OPTIONS', '/api/chat/provision', chatProvision);
route('GET', '/api/currency/latest', currencyLatest);
route('OPTIONS', '/api/currency/latest', currencyLatest);
route('POST', '/api/geocode', geocode);
route('OPTIONS', '/api/geocode', geocode);
route('GET', '/api/estimates/export-pdf', exportEstimatePdf);
route('POST', '/api/estimates/export-pdf', exportEstimatePdf);
route('OPTIONS', '/api/estimates/export-pdf', exportEstimatePdf);

server.listen({ port: PORT }, (err, address) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  server.log.info(`palette-backend dev server listening on ${address}`);
});
