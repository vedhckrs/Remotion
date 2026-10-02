# Vercel control site and local Mac rendering

The hosted site is a private render control panel. It can list package libraries, inspect package validation, queue existing videos, show local render progress and request cancellation. The existing local dashboard remains the full production editor, voice/music generator and output player.

Rendering, source media, paid provider credentials and finished videos stay on the Mac. The worker opens outbound HTTPS connections only. The local dashboard binds to 127.0.0.1; do not expose port 4545 publicly.

## Hosting

Use project `nuradi-render-control`. Build command: `npm run build:web`; output: `web/public`; framework: Other. The Node function is `api/control.mjs`. All Remotion dependency versions in the reference project are pinned together; the hosted function itself only uses Node built-ins and fetch.

A dedicated Upstash Redis database provides the durable command queue. Configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` as server-side Vercel environment variables. The Vercel integration also supplies KV_REST_API_URL/KV_REST_API_TOKEN; the function accepts those names directly. Use a separate database so other sites cannot collide with the `nuradi:` keys.

Set three different randomly generated secrets (at least 32 characters each): `NURADI_ADMIN_PASSWORD`, `NURADI_SESSION_SECRET`, `NURADI_WORKER_TOKEN`. Only the worker token is shared with the Mac. Password sign-in sets an eight-hour Secure, HttpOnly, SameSite=Strict signed session cookie. Requests verify the same Origin; credentials stay out of browser storage and logs. Redis results expire after one day. Package titles, paths and job status are sent through the private hosted queue; source media and videos are not uploaded.

## Mac connection

1. Update the selected Remotion project using the skill's scaffold only after reviewing any reported custom-file conflicts. Existing customized files cause the installer to stop before overwriting; backups and ownership hashes are recorded.
2. Start its local dashboard (`npm run dashboard`) and configure its library directory. Keep the default 50% budget to leave room for other apps; 4K uses fewer render tabs.
3. In this repository's local `.env`, set `NURADI_SITE_URL` to the deployed URL and `NURADI_WORKER_TOKEN` to the hosted worker token. Restrict the file to mode 600. Do not copy Redis credentials or the admin password to the worker.
4. Run `npm run worker` from this repository. Keep the Mac awake while rendering; `caffeinate -i npm run worker` can prevent idle sleep. A closed lid or network outage still interrupts availability.
5. Sign in on the hosted site and verify the Mac shows online before queueing a small draft. Verify its local queue and output folder before testing a final render.

Only package IDs, existing video IDs and cancellation IDs are accepted remotely. Arbitrary shell commands, filesystem paths, settings changes, publishing, and paid voice/music generation are rejected. Final rendering still requires valid, complete local voice assets. Draft quality changes resolution/encoding; it does not bypass package voice validation.

The worker uses an exclusive local lock and a journal. A cloud lease prevents two Mac workers consuming the same queue. Command UUIDs are idempotent. An accepted local request with a lost response is reported as interrupted, never automatically repeated. Review the local dashboard before explicitly submitting another render. Queued dashboard work interrupted by a restart remains visible as failed with a retry instruction.

## Domain

The existing Vercel account already associates `www.nuradi.co.in` with an older site. Choose whether to replace that site or use `studio.nuradi.co.in` before moving domains. Add the chosen domain to this project, apply the exact DNS record Vercel displays, preserve unrelated MX/TXT records, and verify both HTTPS and worker connectivity. DNS ownership, routing, Redis provisioning and live end-to-end execution must be verified before calling the domain live.

Official references: [Vercel Functions](https://vercel.com/docs/functions), [Custom domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain).
