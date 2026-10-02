#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.platform!=='darwin')throw new Error('This login-service installer requires macOS');
if(!fs.existsSync(path.join(root,'.env')))throw new Error('Configure the local worker .env first');
const label='com.nuradi.worker.'+crypto.createHash('sha256').update(root).digest('hex').slice(0,12);
const file=path.join(os.homedir(),'Library/LaunchAgents',label+'.plist');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
fs.mkdirSync(path.dirname(file),{recursive:true});fs.mkdirSync(path.join(root,'automation/logs'),{recursive:true});
const log=path.join(root,'automation/logs/mac-worker.log');
fs.writeFileSync(file,`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>/usr/bin/caffeinate</string><string>-i</string><string>/usr/bin/nice</string><string>-n</string><string>10</string><string>${esc(process.execPath)}</string><string>${esc(path.join(root,'scripts/mac-worker.mjs'))}</string></array>
<key>WorkingDirectory</key><string>${esc(root)}</string><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>15</integer>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${esc(path.dirname(process.execPath)+':/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin')}</string></dict>
<key>StandardOutPath</key><string>${esc(log)}</string><key>StandardErrorPath</key><string>${esc(log)}</string></dict></plist>\n`,{mode:0o600});
const checked=spawnSync('plutil',['-lint',file],{encoding:'utf8'});if(checked.status!==0)throw new Error(checked.stderr||checked.stdout);
const user='gui/'+process.getuid();spawnSync('launchctl',['bootout',user,file],{stdio:'ignore'});
const result=spawnSync('launchctl',['bootstrap',user,file],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr||'launchd bootstrap failed');
console.log('Mac worker installed as login service: '+label);console.log('Log: '+log);
