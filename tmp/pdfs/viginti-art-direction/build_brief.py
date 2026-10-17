from pathlib import Path
import json, html, shutil, zipfile
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT=Path('/Users/jmarr/Desktop/Projects/Viginti')
ART=ROOT/'output/art-direction/viginti-five-worlds'
OUT=ROOT/'output/pdf/viginti-five-worlds-art-direction.pdf'
W,H=960,640
FONT=Path('/System/Library/Fonts/Supplemental')
pdfmetrics.registerFont(TTFont('Arial',str(FONT/'Arial.ttf')))
pdfmetrics.registerFont(TTFont('Arial-Bold',str(FONT/'Arial Bold.ttf')))
pdfmetrics.registerFont(TTFont('Arial-Italic',str(FONT/'Arial Italic.ttf')))
BG='#F6F1E7'; INK='#203139'; MUTED='#5C6A6A'; LINE='#D7D7CD'

worlds=[
dict(slug='01-ministry-of-twenty',name='The Ministry of Twenty',tag='Your luck has been processed.',kind='Risograph paper maquette',effort='Low-medium',pal=['#BFCAB5','#F1E4BC','#D9533F','#233B47'],
fiction='A municipal office has accidentally licensed a casino under the wrong Latin name. Correcting it requires a form that no longer exists. You report to the Department of Recreational Probability, where every triumph is certified by a clerk who would rather be at lunch.',
why='The wrong name becomes institutional fact. The world takes nonsense extremely seriously, so the player never has to. The humour can live in signs, procedures and the physical behaviour of objects, rather than constant dialogue.',
visual='Mint linoleum, cream forms, coral stamps and navy ink. Folded paper, chunky rubber and blunt office geometry. Perspective comes from stacked forms and cutout architecture. Hard graphic shadows and restrained print grain matter more than material realism. Type is narrow, official and slightly oppressive; card ranks stay generous and plain.',
assets='Build a small reusable kit: desk, partition, fan, trays and six stamp silhouettes. Author form layouts, card backs and iconography as clean vector art, then bake decorative ink texture into atlases. Printed graphics can use slight colour misregistration; rank indices cannot. Make geometry shallow and visibly folded. Generative images are useful for exploration; final card typography and symbols should be authored precisely.',
render='Use simple meshes with unlit or custom two-band materials, one deliberate shadow direction and baked contact shading. Anchor paper grain in object UVs so it does not crawl as cards move. Reserve an ink-shadow/halftone pass for selected surfaces, with no full-frame bloom. Cards use subdivided paper meshes for corner lift and curl; the printed face stays crisp. A light risograph treatment must preserve real depth, not flatten the entire scene.',
motion='Deal: a card slips from an interoffice slot, bows once, and lands with a papery slap. Relic: its rubber stamp leans, compresses, then prints a small mark beside the relevant hand. Win: APPROVED lands with a heavy thump; a receipt scrolls out. Bust: a little rejection tab flips over with a disappointed click.',
packs='Three manila envelopes arrive in a document tray: Raise, Deck and Relic. Opening one tears a perforated strip, then presents the normal pick choices. An ante increase is a fresh official notice, not a new rule.',
risk='Too much distress makes it look like a tasteful vintage casino again; too much bureaucracy makes it feel dour. Keep bright paper, ridiculous procedural details and strong silhouettes. Of the five directions, this offers the clearest route to a small, reusable asset library.',
test='One bent card, one compressing stamp and one sliding receipt. If those three actions feel funny and satisfying with the camera locked, the direction has a viable core.',
ref='Papers, Please supplies a useful comparison for tactile desk procedures. This proposal shifts toward bright printed maquettes and absurd civic leisure, rather than borrowing its setting or moral pressure.'),
dict(slug='02-twenty-little-gods',name='Twenty Little Gods',tag='Divine grandeur. Shoebox budget.',kind='Clay stop-motion miniature',effort='Medium-high',pal=['#C96C4D','#F0DDB9','#314DA8','#548B7B'],
fiction='Embarrassingly minor Roman household gods have opened a casino in a shoebox Olympus. The god of small change has appointed himself emperor. Their branding is ancient and authoritative, and their arithmetic is terrible. Every modest payout receives an absurdly disproportionate ceremony.',
why='This is the most natural partner for the Latin title: pomposity without competence. It can be warm, strange and very stupid. A tired little clay dealer gives the table a face without needing a large cast or an expensive narrative.',
visual='Fingerprints, lumpy terracotta, chalk clay, ultramarine cloth and visibly repaired cardboard. Let the stage edges, cotton cloud strings and bottlecap plinths remain visible. Relics are votive miniatures. The world is three-dimensional but proudly made by hand. Cards remain thin printed stock so bending and flipping feel physically right.',
assets='Sculpt a handful of exaggerated forms with imperfect silhouettes, then retopologize for a small game scene. Bake high-detail clay fingerprints and tooling into normal/roughness maps. Share those materials across columns, figures and buttons. Photograph handmade clay studies if practical; scanning is optional. One expressive bust and modular cardboard scenery can carry the whole first environment.',
render='Use rough MeshStandardMaterial surfaces, baked ambient occlusion and a broad warm key light with soft shadows. Normal maps give fingerprints without dense geometry. A few sculpted blend shapes provide compression and expression. Quantize character pose changes around 10-12 poses per second to evoke stop-motion while camera, pointer feedback and card motion remain smooth. This is an authored animation choice, not a reduced game frame rate.',
motion='Deal: paper cards loft, curl and settle against the clay slab. Relic: a votive squeezes itself awake and rebounds. Win: the emperor leans forward, takes a breath, and releases an inadequately small laurel puff. Bust: a cardboard cloud drops on a string; the dealer slowly lowers his eyelids.',
packs='Three little offering parcels sit on a toy altar. Their wrappers unfold into the existing Raise, Deck and Relic choices. New rewards can add more pomp to the same small set, avoiding a need for new temple environments.',
risk='This direction depends on authored sculptural charm. Smooth stock models would erase it. Keep the miniature construction obvious and resist elaborate marble, realistic distant architecture or ornate gold. Stop-motion stepping should never make selection feel sluggish.',
test='A single clay bust reaction, one card bend and a tiny laurel payout. Compare the scene with and without stepped character poses. The personality should survive even with all postprocessing disabled.',
ref='Hylics 2 demonstrates how clay and stop-motion can define a game identity. The proposed world here is a coherent miniature comedy set, rather than its surreal collage language.'),
dict(slug='03-gutter-orbit',name='Gutter Orbit',tag='One exit before the real casino.',kind='Crunchy low-poly space roadside',effort='Low-medium',pal=['#142B39','#DA7740','#B6CE6E','#D8CCAA'],
fiction='The real interstellar casino is twenty-one exits down the ring road. You stopped at exit twenty. A salvage-station owner has installed a deeply unofficial card table between a fuel counter and a broken card printer. Outside is the majesty of the universe; inside, somebody has taped a cone to the floor.',
why='It gives the game room, atmosphere and a little grime while letting the world be funny instead of threatening. Cosmic scale versus mundane incompetence is a durable source of visual jokes. The dealer can be a cheap CRT face with a very small animation vocabulary.',
visual='Angular silhouettes, visibly painted texels, sodium orange, dirty bone, blue steel and lime phosphor. Keep the table brighter than the booth perimeter. The huge planet is a compositional backdrop, not a distraction. Junk relics are immediately recognizable objects bolted onto the rail. Avoid unstructured VHS noise and all-over visual decay.',
assets='Model a modest low-poly kit with deliberate silhouettes. Paint 128-256 pixel texture atlases, with colour and wear placed by hand instead of relying on procedural noise. Use a shared junk-prop atlas and a small sprite/texture set for the CRT face. The planet and far gantry can be a layered background with minimal parallax. Keep separate, cleaner card-face artwork.',
render='Start with a low internal scene target, roughly 640x360 or 960x540, and nearest-neighbour upscale. Texture point sampling and scene pixelation are separate decisions. Test nearest mip sampling where slanted surfaces shimmer. Add a restrained Bayer dither pass for gradients, baked light and vertex colour. Optional vertex snapping belongs on background props only; it should not wobble card ranks or pointer targets. Restrict glow to the CRT and sign.',
motion='Deal: the printer fights the card for a beat, spits it out, then recoils. Relic: a fuse flashes or a spring twangs. Win: the CRT makes its best approximation of a smile and a cheap ticket motor rattles. Bust: the screen gives a tiny error chirp. A loose bolt rolls a few millimetres after a big payout.',
packs='Three sealed surplus pouches fall into a service hatch. A short tear exposes the normal card choices. Ante increases arrive as service-station price notices. The wrapper supports progression without adding a different game economy.',
risk='This is the closest to the low-resolution room-based gambling references, so its comic roadside props must do real identity work. Pixel shimmer and unreadable ranks are the main rendering risks. Readability should decide the internal resolution, not nostalgia.',
test='A moving card at both target resolutions, a tilted atlas-textured rail and a 20-second idle loop. Check whether the card corners remain readable when the player lifts a card and when the camera settles.',
ref='CloverPit is a direct spatial comparison; Jazzpunk is a useful counterweight for comic retro-futurist absurdity. The recipe here is proposed Three.js work, not a claim about either game\'s actual rendering pipeline.'),
dict(slug='04-viginti-live',name='Viginti Live!',tag='You are the entire studio audience.',kind='Cel-shaded bargain television',effort='Medium',pal=['#F16836','#279DA5','#F0C543','#302C3D'],
fiction='It is 3:17 a.m. and a local television station has to fill another hour. Its game show is hosted by a cardboard sunburst on a support stick. They ordered a twenty-segment scoreboard for a game about twenty-one. The producer has decided that nobody will notice.',
why='This is the strongest excuse for exuberant juice. Every hand is a tiny televised event: sting, light cue, mechanical button and inadequate applause. The entire show is visibly cheap, yet it treats the player like a celebrity. It also works without demanding lore or long conversations.',
visual='Persimmon, turquoise, mustard and cream in large graphic shapes. Rounded vinyl consoles, plywood starbursts, stage tape and absurd prize trophies. The host is a flat illustrated cutout in a real 3D set. Hard colour bands and plum outlines do the work; realistic chrome and noisy material detail are reduced. Cards occupy calm cream bays.',
assets='Build simple bevelled stage geometry and modular starburst flats. Draw the host, face cards and prize graphics as vectors; export controlled texture atlases. A single host cutout can have a hinge, two illustrated expressions and a movable glove. Sculptural prize silhouettes should be readable at small sizes. This needs graphic design discipline more than texture realism.',
render='MeshToonMaterial with a nearest-sampled three-step gradient map is a good starting point. Add inverted-hull outlines for chosen silhouettes, or a carefully tuned outline pass. Use stylized highlight shapes rather than costly true reflections. Put halftone in selected shadow regions. Marquee bulbs and the applause sign get selective bloom; card faces and text bypass it. Instanced confetti handles large celebrations without one object per fragment.',
motion='Deal: the button visibly compresses, the card shoots out and overshoots its resting point. Relic: a prize trophy pivots toward the relevant hand. Win: a short bulb chase, rising musical sting and burst of flat stars. Bust: one lonely trombone note, then the host\'s smile rotates down a fraction. Reserve the largest cues for meaningful results.',
packs='Three ridiculous prize podiums reveal Raise, Deck and Relic parcels through spring-loaded lids. The same podiums can recur each reward. An ante increase is a dramatic scoreboard flip with an obviously overenthusiastic sting.',
risk='Five effects firing together would bury the arithmetic. The show needs an explicit hierarchy: selection is a small spring, a scoring row is a local cue, and a completed result owns the room. Broad humour can feel generic unless the underfunded physical construction stays visible.',
test='One satisfying button-to-deal chain and a payout sequence with local versus room-wide lighting. Watch a minute of repeated play: it should still be pleasant once the initial spectacle wears off.',
ref='Thank Goodness You\'re Here! is a useful comparison for committed visual comedy. This proposal puts a graphic cartoon sensibility into a physical television set, with tactile controls and stage machinery.'),
dict(slug='05-picnic-syndicate',name='The Picnic Syndicate',tag='An empire of extremely small stakes.',kind='Sunlit macro material diorama',effort='High',pal=['#B99058','#567048','#B94B49','#F3E5C5'],
fiction='A self-important insect syndicate has converted an abandoned picnic into a casino. A cracker-tin lid is the table, seeds are chips, and a bottlecap is the vault. Their pretentious Latin name comes from the twenty printed on the wrapper. The proprietor wears a top hat much too large for his ambitions.',
why='This is the biggest departure from the casino category. It makes the game feel like a tiny criminal enterprise with a warm, tactile world around it. A discarded screw is a treasure. A jam jar is architecture. The scale can make even small card movement feel surprisingly physical.',
visual='Sun-bleached wood, printed tin, gingham, berry red, warm cream and leaf green. The world uses convincing material scale; insects use simplified, readable character shapes. Huge perimeter props establish size without cluttering the playable surface. Macro depth of field lives beyond the table: all hands and card ranks stay sharp together.',
assets='Photograph or procedurally author a few convincing materials: wood, tin, cloth, paper and strawberry. Retopologize any scans and bake their detail. Model only two or three expressive insect silhouettes, then reuse accessory variants. A giant fruit, jar and grass arch can establish the entire first scene. Tiny printed card art can use insect royalty while rank indices stay standard.',
render='Use MeshStandardMaterial with carefully scaled albedo, roughness and normal maps. Bake most lighting and contact occlusion; add one warm directional key with controlled shadows. Sell scale with large penumbrae and sparse backlit pollen, not a full fog simulation. Fake fruit translucency with tuned lighting and material response before considering expensive scattering. Keep depth-of-field blur behind a protected gameplay region, or omit it entirely.',
motion='Deal: a grass-blade lever flicks a paper card into a small elastic arc. Relic: a screw head rings or a sequin catches a brief light glint. Win: seeds hop into the bottlecap with dry little taps; one beetle struggles to haul a disproportionately small payout. Bust: the jar-lid vault shuts with an embarrassingly tiny clink.',
packs='Three folded sandwich-paper bundles arrive on a little serving tray. Unwrapping one exposes the normal card choices. Each ante increase can change the wrapper notice. Keep the same actual cash values and rules; the small-stakes fiction is a presentation layer.',
risk='The highest asset burden here: scale, materials and charming bugs must agree. Too much fuzz or photographic insect detail becomes unpleasant; too much blur ruins play. Keep the first prototype to the tin, one beetle and three oversized perimeter props.',
test='A seed payout, one card lift and one beetle reaction under a single sun light. Test the table with the background completely blurred and completely sharp; the game should read correctly in both cases.',
ref='Tinykin is a useful scale reference for ordinary objects becoming environments. The proposed identity is a contained picnic crime comedy with macro materials, rather than a large traversal world.')
]

