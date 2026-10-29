import numpy as np, wave, sys
SR=48000; DUR=float(sys.argv[2]); OUT=sys.argv[1]
N=int(SR*DUR); L=np.zeros(N); R=np.zeros(N)
def hz(m): return 440*2**((m-69)/12)
bpm=84; beat=60/bpm; bar=4*beat; clen=2*bar
# D major: Dmaj7, Bm7, Gmaj7, Asus4->A
prog=[[50,57,61,64,66],[47,54,57,62,66],[43,50,54,59,62],[45,52,57,59,64]]
rng=np.random.default_rng(7)
def env(n,a,r):
    e=np.ones(n); a=min(int(a*SR),n); r=min(int(r*SR),n)
    e[:a]=np.linspace(0,1,a)**2; e[n-r:]*=np.linspace(1,0,r)**2; return e
def add(sig,start,pan=0.0,g=1.0):
    s=int(start*SR); e=min(N,s+len(sig)); 
    if s>=N: return
    seg=sig[:e-s]*g; L[s:e]+=seg*np.sqrt(0.5*(1-pan)); R[s:e]+=seg*np.sqrt(0.5*(1+pan))
t_chord=0.0; i=0
while t_chord<DUR:
    ch=prog[i%4]; n=int((clen+2.5)*SR); t=np.arange(n)/SR
    pad=np.zeros(n)
    for k,m in enumerate(ch):
        f=hz(m+12)
        for det in (-0.12,0.12):
            ff=f*2**(det/12)
            pad+= (np.sin(2*np.pi*ff*t+rng.uniform(0,6))+0.25*np.sin(4*np.pi*ff*t)+0.08*np.sin(6*np.pi*ff*t))
    pad*=env(n,1.8,2.5)*0.018
    add(pad,t_chord,pan=0.0)
    # bass
    fb=hz(ch[0]-12); bn=int((clen+1)*SR); tb=np.arange(bn)/SR
    add(np.sin(2*np.pi*fb*tb)*env(bn,0.4,1.2)*0.10,t_chord)
    # arpeggio, eighth notes, from bar 3 on
    if t_chord>=clen*1.0 and t_chord<DUR-clen:
        notes=[m+24 for m in ch[1:]]+[ch[0]+36]
        pat=[0,2,1,3,4,2,3,1]
        for j in range(16):
            st=t_chord+j*beat/2; m=notes[pat[j%8]%len(notes)]
            pn=int(1.2*SR); tp=np.arange(pn)/SR; f=hz(m)
            pl=(np.sin(2*np.pi*f*tp)+0.3*np.sin(4*np.pi*f*tp))*np.exp(-tp*5.5)*env(pn,0.004,0.3)
            add(pl*0.045*(0.8+0.4*rng.random()),st,pan=(-0.35 if j%2 else 0.35))
    t_chord+=clen; i+=1
# simple reverb: feedback delays
def verb(x):
    y=x.copy()
    for d,g in ((0.0297,0.5),(0.0371,0.48),(0.0411,0.46),(0.0437,0.44)):
        D=int(d*SR); buf=np.zeros_like(x)
        for k in range(D,len(x),D): pass
        z=x.copy()
        for _ in range(12):
            z=np.concatenate([np.zeros(D),z[:-D]])*g; y+=z*0.35
    return y
L=verb(L); R=verb(R)
fade=lambda a,b: None
fi=int(2*SR); fo=int(4*SR)
for ch in (L,R):
    ch[:fi]*=np.linspace(0,1,fi); ch[-fo:]*=np.linspace(1,0,fo)**1.5
m=max(np.abs(L).max(),np.abs(R).max()); L/=m*1.12; R/=m*1.12
data=(np.stack([L,R],1)*32767).astype('<i2')
with wave.open(OUT,'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data.tobytes())
print('ok',DUR)
