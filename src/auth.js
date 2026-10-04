import {AppError} from './errors.js';
const encoder=new TextEncoder(),COOKIE='__Host-reel-session';
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
async function digest(value){return new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)));}
export async function sameSecret(a,b){if(!a||!b)return false;const x=await digest(a),y=await digest(b);let mismatch=0;for(let i=0;i<x.length;i++)mismatch|=x[i]^y[i];return mismatch===0;}
async function signature(payload,env){const key=await crypto.subtle.importKey('raw',await digest(env.AUTH_SESSION_SECRET+'\0'+env.APP_PASSCODE),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(payload)));}
export async function authenticated(request,env,now=Date.now()){
  if(!env.APP_PASSCODE||!env.AUTH_SESSION_SECRET)return false;
  const value=(request.headers.get('Cookie')??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(!value||value.length>256)return false;
  const match=/^(\d{13})\.([0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(value);
  if(!match||Number(match[1])<=now||Number(match[1])>now+8*3600000)return false;
  return sameSecret(match[3],await signature(match[1]+'.'+match[2],env));
}
export async function login(request,env){
  if(!env.APP_PASSCODE||!env.AUTH_SESSION_SECRET)throw new AppError('Site access is not configured.','access',503);
  const body=await request.text();if(body.length>512)throw new AppError('Invalid passcode request.','access',400);
  let data;try{data=JSON.parse(body);}catch{throw new AppError('Invalid passcode request.','access',400);}
  if(typeof data.passcode!=='string'||data.passcode.length>128)throw new AppError('Invalid passcode request.','access',400);
  const now=Date.now(),window=Math.floor(now/900000),address=request.headers.get('CF-Connecting-IP')??'unknown';
  const attemptKey=hex(await digest(env.AUTH_SESSION_SECRET+'\0'+address));
  await env.DB.prepare('DELETE FROM access_attempts WHERE updated_at < ?').bind(now-86400000).run();
  const row=await env.DB.prepare('INSERT INTO access_attempts (id,window,attempts,updated_at) VALUES (?,?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN window=excluded.window THEN attempts+1 ELSE 1 END,window=excluded.window,updated_at=excluded.updated_at RETURNING attempts').bind(attemptKey,window,now).first();
  if(row.attempts>5)throw new AppError('Too many attempts. Try again in 15 minutes.','access',429);
  if(!await sameSecret(data.passcode,env.APP_PASSCODE))throw new AppError('Incorrect passcode.','access',401);
  await env.DB.prepare('DELETE FROM access_attempts WHERE id=?').bind(attemptKey).run();
  const payload=(now+8*3600000)+'.'+crypto.randomUUID();
  return Response.json({authenticated:true},{headers:{'Cache-Control':'no-store','Set-Cookie':`${COOKIE}=${payload}.${await signature(payload,env)}; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict`}});
}