for d in worlds:
    d['image']=str(ART/'images'/f"{d['slug']}.png")
    assert Path(d['image']).exists()
(ART/'production-notes.json').write_text(json.dumps(worlds,indent=2))

c=canvas.Canvas(str(OUT),pagesize=(W,H))
c.setTitle('Viginti - Five Worlds: Art Direction Exploration')
c.setAuthor('Viginti / Art Direction Exploration')
c.setSubject('Five generated visual targets, fiction, asset workflows and proposed Three.js rendering approaches')
page=0

def txt(s,x,y,size=12,color=INK,font='Arial'):
    c.setFillColor(HexColor(color));c.setFont(font,size);c.drawString(x,y,s)

def para(s,x,y,w,size=11.3,color=INK,leading=16,font='Arial'):
    st=ParagraphStyle('body',fontName=font,fontSize=size,leading=leading,textColor=HexColor(color),spaceAfter=0)
    p=Paragraph(s,st);pw,ph=p.wrap(w,1000)
    p.drawOn(c,x,y-ph)
    return y-ph

def block(label,s,x,y,w):
    txt(label.upper(),x,y,9.2,MUTED,'Arial-Bold')
    return para(s,x,y-14,w)-22

def bg(dark=False):
    global page
    page+=1;c.setFillColor(HexColor(INK if dark else BG));c.rect(0,0,W,H,fill=1,stroke=0)

