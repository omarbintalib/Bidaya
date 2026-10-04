"""Render the landing page's small, transparent, looping page-flip GIF and still fallback."""
from pathlib import Path
from math import cos, sin, pi
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / 'public/images/landing'
SIZE, SCALE = 96, 3
INK, PAPER = '#876332', '#f7f3ea'

def render(t):
    image = Image.new('RGBA', (SIZE*SCALE, SIZE*SCALE))
    draw = ImageDraw.Draw(image)
    def line(points, width=1.5, fill=INK):
        draw.line([(round(x*SCALE), round(y*SCALE)) for x,y in points], fill=fill, width=round(width*SCALE), joint='curve')
    def polygon(points):
        draw.polygon([(round(x*SCALE), round(y*SCALE)) for x,y in points], fill=PAPER)
        line(points+[points[0]])
    line([(14,29),(14,72),(44,79),(48,77),(52,79),(82,72),(82,29)], 1.6)
    polygon([(18,23),(29,23),(40,27),(48,32),(48,74),(37,69),(27,66),(18,66)])
    polygon([(48,32),(56,27),(67,23),(78,23),(78,66),(69,66),(58,69),(48,74)])
    for y in (38,46,54):
        line([(24,y),(33,y+1),(41,y+4)], 1.2)
        line([(55,y+4),(64,y+1),(72,y)], 1.2)
    # A leaf arches upward as its free edge travels from the right page to the left.
    phase = min(1, max(0, (t-.12)/.76))
    edge = 48 + 30*cos(pi*phase)
    lift = 12*sin(pi*phase)
    polygon([(48,32),(48+(edge-48)*.5,26-lift),(edge,23-lift*.5),
             (edge,66-lift*.2),(48+(edge-48)*.5,68-lift*.5),(48,74)])
    if abs(edge-48)>7:
        for y in (38,46,54):
            line([(48+(edge-48)*.22,y+3-lift*.35),(48+(edge-48)*.76,y-lift*.35)],1)
    line([(48,32),(48,75)], 1.3)
    return image.resize((SIZE,SIZE), Image.Resampling.LANCZOS)

OUT.mkdir(parents=True, exist_ok=True)
render(0).save(OUT/'book-flip.png')
frames=[]
for i in range(40):
    rgba=render(i/39)
    frame=rgba.convert('RGB').quantize(colors=254)
    frame.paste(255, mask=rgba.getchannel('A').point(lambda a: 255 if a<128 else 0))
    frame.info['transparency']=255
    frames.append(frame)
frames[0].save(OUT/'book-flip.gif', save_all=True, append_images=frames[1:], duration=65, loop=0, disposal=2, transparency=255, optimize=False)
print('Created book-flip.gif (40 frames, looping) and book-flip.png')
