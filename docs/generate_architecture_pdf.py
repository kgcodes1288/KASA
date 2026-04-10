#!/usr/bin/env python3
"""CleanStay Architecture Diagram — 2-page PDF"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, white
from reportlab.pdfgen import canvas as pdf_canvas
import math, os

OUT = os.path.expanduser("~/Desktop/CleanStay_Architecture.pdf")
PW, PH = A4   # 595 x 842 pt

# ── Palette ──────────────────────────────────────────────────────────────────
TEAL        = HexColor('#0d9488')
TEAL_L      = HexColor('#ccfbf1')
BLUE        = HexColor('#3b82f6')
BLUE_L      = HexColor('#dbeafe')
PURPLE      = HexColor('#7c3aed')
PURPLE_L    = HexColor('#ede9fe')
ORANGE      = HexColor('#f59e0b')
ORANGE_L    = HexColor('#fef3c7')
GREEN       = HexColor('#059669')
GREEN_L     = HexColor('#d1fae5')
RED         = HexColor('#dc2626')
RED_L       = HexColor('#fee2e2')
GRAY        = HexColor('#6b7280')
GRAY_L      = HexColor('#f9fafb')
DARK        = HexColor('#111827')
BORDER      = HexColor('#e5e7eb')
BG          = HexColor('#f8fafc')
SLATE       = HexColor('#334155')

# ── Helpers ──────────────────────────────────────────────────────────────────
def rr(c, x, y, w, h, r=8, fill=white, stroke=BORDER, sw=1.2):
    c.setFillColor(fill); c.setStrokeColor(stroke); c.setLineWidth(sw)
    c.roundRect(x, y, w, h, r, stroke=1, fill=1)

def arrow(c, x1, y1, x2, y2, col=GRAY, sw=1.4, dash=None):
    c.setStrokeColor(col); c.setFillColor(col); c.setLineWidth(sw)
    if dash: c.setDash(dash)
    else:    c.setDash([])
    c.line(x1, y1, x2, y2)
    c.setDash([])
    ang = math.atan2(y2 - y1, x2 - x1)
    sz = 5
    c.saveState()
    c.translate(x2, y2); c.rotate(math.degrees(ang))
    p = c.beginPath(); p.moveTo(0,0); p.lineTo(-sz, sz/2); p.lineTo(-sz, -sz/2)
    p.close(); c.drawPath(p, fill=1, stroke=0); c.restoreState()

def label(c, x, y, txt, size=7.5, col=GRAY, bold=False, align='center'):
    c.setFillColor(col)
    font = 'Helvetica-Bold' if bold else 'Helvetica'
    c.setFont(font, size)
    if align == 'center': c.drawCentredString(x, y, txt)
    elif align == 'left':  c.drawString(x, y, txt)
    else:                  c.drawRightString(x, y, txt)

def header(c, title, subtitle='getcleanstays.com'):
    c.setFillColor(TEAL); c.rect(0, PH-58, PW, 58, fill=1, stroke=0)
    c.setFont('Helvetica-Bold', 17); c.setFillColor(white)
    c.drawString(26, PH-37, title)
    c.setFont('Helvetica', 9); c.setFillColor(HexColor('#99f6e4'))
    c.drawRightString(PW-26, PH-37, subtitle)
    c.setFont('Helvetica', 8); c.setFillColor(HexColor('#ccfbf1'))
    c.drawString(26, PH-50, 'Property Management Platform for Short-Term Rental Hosts')

def footer(c, page):
    c.setFont('Helvetica', 7); c.setFillColor(GRAY)
    c.drawCentredString(PW/2, 12, f'CleanStay  ·  System Architecture  ·  Page {page} of 2')

# ── PAGE 1 — Architecture Diagram ────────────────────────────────────────────
def page1(c):
    c.setFillColor(BG); c.rect(0,0,PW,PH,fill=1,stroke=0)
    header(c, '🧹  CleanStay — System Architecture')

    # ── Section label helper
    def sec(x, y, w, h, title, col):
        c.setFont('Helvetica-Bold', 7.5); c.setFillColor(col)
        c.drawString(x+8, y+h-13, title)

    # ─── USER ────────────────────────────────────────────
    UW, UH = 170, 46
    UX = (PW-UW)/2; UY = PH-58-26-UH
    rr(c, UX, UY, UW, UH, r=23, fill=DARK, stroke=DARK, sw=0)
    c.setFont('Helvetica-Bold', 11); c.setFillColor(white)
    c.drawCentredString(UX+UW/2, UY+UH/2+4, '👤  User')
    c.setFont('Helvetica', 8); c.setFillColor(HexColor('#9ca3af'))
    c.drawCentredString(UX+UW/2, UY+UH/2-9, 'Host · Co-host · Contractor')

    # ─── NAMECHEAP ───────────────────────────────────────
    NW, NH = 370, 56
    NX = (PW-NW)/2; NY = UY - 20 - NH
    arrow(c, PW/2, UY, PW/2, NY+NH+1, col=ORANGE)
    label(c, PW/2+68, UY-10, 'visits getcleanstays.com', col=GRAY)

    rr(c, NX, NY, NW, NH, r=10, fill=ORANGE_L, stroke=ORANGE, sw=1.8)
    c.setFont('Helvetica-Bold', 10); c.setFillColor(HexColor('#78350f'))
    c.drawString(NX+12, NY+NH-16, '🌐  Namecheap  —  Domain Registrar')
    c.setFont('Helvetica', 8); c.setFillColor(GRAY)
    c.drawString(NX+12, NY+NH-29, 'Domain: getcleanstays.com  |  DNS: A, CNAME, TXT (SPF / DKIM), MX records')
    c.drawString(NX+12, NY+NH-41, 'Points web traffic → Render  |  Points email verification → Resend')

    # ─── RENDER outer box ────────────────────────────────
    RX = 26; RW = PW-52; RH = 188; RY = NY - 22 - RH
    arrow(c, PW/2, NY, PW/2, RY+RH+1, col=GREEN)
    label(c, PW/2+42, NY-11, 'DNS routes to', col=GRAY)

    rr(c, RX, RY, RW, RH, r=12, fill=GREEN_L, stroke=GREEN, sw=2)
    c.setFont('Helvetica-Bold', 10); c.setFillColor(HexColor('#065f46'))
    c.drawString(RX+12, RY+RH-15, '☁️  Render  —  Cloud Hosting Platform  (hosts all app code + database)')

    # ─── Frontend box (inside Render) ────────────────────
    pad=14; inner_h=RH-36; inner_y=RY+10
    FW=(RW-pad*2-20)/3; FX=RX+pad; FY=inner_y
    rr(c, FX, FY, FW, inner_h, r=8, fill=BLUE_L, stroke=BLUE, sw=1.5)
    c.setFont('Helvetica-Bold', 9.5); c.setFillColor(HexColor('#1e40af'))
    c.drawString(FX+10, FY+inner_h-16, '💻  Frontend')
    lines_fe = ['React 18 + Vite','','Hosted as a static site','on Render','','Pages:','Dashboard, Listings,','Jobs, Tasks, Admin,','Login / Register']
    c.setFont('Helvetica', 8); c.setFillColor(HexColor('#1d4ed8'))
    for i,l in enumerate(lines_fe):
        c.drawString(FX+10, FY+inner_h-30-i*11, l)

    # ─── Backend box (inside Render) ─────────────────────
    BEW=FW; BEX=FX+FW+10; BEY=inner_y
    rr(c, BEX, BEY, BEW, inner_h, r=8, fill=TEAL_L, stroke=TEAL, sw=1.5)
    c.setFont('Helvetica-Bold', 9.5); c.setFillColor(HexColor('#134e4a'))
    c.drawString(BEX+10, BEY+inner_h-16, '⚙️  Backend API')
    lines_be = ['Node.js + Express','','REST API Server','','Routes:','Auth, Listings, Jobs,','Rooms, Tasks,','Co-hosts, Admin','','JWT Authentication']
    c.setFont('Helvetica', 8); c.setFillColor(HexColor('#0f766e'))
    for i,l in enumerate(lines_be):
        c.drawString(BEX+10, BEY+inner_h-30-i*11, l)

    # ─── PostgreSQL box (inside Render) ──────────────────
    DBW=FW; DBX=BEX+BEW+10; DBY=inner_y
    rr(c, DBX, DBY, DBW, inner_h, r=8, fill=PURPLE_L, stroke=PURPLE, sw=1.5)
    c.setFont('Helvetica-Bold', 9.5); c.setFillColor(HexColor('#4c1d95'))
    c.drawString(DBX+10, DBY+inner_h-16, '🗄️  PostgreSQL DB')
    lines_db = ['Managed by Render','ORM: Prisma','','Tables:','Users','Listings','Jobs & Rooms','Tasks','Co-hosts']
    c.setFont('Helvetica', 8); c.setFillColor(PURPLE)
    for i,l in enumerate(lines_db):
        c.drawString(DBX+10, DBY+inner_h-30-i*11, l)

    # Arrows inside Render
    # Frontend ↔ Backend
    arrow(c, FX+FW, FY+inner_h*0.6, BEX, BEY+inner_h*0.6, col=BLUE, sw=1.2)
    arrow(c, BEX, BEY+inner_h*0.4, FX+FW, FY+inner_h*0.4, col=TEAL, sw=1.2)
    label(c, FX+FW+5, FY+inner_h*0.6+3, 'req', col=BLUE, size=7)
    label(c, FX+FW+5, FY+inner_h*0.4+3, 'res', col=TEAL, size=7)
    # Backend ↔ DB
    arrow(c, BEX+BEW, BEY+inner_h*0.55, DBX, DBY+inner_h*0.55, col=PURPLE, sw=1.2)
    arrow(c, DBX, DBY+inner_h*0.4, BEX+BEW, BEY+inner_h*0.4, col=PURPLE, sw=1.2)

    # ─── External services ────────────────────────────────
    svcs = [
        ('GCP',       '🔐', 'Google Cloud\nOAuth 2.0\nGoogle Sign-In',    BLUE_L,   BLUE),
        ('Resend',    '📧', 'Email Service\nInvites & Notifications\nnoreply@getcleanstays.com', ORANGE_L, ORANGE),
        ('Twilio',    '📲', 'SMS Service\nContractor Job Links\nSent via Text', GREEN_L,  GREEN),
        ('Cloudinary','🖼', 'File Storage\nTask Images & PDFs\nCloud CDN',  PURPLE_L, PURPLE),
        ('Airbnb iCal','📅','Calendar Sync\nGuest Bookings\nAuto Job Creation', RED_L, RED),
    ]
    n=len(svcs); SW=(PW-52-(n-1)*8)/n; SH=74; EY=RY-18-SH
    BAR_Y = RY-10

    # Vertical line from Backend centre down to bar
    BE_CX = BEX+BEW/2
    c.setStrokeColor(GRAY); c.setLineWidth(1.4); c.setDash([4,3])
    c.line(BE_CX, RY, BE_CX, BAR_Y)
    c.setDash([])

    # Horizontal bar
    c.setStrokeColor(GRAY); c.setLineWidth(1.2); c.setDash([4,3])
    c.line(26+SW/2, BAR_Y, PW-26-SW/2, BAR_Y)
    c.setDash([])

    for i,(name,icon,desc,fill,stroke) in enumerate(svcs):
        sx=26+i*(SW+8); sy=EY
        cx=sx+SW/2
        # drop line
        c.setStrokeColor(stroke); c.setLineWidth(1.4)
        c.line(cx, BAR_Y, cx, sy+SH+1)
        # arrowhead
        c.setFillColor(stroke)
        p2 = c.beginPath(); p2.moveTo(cx,sy+SH); p2.lineTo(cx-4,sy+SH+6); p2.lineTo(cx+4,sy+SH+6)
        p2.close(); c.drawPath(p2, fill=1, stroke=0)
        # box
        rr(c, sx, sy, SW, SH, r=8, fill=fill, stroke=stroke, sw=1.6)
        c.setFont('Helvetica-Bold', 9); c.setFillColor(DARK)
        c.drawCentredString(cx, sy+SH-15, f'{icon}  {name}')
        c.setFont('Helvetica', 7.5); c.setFillColor(GRAY)
        for j,ln in enumerate(desc.split('\n')):
            c.drawCentredString(cx, sy+SH-28-j*12, ln)

    # ─── Legend ──────────────────────────────────────────
    leg_y = EY - 22
    items = [('Render-hosted',GREEN),('Frontend',BLUE),('Backend/DB',TEAL),('Google Auth',BLUE),
             ('Email',ORANGE),('SMS',GREEN),('Storage',PURPLE),('iCal',RED)]
    c.setFont('Helvetica-Bold', 7.5); c.setFillColor(DARK)
    c.drawString(26, leg_y, 'Legend:')
    lx=70
    for nm, col in items:
        c.setFillColor(col); c.rect(lx,leg_y,8,8,fill=1,stroke=0)
        c.setFont('Helvetica',7); c.setFillColor(GRAY)
        c.drawString(lx+11, leg_y+1, nm)
        lx += c.stringWidth(nm,'Helvetica',7)+24

    footer(c, '1')

# ── PAGE 2 — Tech Stack & Flows ───────────────────────────────────────────────
def page2(c):
    c.setFillColor(BG); c.rect(0,0,PW,PH,fill=1,stroke=0)
    header(c, '🧹  CleanStay — Tech Stack & User Flows')

    y = PH - 76

    # ── Tech Stack ───────────────────────────────────────
    c.setFont('Helvetica-Bold', 12); c.setFillColor(DARK)
    c.drawString(26, y, 'Tech Stack'); y -= 4

    rows = [
        ('Layer',        'Technology',                  'What it does',                                           True),
        ('Frontend',     'React 18 + Vite',             'User interface — fast single-page app served from Render', False),
        ('Backend',      'Node.js + Express',           'REST API server — handles all business logic & routing',  False),
        ('Database',     'PostgreSQL + Prisma ORM',     'Stores users, listings, jobs, tasks, co-hosts',           False),
        ('Auth',         'JWT + Google OAuth (GCP)',    'Secure login — supports email/password & Google Sign-In', False),
        ('Hosting',      'Render',                      'Hosts the frontend, backend API, and PostgreSQL database', False),
        ('Domain / DNS', 'Namecheap',                   'Registers domain, manages DNS records (A, CNAME, TXT, MX)',False),
        ('Email',        'Resend',                      'Sends co-host invite emails & job notification emails',   False),
        ('SMS',          'Twilio',                      'Texts unique job links to contractors (no app needed)',   False),
        ('File Storage', 'Cloudinary',                  'Stores task attachment photos and PDFs in the cloud',     False),
        ('Calendar Sync','Airbnb iCal URL',             'Fetches guest bookings hourly → auto-creates cleaning jobs',False),
    ]
    RH=17; CW=[95,145,285]; TX=26; TW=sum(CW)
    for ri,row in enumerate(rows):
        ry = y - ri*RH
        if row[3]:
            c.setFillColor(TEAL); c.rect(TX,ry-RH+4,TW,RH,fill=1,stroke=0)
            c.setFont('Helvetica-Bold',8.5); c.setFillColor(white)
        elif ri%2==0:
            c.setFillColor(TEAL_L); c.rect(TX,ry-RH+4,TW,RH,fill=1,stroke=0)
            c.setFont('Helvetica',8.5); c.setFillColor(DARK)
        else:
            c.setFillColor(white); c.rect(TX,ry-RH+4,TW,RH,fill=1,stroke=0)
            c.setFont('Helvetica',8.5); c.setFillColor(DARK)
        ox=TX+6
        for ci,cell in enumerate(row[:3]):
            c.drawString(ox, ry-RH+8, str(cell)); ox+=CW[ci]
    c.setStrokeColor(BORDER); c.setLineWidth(0.8)
    c.rect(TX, y-(len(rows)-1)*RH-RH+4, TW, len(rows)*RH, stroke=1, fill=0)

    y -= len(rows)*RH + 22

    # ── User Flows ───────────────────────────────────────
    c.setFont('Helvetica-Bold', 12); c.setFillColor(DARK)
    c.drawString(26, y, 'Key User Flows'); y -= 14

    flows = [
        ('🔐 Login / Register', BLUE_L, BLUE, [
            '1. User opens getcleanstays.com  →  React frontend loads from Render',
            '2a. Email: enters email + password  →  backend checks DB  →  issues JWT token',
            '2b. Google: clicks "Continue with Google"  →  Google (GCP) verifies  →  JWT issued',
            '3. JWT stored in browser  →  every API call includes it for identity verification',
        ]),
        ('🏠 Add Listing & Sync Bookings', TEAL_L, TEAL, [
            '1. Host creates a listing  →  saved to PostgreSQL via Prisma ORM',
            '2. Host pastes Airbnb iCal URL into the listing',
            '3. Backend fetches the iCal feed (hourly auto-sync or manual)  →  parses guest dates',
            '4. Each checkout date  →  auto-creates a Cleaning Job with all rooms & checklists',
        ]),
        ('👥 Invite a Co-host', PURPLE_L, PURPLE, [
            '1. Host clicks "👥 Invite" on a listing card  →  enters co-host email + role',
            '2. Backend creates invite record in DB  →  Resend sends a branded invite email',
            '3. Co-host clicks "Accept Invite" in their email  →  logs in or registers',
            '4. Listing now appears in co-host\'s dashboard with their assigned role & permissions',
        ]),
        ('📲 Assign Job to Contractor', ORANGE_L, ORANGE, [
            '1. Host opens a Cleaning Job  →  clicks "Assign"  →  selects or types contractor',
            '2. Backend creates a unique one-time token link  →  Twilio sends it via SMS',
            '3. Contractor opens link on phone (no login needed)  →  sees rooms + checklist',
            '4. Contractor checks off tasks room-by-room  →  job status updates in real time',
        ]),
        ('🔧 Maintenance Tasks', ORANGE_L, HexColor('#d97706'), [
            '1. Host or co-host adds a maintenance task to any listing or room',
            '2. Task can be one-time or recurring (e.g. every 3 months)',
            '3. Task can be assigned to self, a co-host, or a contractor with a due date',
            '4. Appears in the Jobs tab — can attach photos/PDFs, mark complete, track status',
        ]),
        ('📋 Admin Dashboard', GRAY_L, GRAY, [
            '1. One user is designated admin via ADMIN_EMAIL environment variable on Render',
            '2. Admin sees a "⚙️ Admin" link in the navbar (hidden from everyone else)',
            '3. Dashboard shows platform stats: users, listings, jobs, tasks, co-hosts',
            '4. Full user & listing tables with auth method indicators and activity counts',
        ]),
    ]

    FW=(PW-52-10)/2; FH=72
    for i,(title,fill,stroke,steps) in enumerate(flows):
        col=i%2; row_f=i//2
        fx=26+col*(FW+10); fy=y-row_f*(FH+8)-FH
        rr(c, fx,fy,FW,FH,r=8,fill=fill,stroke=stroke,sw=1.5)
        c.setFont('Helvetica-Bold',9); c.setFillColor(DARK)
        c.drawString(fx+10, fy+FH-15, title)
        c.setFont('Helvetica',7.5); c.setFillColor(SLATE)
        for j,s in enumerate(steps):
            c.drawString(fx+10, fy+FH-28-j*11, s)

    footer(c, '2')

# ── Build ─────────────────────────────────────────────────────────────────────
c = pdf_canvas.Canvas(OUT, pagesize=A4)
c.setTitle('CleanStay — System Architecture')
c.setAuthor('CleanStay'); c.setSubject('Architecture & Tech Stack')

page1(c); c.showPage()
page2(c); c.save()
print(f"Saved: {OUT}")