def footer(dark=False):
    color='#AAB7B4' if dark else MUTED
    txt('VIGINTI  /  FIVE WORLDS  /  ART DIRECTION EXPLORATION',36,21,8,color)
    c.setFillColor(HexColor(color));c.setFont('Arial',8);c.drawRightString(W-36,21,f'{page:02d} / 14')
    c.showPage()

def image_fit(path,x,y,w,h):
    im=ImageReader(path);iw,ih=im.getSize();scale=min(w/iw,h/ih)
    c.drawImage(im,x+(w-iw*scale)/2,y+(h-ih*scale)/2,width=iw*scale,height=ih*scale,mask='auto')

bg(True)
txt('VIGINTI',42,554,62,'#F6F1E7','Arial-Bold')
para('Five wrong places<br/>to play twenty-one.',44,490,355,31,'#F6F1E7',37,'Arial-Bold')
para('An exploration of fiction, materials and motion for a more physical, more ridiculous game.',44,370,330,16,'#D1DAD1',23)
para('Three hands. Six relics. One deliberately wrong name. Five independent art directions built around the same readable table.',44,269,322,12.3,'#D1DAD1',18)
txt('17 OCTOBER 2026',44,119,9,'#BFCAB5','Arial-Bold')
para('Generated concept frames, not implemented Three.js scenes or performance measurements. Working titles; proposed production methods.',44,94,325,10,'#AAB7B4',14)
for i,d in enumerate(worlds):
    y=526-i*107
    c.setFillColor(HexColor(d['pal'][0]));c.rect(429,y,6,92,fill=1,stroke=0)
    image_fit(d['image'],445,y,164,92)
    txt(f'0{i+1}',626,y+71,10,d['pal'][0],'Arial-Bold')
    para(d['name'],626,y+58,286,17,'#F6F1E7',21,'Arial-Bold')
    para(d['kind'],626,y+24,286,10.5,'#B9C4C0',14)
