from PIL import Image, ImageDraw
import os
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
NAVY=(11,42,91,255); YEL=(242,194,48,255); WHITE=(255,255,255,255)
def draw(size=1024, maskable=False, rounded=True):
    im = Image.new("RGBA",(size,size),(0,0,0,0)); d = ImageDraw.Draw(im)
    if maskable: d.rectangle([0,0,size,size], fill=NAVY)
    else: d.rounded_rectangle([0,0,size-1,size-1], radius=int(size*0.22) if rounded else 0, fill=NAVY)
    s = 0.62 if maskable else 0.78           # skala isi (maskable butuh safe zone)
    w = size*s; x0=(size-w)/2; y0=(size-w)/2
    def P(px,py): return (x0+px*w, y0+py*w)
    # papan klip
    d.rounded_rectangle([P(0.14,0.10),P(0.86,0.98)], radius=int(w*0.07), fill=WHITE)
    d.rounded_rectangle([P(0.32,0.02),P(0.68,0.18)], radius=int(w*0.05), fill=YEL)
    # garis rubrik
    for i,yy in enumerate([0.34,0.50,0.66]):
        d.rounded_rectangle([P(0.26,yy),P(0.34,yy+0.07)], radius=int(w*0.015), fill=NAVY)
        d.rounded_rectangle([P(0.40,yy+0.015),P(0.74 if i<2 else 0.56,yy+0.055)], radius=int(w*0.02), fill=(170,182,204,255))
    # centang
    d.line([P(0.52,0.83),P(0.62,0.91),P(0.80,0.71)], fill=YEL, width=int(w*0.07), joint="curve")
    return im
big = draw()
for n in (192,512): big.resize((n,n), Image.LANCZOS).save(f"{OUT}/icon-{n}.png")
draw(maskable=True).resize((512,512), Image.LANCZOS).save(f"{OUT}/icon-maskable-512.png")
draw(rounded=False).resize((180,180), Image.LANCZOS).convert("RGB").save(f"{OUT}/apple-touch-icon.png")
big.resize((64,64), Image.LANCZOS).save(f"{OUT}/favicon.png")
print("ok")
