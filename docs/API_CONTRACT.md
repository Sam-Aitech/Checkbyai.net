# API Contract (DRAFT — Limited Pilot)

**Status:** Limited pilot — approval required. No self-serve public API yet.
**Contact:** api@checkbyai.net
**Last updated:** 2026-09-18

This document describes the *intended* v1 contract shown on `/api-docs`.
Do not build production integrations until pilot access is confirmed.

## Base URL (intended)

`https://api.checkbyai.net/api/v1`

## Auth (pilot keys only)

Pilot customers receive a key manually:

`Authorization: Bearer YOUR_API_KEY`

## Intended endpoints

- `POST /api/v1/verify` — multipart `file=@certificate.pdf`, optional `priority=standard`
- `GET /api/v1/verification/:id`
- `GET /api/v1/verification/:id/receipt` (PDF)
- `GET /api/v1/verifications?page&limit&status`

See `client/src/pages/ApiDocs.tsx` for example requests/responses.

## Current production truth

Live verification API is same-origin session-cookie only:

- `POST /api/verify` (multipart `document`, closed beta, login required)
- `GET /api/verify/status/:jobId`

Documented in `docs/API_REFERENCE.md`. Promote this file to v1 GA spec only when the public host, Bearer auth, SDKs, and rate limits ship.