footer(True)

bg();txt('Choose the kind of ridiculous.',36,584,32,INK,'Arial-Bold')
para('A qualitative production comparison. Effort is relative to the other concepts, not a schedule or quote.',38,556,880,11,MUTED,15)
txt('WORLD / MATERIAL LANGUAGE',198,512,9,MUTED,'Arial-Bold')
txt('WHAT IT BUYS VIGINTI',477,512,9,MUTED,'Arial-Bold')
txt('RELATIVE ASSET / RENDERING BURDEN',714,512,9,MUTED,'Arial-Bold')
benefits=['Best deadpan title joke; clean, reusable graphic identity.','Most expressive character and tactile material identity.','Atmosphere and depth with a compact retro asset kit.','Strongest natural home for celebratory feedback.','Largest departure from familiar gambling settings.']
burdens=['Low-medium: a small prop kit; disciplined print treatment.','Medium-high: custom sculptural charm and animation.','Low-medium: painted texels; aliasing needs testing.','Medium: graphic assets, outline tuning, effects hierarchy.','High: credible scale, materials and expressive insects.']
for i,d in enumerate(worlds):
    y=413-i*88
    if i%2==0:
        c.setFillColor(HexColor('#EBE8DE'));c.rect(30,y-2,900,86,fill=1,stroke=0)
    image_fit(d['image'],38,y+1,144,81)
    para(f"<b>{d['name']}</b><br/>{d['kind']}",198,y+67,257,12,INK,17)
    para(benefits[i],477,y+67,216,11.2,INK,16)
    para(burdens[i],714,y+67,196,11.2,INK,16)
