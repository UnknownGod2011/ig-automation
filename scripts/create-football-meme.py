"""Render an original football loading/reveal joke. Does not publish anything."""
import json, math, pathlib, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1] / 'artifacts' / 'football-original'
MEDIA = ROOT / 'youtube-top10'
MEDIA.mkdir(parents=True, exist_ok=True)
W, H, FPS, SECONDS = 540, 960, 30, 8.5
VIDEO_ID = 'OrigOct0601'
TARGET = MEDIA / (VIDEO_ID + '.mp4')
FONT = 'C:/Windows/Fonts/arialbd.ttf'
fonts = {n: ImageFont.truetype(FONT, n) for n in [16,18,20,24,28,32,36,40,48,64,82,110]}
def center(draw, text, y, size, color, x=270):
    draw.text((x,y),text,font=fonts[size],fill=color,anchor='mt')

# All audio is synthesized here; no borrowed music, commentary, or samples.
RATE=48000
audio=np.zeros(int(RATE*SECONDS),dtype=np.float64)
for beat in np.arange(0,SECONDS,0.5):
    start=int(beat*RATE); count=min(int(.22*RATE),len(audio)-start);t=np.arange(count)/RATE
    audio[start:start+count]+=.30*np.sin(2*np.pi*(75*t-80*t*t))*np.exp(-t*24)
for beat in np.arange(0,SECONDS,.25):
    start=int(beat*RATE);count=min(int(.05*RATE),len(audio)-start);t=np.arange(count)/RATE
    audio[start:start+count]+=.045*np.sin(2*np.pi*1700*t)*np.exp(-t*100)
for beat,note in zip(np.arange(0,SECONDS,.5),[164.81,196,246.94,329.63]*5):
    start=int(beat*RATE);count=min(int(.25*RATE),len(audio)-start);t=np.arange(count)/RATE
    audio[start:start+count]+=.065*np.sin(2*np.pi*note*t)*np.exp(-t*12)
sound=ROOT/'original-beat.wav'
with wave.open(str(sound),'wb') as f:
    f.setnchannels(2);f.setsampwidth(2);f.setframerate(RATE)
    samples=(np.clip(audio,-.85,.85)*32767).astype('<i2');f.writeframes(np.repeat(samples[:,None],2,axis=1).tobytes())
base=Image.new('RGB',(W,H));px=np.zeros((H,W,3),dtype=np.uint8)
for y in range(H):
    for x in range(W):
        glow=max(0,1-math.hypot((x-270)/380,(y-410)/630))
        px[y,x]=(int(8+9*glow),int(17+29*glow),int(25+25*glow))
base=Image.fromarray(px)
cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size','540x960','-framerate',str(FPS),'-i','pipe:0','-i',str(sound),'-vf','scale=1080:1920:flags=lanczos','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-shortest',str(TARGET)]
proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=subprocess.PIPE)
for frame in range(int(FPS*SECONDS)):
    t=frame/FPS; revealed=t>=4;progress=min(100,int(t/4*100));rating=99 if revealed else int(63+36*progress/100)
    im=base.copy();d=ImageDraw.Draw(im)
    # Stylized pitch lines and a subtle moving light, all drawn from scratch.
    d.rectangle((25,320,515,790),outline=(34,75,69),width=2);d.line((25,554,515,554),fill=(34,75,69),width=2);d.ellipse((176,460,364,648),outline=(34,75,69),width=2)
    center(d,'YOUR MATE AFTER',95,36,'white');center(d,'ONE GOOD GAME',139,40,'#B4FF56')
    center(d,'Updating his self-rating...',200,18,'#95A9B3')
    y=270+int(3*math.sin(t*3)); gold='#F3D17B' if revealed else '#55776C'
    d.rounded_rectangle((77,y,463,y+405),radius=28,fill='#172B29',outline=gold,width=3)
    d.rounded_rectangle((92,y+15,448,y+390),radius=20,outline='#355449',width=1)
    d.text((110,y+35),str(rating),font=fonts[64],fill=gold);d.text((117,y+111),'OVR',font=fonts[18],fill=gold)
    # Original jersey illustration, without a club crest or sponsor.
    shirt=[(228,y+49),(199,y+61),(173,y+106),(208,y+124),(218,y+103),(218,y+195),(342,y+195),(342,y+103),(352,y+124),(387,y+106),(361,y+61),(330,y+49),(303,y+65),(255,y+65)]
    d.polygon(shirt,fill='#BAFF5F',outline='#E3FFC4');d.line((255,y+65,270,y+88,288,y+88,303,y+65),fill='#1B402A',width=4)
    center(d,'9',y+102,64,'#173026',x=280)
    center(d,'GROUP CHAT GOAT',y+225,24,'#F3D17B' if revealed else 'white')
    d.line((113,y+263,427,y+263),fill='#355449',width=1)
    d.text((118,y+280),'99 PACE' if revealed else f'{rating} PACE',font=fonts[20],fill='white')
    d.text((301,y+280),'99 EGO' if revealed else f'{rating} EGO',font=fonts[20],fill='white')
    d.text((118,y+317),'99 SHOT' if revealed else f'{rating} SHOT',font=fonts[20],fill='white')
    if revealed:d.rounded_rectangle((291,y+309,429,y+349),radius=8,fill='#EB4E48')
    d.text((301,y+317),'01 PASS' if revealed else '?? PASS',font=fonts[20],fill='white')
    if not revealed:
        d.rounded_rectangle((85,727,455,746),radius=9,fill='#263E40')
        if progress:d.rounded_rectangle((85,727,85+int(370*progress/100),746),radius=9,fill='#B4FF56')
        center(d,f'{progress}% LOADING',770,24,'#B4FF56')
    else:
        center(d,'STILL WON\'T PASS.',727,36,'#B4FF56')
        center(d,'Every football group has one.',777,20,'white')
    center(d,'FOLLOW FOR MORE FOOTBALL CONTENT',847,16,'#94A8AF')
    if frame in [9,90,195]:im.save(ROOT/f'preview-{frame}.png')
    proc.stdin.write(im.tobytes())
proc.stdin.close();error=proc.stderr.read().decode();code=proc.wait()
if code:raise RuntimeError(error[-500:])
sound.unlink()
proof=json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_format','-show_streams','-of','json',str(TARGET)],text=True))
caption='That one mate after ONE good game 😂\n\n99 ego. 01 passing. Every football group has one.\n\nFOLLOW FOR MORE FOOTBALL CONTENT!\n\n#Football #FootballReels #SundayLeague #FootballMemes'
plan=[{'rank':1,'youtubeId':VIDEO_ID,'sourceUrl':'original://football-loading-2026-10-06','localFile':str(TARGET),'caption':caption,'bytes':TARGET.stat().st_size,'durationSeconds':float(proof['format']['duration']),'originalVideo':True,'originalAudio':True}]
(ROOT/'publish-plan.json').write_text(json.dumps(plan,indent=2),encoding='utf-8')
print(json.dumps({'rendered':True,'duration':plan[0]['durationSeconds'],'bytes':plan[0]['bytes'],'originalAudio':True}))
