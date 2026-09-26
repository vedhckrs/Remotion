#!/usr/bin/env node
/**
 * One-time YouTube OAuth: gets a refresh token for publish.mjs.
 *
 *   node scripts/auth-youtube.mjs [--write]
 *
 * Needs YT_CLIENT_ID and YT_CLIENT_SECRET in .env (a "Desktop app" OAuth client from Google Cloud
 * Console with the YouTube Data API v3 enabled; add your Google account as a test user while the
 * consent screen is in testing). Opens the consent page, catches the redirect on
 * http://localhost:4546/callback, exchanges the code and prints YT_REFRESH_TOKEN. --write appends
 * it to .env. Scopes: youtube.upload (videos) + youtube.force-ssl (thumbnails, captions).
 * Unverified apps get refresh tokens that expire after 7 days: publish the consent screen or keep
 * the app in "testing" and re-run this when uploads start failing with invalid_grant.
 */
import fs from 'node:fs';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {loadEnv, parseArgs, requireEnv} from './lib/env.mjs';

loadEnv();
const args = parseArgs(process.argv.slice(2));
const clientId = requireEnv('YT_CLIENT_ID');
const clientSecret = requireEnv('YT_CLIENT_SECRET');
const port = Number(args.port || 4546);
const redirect = `http://localhost:${port}/callback`;
const scope = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.force-ssl'].join(' ');

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({client_id: clientId, redirect_uri: redirect, response_type: 'code', scope, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true'})}`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname !== '/callback') {
    res.writeHead(404);
    return res.end();
  }
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (error || !code) {
    res.end(`Authorization failed: ${error || 'no code'}`);
    console.error(`Authorization failed: ${error || 'no code'}`);
    server.close();
    process.exit(1);
  }
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: 'authorization_code'}),
  });
  const tokens = await tokenRes.json();
  if (!tokens.refresh_token) {
    res.end('No refresh token returned. Remove the app at https://myaccount.google.com/permissions and run again.');
    console.error('No refresh token in response:', tokens);
    server.close();
    process.exit(1);
  }
  res.end('YouTube connected. You can close this tab and return to the terminal.');
  console.log('\nAdd this to .env (never commit it):');
  console.log(`YT_REFRESH_TOKEN=${tokens.refresh_token}`);
  if (args.write) {
    const env = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
    const lines = env.split('\n').filter((l) => !l.startsWith('YT_REFRESH_TOKEN='));
    lines.push(`YT_REFRESH_TOKEN=${tokens.refresh_token}`);
    fs.writeFileSync('.env', lines.join('\n').replace(/\n+$/, '') + '\n');
    console.log('Written to .env');
  }
  // Sanity check: which channel did we get?
  const me = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {headers: {Authorization: `Bearer ${tokens.access_token}`}}).then((r) => r.json());
  const channel = me.items?.[0]?.snippet?.title;
  if (channel) console.log(`Channel: ${channel}`);
  server.close();
  process.exit(0);
});

server.listen(port, () => {
  console.log('Open this URL, sign in with the channel account and allow access:\n');
  console.log(authUrl + '\n');
  if (process.platform === 'darwin') spawn('open', [authUrl], {stdio: 'ignore'});
});