footer()

for i,d in enumerate(worlds):
    bg(True)
    txt(f"0{i+1}  /  {d['name'].upper()}",36,604,16,'#F6F1E7','Arial-Bold')
    c.setFillColor(HexColor('#B7C1BB'));c.setFont('Arial',10);c.drawRightString(924,605,d['tag'])
    image_fit(d['image'],36,65,888,500)
    txt('GENERATED VISUAL TARGET  /  COMPOSITION AND MATERIAL EXPLORATION',36,45,8.3,'#B7C1BB')
    footer(True)
    bg()
    txt(f"0{i+1}  /  {d['name']}",40,590,29,INK,'Arial-Bold')
    txt(d['tag'],42,563,13,MUTED,'Arial-Italic')
    for j,col in enumerate(d['pal']):
        c.setFillColor(HexColor(col));c.rect(782+j*34,566,27,27,fill=1,stroke=0)
    x1,x2,cw=42,500,413;y1=y2=526
    y1=block('The fiction',d['fiction'],x1,y1,cw)
    y1=block('Why it belongs to Viginti',d['why'],x1,y1,cw)
    y1=block('Visual contract',d['visual'],x1,y1,cw)
    y1=block('Asset workflow',d['assets'],x1,y1,cw)
    y2=block('Three.js rendering recipe',d['render'],x2,y2,cw)
    y2=block('How it moves and sounds',d['motion'],x2,y2,cw)
    y2=block('Packs and progression',d['packs'],x2,y2,cw)
    y2=block('Main risk / first test',d['risk']+' '+d['test'],x2,y2,cw)
    assert min(y1,y2)>47,(d['name'],y1,y2)
    footer()

