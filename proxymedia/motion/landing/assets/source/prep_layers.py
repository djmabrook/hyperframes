# Builds the landing composition's layers from Mohamed's 4K frames (k4/). Coordinates: 4K pixels.
import cv2, numpy as np, json, sys
from scipy.ndimage import binary_fill_holes
K='k4/'; O='o4/'
import os; os.makedirs(O,exist_ok=True)
rd=lambda f: cv2.imread(K+f)
f01,f02,f03,f04,f05,f06,f07=[rd(f) for f in ['01-proxy-media-vhs-4k.png','02-tape-transition-4k.png','03-tape-before-vcr-4k.png','04-vcr-empty-slot-4k.png','05-vcr-tape-loaded-4k.png','06-sony-tv-4k.png','07-tv-screen-closeup-4k.png']]
H,W=2160,3840
def membrane(img, hole, k=16, iters=2500):
    bl=cv2.GaussianBlur(img,(0,0),k/2).astype(np.float32)
    h,w=hole.shape
    sm=cv2.resize(bl,(w//k,h//k),interpolation=cv2.INTER_AREA)
    hm=cv2.resize(cv2.dilate(hole.astype(np.uint8),np.ones((k*2+1,k*2+1),np.uint8)).astype(np.float32),(w//k,h//k),interpolation=cv2.INTER_AREA)>0
    sm[hm]=sm[~hm].mean(0)
    for _ in range(iters):
        p=np.pad(sm,((1,1),(1,1),(0,0)),mode='edge')
        sm[hm]=((p[:-2,1:-1]+p[2:,1:-1]+p[1:-1,:-2]+p[1:-1,2:])/4)[hm]
    up=cv2.GaussianBlur(cv2.resize(sm,(w,h),interpolation=cv2.INTER_CUBIC),(0,0),k)
    return up
def hf(img): f=img.astype(np.float32); return f-cv2.GaussianBlur(f,(0,0),6)
def reflect(i,n):
    i=np.abs(i); i=np.where(i>n-1,2*(n-1)-i,i); return np.clip(i,0,n-1)
def mirror_tex(h, hole, axis=1):
    if axis==0: return mirror_tex(h.transpose(1,0,2), hole.T, 1).transpose(1,0,2)
    tex=np.zeros_like(h); Hh,Ww=hole.shape
    for y in np.where(hole.any(1))[0]:
        xs=np.where(hole[y])[0]
        for sp in np.split(xs,np.where(np.diff(xs)>1)[0]+1):
            L,R=sp[0]-1,sp[-1]+1; mid=(L+R)/2
            tex[y,sp]=h[y,reflect(np.where(sp<mid,2*L-sp,2*R-sp),Ww)]
    return tex
def fill(img, hole, axis=1, feather=24):
    lf=membrane(img,hole); tx=mirror_tex(hf(img),hole,axis)
    out=img.astype(np.float32).copy(); out[hole]=(lf+tx)[hole]
    fm=cv2.GaussianBlur(hole.astype(np.float32),(0,0),feather)[...,None]; fm=np.where(hole[...,None],1,np.clip(fm*2,0,1))
    return np.clip(img*(1-fm)+out*fm,0,255).astype(np.uint8)
def dark_mask(img, thr=70):
    g=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY); n,lab,st,_=cv2.connectedComponentsWithStats((g<thr).astype(np.uint8))
    m=lab==(1+np.argmax(st[1:,4])); m=cv2.morphologyEx(m.astype(np.uint8),cv2.MORPH_CLOSE,np.ones((9,9),np.uint8))>0
    m=binary_fill_holes(m); return cv2.dilate(m.astype(np.uint8),np.ones((5,5),np.uint8))>0
def shadow(orig, clean, region, excl):
    r=cv2.GaussianBlur(orig.astype(np.float32).mean(2),(0,0),2)/np.maximum(cv2.GaussianBlur(clean.astype(np.float32).mean(2),(0,0),2),1)
    a=np.clip((1-r)*1.0,0,1)*region; a[excl]=0
    a=np.where(a<0.025,0,a)
    return a
def save_rgba(path, img, a, box):
    x0,y0,x1,y1=box
    rgba=np.dstack([img,np.clip(a*255,0,255).astype(np.uint8)])[y0:y1,x0:x1]
    cv2.imwrite(path, rgba)
def bbox(m,pad=4):
    ys,xs=np.where(m); return [max(xs.min()-pad,0),max(ys.min()-pad,0),min(xs.max()+pad+1,W),ys.max()+pad+1]
meta={}
# ---- wall: 01 at y=0, 02 at y=DY (text-registered) ----
DY,DX=831,2
CH=H+DY
t01=dark_mask(f01); t02=dark_mask(f02)
canvas=np.zeros((CH,W,3),np.uint8)
s02=np.zeros_like(f02); s02[:,DX:]=f02[:,:W-DX]; s02[:,:DX]=f02[:,:1]
canvas[DY:]=s02
# exposure: match 01 to 02 over clean overlap rows
ov=slice(900,1600); colmask=np.ones(W,bool); colmask[1200:2650]=False
a1=f01[ov][:,colmask].reshape(-1,3).astype(np.float32).mean(0); a2=canvas[ov][:,colmask].reshape(-1,3).astype(np.float32).mean(0)
gain=a2/a1; print('gain 01->02',gain); meta['gain01']=gain.tolist()
g01=np.clip(f01*gain,0,255).astype(np.uint8)
# above the 02 frame: 02's own wall mirrored (only seen under the 01 frame as it fades)
canvas[:DY]=canvas[DY:2*DY][::-1]
# tape02, its shadow and the warm bounce light beside it
t02c=np.zeros((CH,W),bool); t02c[DY:, DX:]=t02[:, :W-DX]
yb=np.where(t02c.any(1))[0]; xb=np.where(t02c.any(0))[0]
holeB=np.zeros((CH,W),bool); holeB[yb.min()-40:min(yb.max()+300,CH), xb.min()-160:xb.max()+330]=True
canvas=fill(canvas,holeB,axis=1)
cv2.imwrite(O+'wall-clean.png',canvas)
# 01 over the clean wall, with a feathered hole where the tape and its shadow are
holeT1=cv2.dilate(t01.astype(np.uint8),np.ones((301,301),np.uint8))>0
holeT1[t01.any(1).nonzero()[0].min()-150:t01.any(1).nonzero()[0].max()+150, :t01.any(0).nonzero()[0].max()+260] |= holeT1[t01.any(1).nonzero()[0].min()-150:t01.any(1).nonzero()[0].max()+150, :t01.any(0).nonzero()[0].max()+260]
a1=1-np.clip(cv2.GaussianBlur(holeT1.astype(np.float32),(0,0),40)*1.6,0,1); a1[t01]=0
save_rgba(O+'wall-01.png', g01, a1, [0,0,W,H])
cl01=canvas[:H]
sh1=shadow(g01, cl01, holeT1.astype(np.float32), t01)
b=bbox(sh1>0,20); save_rgba(O+'tape01-shadow.png', np.zeros_like(f01), sh1, b); meta['tape01_shadow']=b
a=cv2.GaussianBlur(t01.astype(np.float32),(0,0),1.2); b=bbox(t01); save_rgba(O+'tape01.png', g01, a, b); meta['tape01']=b
# tape02 and shadow (in 02 coords, shifted into canvas)
cl02=canvas[DY:]
reg2=(cv2.dilate(t02c[DY:].astype(np.uint8),np.ones((301,301),np.uint8))>0).astype(np.float32)
sh2=shadow(s02, cl02, reg2, t02c[DY:])
b=bbox(sh2>0,20); save_rgba(O+'tape02-shadow.png', np.zeros_like(f01), sh2, b); meta['tape02_shadow']=[b[0],b[1]+DY,b[2],b[3]+DY]
a=cv2.GaussianBlur(t02c[DY:].astype(np.float32),(0,0),1.2); b=bbox(t02c[DY:]); save_rgba(O+'tape02.png', s02, a, b); meta['tape02']=[b[0],b[1]+DY,b[2],b[3]+DY]
meta['wall']={'h':CH,'dy':DY}
# ---- VCR ----
A4=np.float32([[1.00043,-8e-05,-1.44408],[8e-05,1.00043,-1.37641]]); A5=np.float32([[0.99986,0.00039,1.10238],[-0.00039,0.99986,2.02451]])
w4=cv2.warpAffine(f04,A4,(W,H),borderMode=cv2.BORDER_REPLICATE); w5=cv2.warpAffine(f05,A5,(W,H),borderMode=cv2.BORDER_REPLICATE)
cv2.imwrite(O+'vcr-open.png',w4); cv2.imwrite(O+'vcr-closed.png',w5)
poly=np.int32([[1291,1067],[2517,1067],[2589,1361],[2586,1492],[2566,1513],[1243,1513],[1216,1490],[1218,1356]])
pm=np.zeros((H,W),np.uint8); cv2.fillPoly(pm,[poly],1)
d=np.abs(f03.astype(np.int16)-w4.astype(np.int16)).max(2)
dm=(d>45)&(cv2.dilate(pm,np.ones((17,17),np.uint8))>0)&(np.arange(H)[:,None]>1300)
t03=cv2.erode(pm,np.ones((3,3),np.uint8))>0  # polygon traced on frame 3
t03=binary_fill_holes(cv2.morphologyEx(t03.astype(np.uint8),cv2.MORPH_CLOSE,np.ones((9,9),np.uint8))>0)
t03[:1067]=False
b=bbox(t03); meta['tape03']=b
a=cv2.GaussianBlur(t03.astype(np.float32),(0,0),1.2); save_rgba(O+'tape03.png', f03, a, b)
reg3=np.zeros((H,W),np.float32); reg3[b[3]-150:b[3]+600, b[0]-500:b[2]+100]=1
sh3=shadow(f03, w4, reg3, t03)
bs=bbox(sh3>0,20); save_rgba(O+'tape03-shadow.png', np.zeros_like(f01), sh3, bs); meta['tape03_shadow']=bs
# slot lip: top edge of the tape mask at its centre columns
meta['lip']=1067
json.dump(meta,open(O+'meta.json','w'),indent=1,default=int); print(json.dumps(meta,default=int))
