import assert from 'node:assert/strict';
import test from 'node:test';

import { setCorsHeaders } from '../dist/src/utils/cors.js';

class MockResponse {
  constructor() {
    this.headers = new Map();
  }

  setHeader(name, value) {
    this.headers.set(name, value);
  }
}

function withAllowedOrigins(value, fn) {
  const previous = process.env.ALLOWED_ORIGINS;
  process.env.ALLOWED_ORIGINS = value;
  try {
    fn();
  } finally {
    process.env.ALLOWED_ORIGINS = previous;
  }
}

test('allows exact origin from ALLOWED_ORIGINS', () => {
  withAllowedOrigins('https://palette-mono-shipper.vercel.app', () => {
    const res = new MockResponse();

    setCorsHeaders(res, 'https://palette-mono-shipper.vercel.app');

    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://palette-mono-shipper.vercel.app');
    assert.equal(res.headers.get('Vary'), 'Origin');
  });
});

test('allows vercel preview origin that matches project slug', () => {
  withAllowedOrigins('https://palette-mono-shipper.vercel.app', () => {
    const res = new MockResponse();

    setCorsHeaders(res, 'https://palette-mono-shipper-git-develop-fynbos-ai1.vercel.app');

    assert.equal(
      res.headers.get('Access-Control-Allow-Origin'),
      'https://palette-mono-shipper-git-develop-fynbos-ai1.vercel.app'
    );
  });
});

test('blocks unrelated vercel preview origin', () => {
  withAllowedOrigins('https://palette-mono-shipper.vercel.app', () => {
    const res = new MockResponse();

    setCorsHeaders(res, 'https://another-app-git-develop-team.vercel.app');

    assert.ok(!res.headers.has('Access-Control-Allow-Origin'));
  });
});