bg();txt('Prototype the feeling before the room.',40,590,30,INK,'Arial-Bold')
para('My first shortlist: Twenty Little Gods for personality, and The Ministry of Twenty for a distinctive, economical production path.',42,555,863,14,INK,20)
y=493
y=block('A common physical foundation','Start with one table, a locked perspective camera, three hand anchors, one dealer anchor and six relic sockets. Try a 35-45 degree vertical field of view and a camera looking down roughly 45-55 degrees; these are starting hypotheses. Let picking a card lift it away from the plane. Keep readable rank corners clear at the smallest supported viewport. On narrow screens, reframe the camera and simplify the environment; do not merely shrink the desktop screenshot.',42,y,414)
y=block('Cards are the shared hero asset','Use front/back faces, a thin visible edge and a subdivided surface. A bend or curl shader can travel across the surface during flips, with corresponding shadow deformation. Normals must follow the bend, and picking must agree with the animated position. Give every theme the same contact shadow and settling motion before adding theme-specific effects.',42,y,414)
y=block('Keep the game authoritative','The existing engine/event/presentation separation is a strong starting point. A future Three.js presentation should consume the same game events and dispatch the same actions. Payouts, pack contents and RNG remain engine-owned. Physical chips can celebrate the cash balance; a physics simulation must never determine it. Retain semantic, keyboard-accessible controls and readable overlays for detailed scores and tooltips.',42,y,414)
assert y>45,y
y=493
y=block('A 30-second comparison clip','0-5s: idle and card hover. 5-10s: draw, lift, curl and settle. 10-16s: place a card and trigger one relic. 16-23s: reveal the dealer and resolve one payout plus one bust. 23-30s: open a pack and reveal choices. Replay the same engine event sequence for both shortlisted themes. This is a proposed next test; it has not been implemented.',500,y,414)
y=block('A bounded juice vocabulary','Selection gets a small lift. Placement gets one spring and one sound. A scoring row gets a local pulse. A completed result can briefly affect the room. Keep particles outside rank corners, stop idle motion during close decisions, and offer reduced motion. Animate decorative characters on stepped poses if desired while input feedback stays responsive.',500,y,414)
y=block('Judge the actual result','Compare card readability, input feel, repeated-play fatigue and frame time on the actual target hardware. A 60 fps target leaves about 16.7 ms per frame; that is a goal, not an achieved benchmark. Test a worst-case payout with all six relics and the longest hands. Build a static-lighting, reduced-particle option before making bloom, blur or many dynamic lights essential.',500,y,414)
assert y>45,y
footer()

