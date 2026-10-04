from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
base=Path(__file__).resolve().parent
src=Image.open(base/'reference.png').convert('RGB')
box=(62,0,246,184)
crop=src.crop(box)
crop.save(base/'crop.png')
canvas=Image.new('RGB',(1000,630),'#f4f2ee')
d=ImageDraw.Draw(canvas)
font='/System/Library/Fonts/Helvetica.ttc'
def label(x,y,text,size=20,fill='#282630'):
 d.text((x,y),text,font=ImageFont.truetype(font,size),fill=fill)
label(36,26,'CHI HAYA / APP ICON REVIEW'.replace('CHI HAYA','CHIHAYA'),28)
label(36,68,'Head-and-shoulders crop / original artwork / no AI retouching',17,'#65616b')
canvas.paste(crop.resize((384,384),Image.Resampling.LANCZOS),(36,124))
label(36,524,'384 px preview from a 184 x 184 crop',17)
label(484,122,'Actual-size previews',22)
for x,s in [(484,128),(650,64),(750,32),(825,16)]:
 canvas.paste(crop.resize((s,s),Image.Resampling.LANCZOS),(x,176))
 label(x,321,str(s)+' px',16)
label(484,376,'Original + crop boundary',18)
thumb=src.resize((180,180),Image.Resampling.LANCZOS)
canvas.paste(thumb,(484,409))
d.rectangle((484+box[0]*.6,409+box[1]*.6,484+box[2]*.6,409+box[3]*.6),outline='#b32774',width=2)
label(704,418,'PROTOTYPE',16,'#8b4775')
label(704,450,'Framing review only',16)
label(704,478,'Square image, original background',14)
canvas.save(base/'review.png')