sources=[
('Inscryption','https://store.steampowered.com/app/1092790/Inscryption/','Spatial tabletop framing and an authored opponent. Borrow the sense of place; Viginti can pursue a different emotional tone.'),
('CloverPit','https://store.steampowered.com/app/3314790/CloverPit/','A room built around a gambling device. Its official description supports the debt/cell comparison; proposed shader techniques here are our own.'),
('Balatro','https://store.steampowered.com/app/2379780/Balatro/','A useful readability and card-focus comparison. No sales, market-share or performance claims are being made.'),
('Papers, Please','https://store.steampowered.com/app/239030/Papers_Please/','Desk procedures as tactile play; used as a comparison for the Ministry.'),
('Hylics 2','https://store.steampowered.com/app/1286710/Hylics_2/','Its official page describes stop-motion, 3D-scanned clay and pixel art; a material-process reference for the little gods.'),
('Jazzpunk','https://store.steampowered.com/app/250260/Jazzpunk_Directors_Cut/','Comic retro-futurism as a tonal comparison for Gutter Orbit.'),
('Thank Goodness You\'re Here!','https://store.steampowered.com/app/2366980/Thank_Goodness_Youre_Here/','Committed visual absurdity as a tonal comparison for Viginti Live!'),
('Tinykin','https://store.steampowered.com/app/1599020/Tinykin/','Ordinary objects as large environments; a scale comparison for the Picnic Syndicate.')]
tech=[
('MeshToonMaterial','https://threejs.org/docs/pages/MeshToonMaterial.html','Toon shading and nearest-sampled gradient maps.'),
('Texture','https://threejs.org/docs/pages/Texture.html','Independent minification, magnification, mip and anisotropy controls.'),
('RenderTarget','https://threejs.org/docs/pages/RenderTarget.html','Offscreen scene buffers for resolution control and postprocessing.'),
('UnrealBloomPass','https://threejs.org/docs/pages/UnrealBloomPass.html','Bloom strength, radius and luminance threshold controls. Selective compositing needs an explicit scene/mask setup.'),
('InstancedMesh','https://threejs.org/docs/pages/InstancedMesh.html','Repeated geometry with different transforms can reduce draw calls; suitable for pooled coins or confetti.')]
bg();txt('Reference map and provenance.',40,590,30,INK,'Arial-Bold')
para('Primary sources reviewed 17 October 2026. The comparisons are art-direction judgments, not claims that these games use our proposed techniques.',42,557,867,11.4,MUTED,16)
y1=512;txt('GAMES / OFFICIAL STORE PAGES',42,y1,9.3,MUTED,'Arial-Bold');y1-=19
for name,url,note in sources:
    y1=para(f'<b><link href="{url}" color="#345E6A">{html.escape(name)}</link></b> - {html.escape(note)}',42,y1,414,10.2,INK,14)-13
y2=512;txt('THREE.JS / OFFICIAL DOCUMENTATION',500,y2,9.3,MUTED,'Arial-Bold');y2-=19
for name,url,note in tech:
    y2=para(f'<b><link href="{url}" color="#345E6A">{name}</link></b> - {note}',500,y2,414,10.2,INK,14)-13
y2=block('What was actually made','Five selected concept frames were created with the built-in image generation tool. Three received a targeted second pass to strengthen style separation. These are visual proposals, not working Three.js scenes. Generated pips, labels, counters and card layouts are illustrative; final artwork and all rule-facing text need precise authoring. The images do not specify a revised economy or scoring system.',500,y2-6,414)
y2=block('Saved with the brief','The five PNGs, original prompts, revision prompts and production notes are saved under output/art-direction/viginti-five-worlds. The app was inspected through its Enmanner-managed URL. No application source was changed for this exploration. Reference assets were not copied into the proposals.',500,y2,414)
assert min(y1,y2)>42,(y1,y2)
footer()
assert page==14,page
c.save()

zip_path=ROOT/'output/art-direction/viginti-five-worlds.zip'
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(ART.rglob('*')):
        if p.is_file():z.write(p,Path('viginti-five-worlds')/p.relative_to(ART))
    z.write(OUT,Path('viginti-five-worlds')/OUT.name)
print(json.dumps({'pdf':str(OUT),'pages':page,'archive':str(zip_path),'worlds':len(worlds)}))
