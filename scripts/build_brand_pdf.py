import os
import struct
import zlib

class SimplePDF:
    def __init__(self, width=595.28, height=841.89): # A4 in points (210 x 297 mm)
        self.width = width
        self.height = height
        self.pages = []
        self.images = []
        self.fonts = {
            'Serif': 'Times-Roman',
            'SerifBold': 'Times-Bold',
            'SerifItalic': 'Times-Italic',
            'Sans': 'Helvetica',
            'SansBold': 'Helvetica-Bold',
            'SansOblique': 'Helvetica-Oblique',
            'Mono': 'Courier',
            'MonoBold': 'Courier-Bold',
        }

    def add_jpeg_image(self, path):
        with open(path, 'rb') as f:
            data = f.read()
        
        # Parse JPEG dimensions
        i = 0
        w, h = None, None
        while i < len(data) - 1:
            if data[i] == 0xFF:
                marker = data[i+1]
                if marker in (0xC0, 0xC2): # SOF0, SOF2
                    h, w = struct.unpack('>HH', data[i+5:i+9])
                    break
                i += 2
            else:
                i += 1
        name = f"Im{len(self.images) + 1}"
        self.images.append((name, w, h, data))
        return name, w, h

    def add_page(self):
        page = Page(self.width, self.height, self)
        self.pages.append(page)
        return page

    def save(self, filepath):
        raw_objects = []
        raw_objects.append(None) # Catalog
        raw_objects.append(None) # Pages
        
        font_obj_ids = {}
        for fkey, fname in self.fonts.items():
            font_def = f"<< /Type /Font /Subtype /Type1 /BaseFont /{fname} >>"
            raw_objects.append(font_def.encode('latin1'))
            font_obj_ids[fkey] = len(raw_objects)

        image_obj_ids = {}
        for iname, iw, ih, idata in self.images:
            img_header = f"<< /Type /XObject /Subtype /Image /Width {iw} /Height {ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {len(idata)} >>\nstream\n".encode('latin1')
            img_footer = b"\nendstream"
            raw_objects.append(img_header + idata + img_footer)
            image_obj_ids[iname] = len(raw_objects)

        page_obj_ids = []
        for page in self.pages:
            content_bytes = page.get_content_bytes()
            compressed_content = zlib.compress(content_bytes)
            stream_obj = f"<< /Length {len(compressed_content)} /Filter /FlateDecode >>\nstream\n".encode('latin1') + compressed_content + b"\nendstream"
            raw_objects.append(stream_obj)
            stream_id = len(raw_objects)

            font_res = " ".join([f"/{k} {font_obj_ids[k]} 0 R" for k in self.fonts])
            img_res = " ".join([f"/{name} {image_obj_ids[name]} 0 R" for name, _, _, _ in self.images])
            
            page_def = f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {self.width:.2f} {self.height:.2f}] /Contents {stream_id} 0 R /Resources << /Font << {font_res} >> /XObject << {img_res} >> /ProcSet [/PDF /Text /ImageC] >> >>"
            raw_objects.append(page_def.encode('latin1'))
            page_obj_ids.append(len(raw_objects))

        raw_objects[0] = b"<< /Type /Catalog /Pages 2 0 R >>"
        kids = " ".join([f"{pid} 0 R" for pid in page_obj_ids])
        raw_objects[1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_obj_ids)} >>".encode('latin1')

        out = bytearray()
        out.extend(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        
        xref_offsets = []
        for i, obj_data in enumerate(raw_objects):
            xref_offsets.append(len(out))
            obj_num = i + 1
            out.extend(f"{obj_num} 0 obj\n".encode('latin1'))
            out.extend(obj_data)
            out.extend(b"\nendobj\n")

        startxref = len(out)
        out.extend(f"xref\n0 {len(raw_objects) + 1}\n0000000000 65535 f \n".encode('latin1'))
        for offset in xref_offsets:
            out.extend(f"{offset:010d} 00000 n \n".encode('latin1'))

        out.extend(f"trailer\n<< /Size {len(raw_objects) + 1} /Root 1 0 R >>\nstartxref\n{startxref}\n%%EOF\n".encode('latin1'))

        os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
        with open(filepath, 'wb') as f:
            f.write(out)
        print(f"Generated PDF at {filepath} ({len(out)} bytes)")


class Page:
    def __init__(self, width, height, pdf):
        self.width = width
        self.height = height
        self.pdf = pdf
        self.commands = []

    def hex_to_rgb(self, hex_code):
        hex_code = hex_code.lstrip('#')
        r = int(hex_code[0:2], 16) / 255.0
        g = int(hex_code[2:4], 16) / 255.0
        b = int(hex_code[4:6], 16) / 255.0
        return r, g, b

    def set_fill_color(self, hex_code):
        r, g, b = self.hex_to_rgb(hex_code)
        self.commands.append(f"{r:.4f} {g:.4f} {b:.4f} rg")

    def set_stroke_color(self, hex_code):
        r, g, b = self.hex_to_rgb(hex_code)
        self.commands.append(f"{r:.4f} {g:.4f} {b:.4f} RG")

    def set_line_width(self, width):
        self.commands.append(f"{width:.2f} w")

    def rect(self, x, y, w, h, fill=True, stroke=False, fill_hex=None, stroke_hex=None):
        if fill_hex:
            self.set_fill_color(fill_hex)
        if stroke_hex:
            self.set_stroke_color(stroke_hex)
        op = "f" if (fill and not stroke) else ("S" if (stroke and not fill) else ("B" if (fill and stroke) else "n"))
        self.commands.append(f"{x:.2f} {y:.2f} {w:.2f} {h:.2f} re {op}")

    def rounded_rect(self, x, y, w, h, r=5, fill=True, stroke=False, fill_hex=None, stroke_hex=None):
        if fill_hex:
            self.set_fill_color(fill_hex)
        if stroke_hex:
            self.set_stroke_color(stroke_hex)
        k = 0.5522847498 * r
        cmds = [
            f"{x + r:.2f} {y:.2f} m",
            f"{x + w - r:.2f} {y:.2f} l",
            f"{x + w - r + k:.2f} {y:.2f} {x + w:.2f} {y + r - k:.2f} {x + w:.2f} {y + r:.2f} c",
            f"{x + w:.2f} {y + h - r:.2f} l",
            f"{x + w:.2f} {y + h - r + k:.2f} {x + w - r + k:.2f} {y + h:.2f} {x + w - r:.2f} {y + h:.2f} c",
            f"{x + r:.2f} {y + h:.2f} l",
            f"{x + r - k:.2f} {y + h:.2f} {x:.2f} {y + h - r + k:.2f} {x:.2f} {y + h - r:.2f} c",
            f"{x:.2f} {y + r:.2f} l",
            f"{x:.2f} {y + r - k:.2f} {x + r - k:.2f} {y:.2f} {x + r:.2f} {y:.2f} c",
        ]
        op = "f" if (fill and not stroke) else ("S" if (stroke and not fill) else ("B" if (fill and stroke) else "n"))
        cmds.append(op)
        self.commands.append(" ".join(cmds))

    def line(self, x1, y1, x2, y2, stroke_hex=None, width=1):
        if stroke_hex:
            self.set_stroke_color(stroke_hex)
        self.set_line_width(width)
        self.commands.append(f"{x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S")

    def draw_image(self, img_name, x, y, w, h):
        self.commands.append(f"q {w:.2f} 0 0 {h:.2f} {x:.2f} {y:.2f} cm /{img_name} Do Q")

    def escape_text(self, text):
        return text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')

    def text(self, text, x, y, font='Sans', size=10, hex_color=None):
        if hex_color:
            self.set_fill_color(hex_color)
        escaped = self.escape_text(text)
        self.commands.append(f"BT /{font} {size} Tf {x:.2f} {y:.2f} Td ({escaped}) Tj ET")

    def get_content_bytes(self):
        return "\n".join(self.commands).encode('latin1')


def generate_pdf():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    img_path = os.path.join(base_dir, 'public', 'brand_moodboard.jpg')
    out_pdf_path = os.path.join(base_dir, 'outputs', 'The_Taru_Villas_Brand_and_Tech_Stack_Specification.pdf')

    pdf = SimplePDF(width=595.28, height=841.89)
    img_name, img_w, img_h = pdf.add_jpeg_image(img_path)

    # -------------------------------------------------------------
    # PAGE 1: COVER & EXECUTIVE BRAND MOODBOARD
    # -------------------------------------------------------------
    p1 = pdf.add_page()
    p1.rect(0, 0, 595.28, 841.89, fill_hex='#F5F1E8')

    # Top Header Banner
    p1.rect(30, 715, 535.28, 96, fill_hex='#14231B')
    p1.rect(30, 712, 535.28, 3, fill_hex='#B08D57')

    p1.text("THE TARU VILLAS  x  VillaOS", 50, 775, font='SerifBold', size=22, hex_color='#F5F1E8')
    p1.text("TECHNICAL ARCHITECTURE & LUXURY BRAND DESIGN SYSTEM", 50, 755, font='SansBold', size=9, hex_color='#CBB288')
    p1.text("Direct Booking Engine | Property Management System (PMS) | Ubud, Bali", 50, 735, font='Sans', size=9, hex_color='#8AA08E')

    # Moodboard Box
    p1.rect(30, 365, 535.28, 325, fill_hex='#FFFFFF', stroke=True, stroke_hex='#E8E0CF')
    p1.rect(30, 687, 535.28, 3, fill_hex='#B08D57')
    p1.text("BRAND DESIGN SYSTEM & AESTHETIC MOODBOARD", 45, 668, font='SansBold', size=11, hex_color='#14231B')
    p1.text("Tactile Flatlay: Swiss Grid, Chromatic Specs, PBR Shaders & Architectural Insets", 45, 654, font='Sans', size=8, hex_color='#3D5A45')

    # Embed Moodboard Image
    p1.draw_image(img_name, 45, 382, 505.28, 258)
    p1.rect(45, 382, 505.28, 258, fill=False, stroke=True, stroke_hex='#14231B')

    # Left Overview Card
    p1.rounded_rect(30, 100, 260, 245, r=4, fill_hex='#FFFFFF', stroke=True, stroke_hex='#E8E0CF')
    p1.rect(30, 342, 260, 3, fill_hex='#3D5A45')
    p1.text("PROJECT IDENTITY", 45, 325, font='SansBold', size=11, hex_color='#14231B')
    
    p1.text("Product:", 45, 305, font='SansBold', size=9, hex_color='#14231B')
    p1.text("The Taru Villas (Direct Booking + PMS)", 100, 305, font='Sans', size=9, hex_color='#3D5A45')

    p1.text("Location:", 45, 288, font='SansBold', size=9, hex_color='#14231B')
    p1.text("Ayung River Valley, Ubud, Bali", 100, 288, font='Sans', size=9, hex_color='#3D5A45')

    p1.text("Inventory:", 45, 271, font='SansBold', size=9, hex_color='#14231B')
    p1.text("12 Luxury Private Pool Villa Units", 100, 271, font='Sans', size=9, hex_color='#3D5A45')

    p1.text("Core Mission:", 45, 254, font='SansBold', size=9, hex_color='#14231B')
    p1.text("Direct guest acquisition with zero OTA", 45, 238, font='Sans', size=8.5, hex_color='#14231B')
    p1.text("commissions + fully autonomous PMS", 45, 226, font='Sans', size=8.5, hex_color='#14231B')
    p1.text("workspace for hotel operations.", 45, 214, font='Sans', size=8.5, hex_color='#14231B')

    p1.text("Visual Style:", 45, 194, font='SansBold', size=9, hex_color='#14231B')
    p1.text("Tropical Brutalism meets Organic Minimalism,", 45, 180, font='Sans', size=8.5, hex_color='#3D5A45')
    p1.text("calm forest palettes, and brass accents.", 45, 168, font='Sans', size=8.5, hex_color='#3D5A45')

    p1.text("Release:", 45, 148, font='SansBold', size=9, hex_color='#14231B')
    p1.text("v0.1.0-alpha (Opening December 2026)", 100, 148, font='Sans', size=9, hex_color='#B08D57')

    # Right Box: Key Capabilities
    p1.rounded_rect(305, 100, 260, 245, r=4, fill_hex='#FFFFFF', stroke=True, stroke_hex='#E8E0CF')
    p1.rect(305, 342, 260, 3, fill_hex='#B08D57')
    p1.text("CORE CAPABILITY PILLARS", 320, 325, font='SansBold', size=11, hex_color='#14231B')

    caps = [
        ("1. Real-Time Booking Engine", "Server-side rates, dynamic quote, QRIS checkout"),
        ("2. Double-Allocation Prevention", "Database-level room + stay_date unique constraint"),
        ("3. VillaOS Operations Desk", "Arrivals, departures, room assignments, walk-ins"),
        ("4. Comprehensive Control Center", "Daily BAR rates, restrictions, folios, night audit"),
        ("5. Security & Governance", "Role-based authorization & immutable audit logs"),
        ("6. Production Scalability", "Dual SQLite / PostgreSQL migration pipeline"),
    ]
    y_c = 300
    for title, desc in caps:
        p1.text(title, 320, y_c, font='SansBold', size=8.5, hex_color='#14231B')
        p1.text(desc, 332, y_c - 12, font='Sans', size=8, hex_color='#8AA08E')
        y_c -= 32

    # Footer
    p1.line(30, 50, 565.28, 50, stroke_hex='#E8E0CF', width=1)
    p1.text("THE TARU VILLAS  |  PROJECT VILLA SPECIFICATION  |  PAGE 1 OF 4", 30, 38, font='Sans', size=8, hex_color='#8AA08E')
    p1.text("CONFIDENTIAL & PROPRIETARY", 430, 38, font='SansBold', size=8, hex_color='#B08D57')


    # -------------------------------------------------------------
    # PAGE 2: FULL-STACK TECH STACK ARCHITECTURE
    # -------------------------------------------------------------
    p2 = pdf.add_page()
    p2.rect(0, 0, 595.28, 841.89, fill_hex='#F5F1E8')

    p2.rect(30, 755, 535.28, 56, fill_hex='#14231B')
    p2.rect(30, 752, 535.28, 3, fill_hex='#B08D57')
    p2.text("SECTION 1: FULL-STACK TECH STACK ARCHITECTURE", 45, 788, font='SerifBold', size=14, hex_color='#F5F1E8')
    p2.text("Complete breakdown of core runtime, frontend, database, payments, and security.", 45, 768, font='Sans', size=9, hex_color='#CBB288')

    # Stack Category 1: Framework & Core (Top Left)
    p2.rounded_rect(30, 560, 260, 175, r=4, fill_hex='#FFFFFF', stroke=True, stroke_hex='#E8E0CF')
    p2.rect(30, 732, 260, 3, fill_hex='#3D5A45')
    p2.text("CORE RUNTIME & FRAMEWORK", 45, 715, font='SansBold', size=10, hex_color='#14231B')

    stack_items_1 = [
        ("Next.js 16.2.12 (App Router)", "React Server Components, Server Actions & API Routes"),
        ("React 19.2.4 + React DOM", "Concurrent rendering & modern hook primitives"),
        ("TypeScript 5.x", "End-to-end static typing across UI & server models"),
        ("Node.js 20+ Runtime", "High-throughput asynchronous I/O backend execution"),
    ]
    y_s = 690
    for name, detail in stack_items_1:
        p2.text(name, 45, y_s, font='SansBold', size=8.5, hex_color='#14231B')
        p2.text(detail, 45, y_s - 11, font='Sans', size=8, hex_color='#8AA08E')
        y_s -= 30

    # Stack Category 2: UI & Styling (Top Right)
    p2.rounded_rect(305, 560, 260, 175, r=4, fill_hex='#FFFFFF', stroke=True, stroke_hex='#E8E0CF')
    p2.rect(305, 732, 260, 3, fill_hex='#B08D57')
    p2.text("FRONTEND, STYLING & ANIMATION", 320, 715, font='SansBold', size=10, hex_color='#14231B')

    stack_items_2 = [
        ("Tailwind CSS v4 (@tailwindcss/postcss)", "Ultra-fast CSS engine with modern theme tokens"),
        ("Framer Motion 12.40", "Silky hero Ken Burns, marquee, and drawer transitions"),
        ("react-qr-code v2.2.0", "Dynamic real-time QRIS generation on checkout"),
        ("Next/Font Integration", "Sub-resource zero-layout-shift font optimization"),
    ]
    y_s = 690
    for name, detail in stack_items_2:
        p2.text(name, 320, y_s, font='SansBold', size=8.5, hex_color='#14231B')
        p2.text(detail, 320, y_s - 11, font='Sans', size=8, hex_color='#8AA08E')
        y_s -= 30

    # Stack Category 3: Database & ORM (Middle Left)
    p2.rounded_rect(30, 365, 260, 180, r=4, fill_hex='#FFFFFF', stroke=True, stroke_hex='#E8E0CF')
    p2.rect(30, 542, 260, 3, fill_hex='#14231B')
    p2.text("DATABASE LAYER & ORM", 45, 525, font='SansBold', size=10, hex_color='#14231B')

    stack_items_3 = [
        ("Prisma ORM 6.19.3", "Type-safe database client, migrations, & introspections"),
        ("SQLite Local Profile (dev.db)", "Self-contained zero-config local development database"),
        ("PostgreSQL Production Target", "Automated schema converter & migration deployment"),
        ("Room-Night Unique Invariant", "@@unique([roomId, stayDate]) prevents double-booking"),
    ]
    y_s = 500
    for name, detail in stack_items_3:
        p2.text(name, 45, y_s, font='SansBold', size=8.5, hex_color='#14231B')
        p2.text(detail, 45, y_s - 11, font='Sans', size=8, hex_color='#8AA08E')
        y_s -= 30

    # Stack Category 4: Payments & Gateways (Middle Right)
    p2.rounded_rect(305, 365, 260, 180, r=4, fill_hex='#FFFFFF', stroke=True, stroke_hex='#E8E0CF')
    p2.rect(305, 542, 260, 3, fill_hex='#3D5A45')
    p2.text("PAYMENT GATEWAY INTEGRATIONS", 320, 525, font='SansBold', size=10, hex_color='#14231B')

    stack_items_4 = [
        ("Xendit Node SDK (xendit-node v7)", "Xendit Invoice and QRIS Payment Requests API"),
        ("Midtrans Payment Gateway", "Snap modal checkout & Core API webhook handlers"),
        ("Mock Payment Sandbox", "Offline developer simulator for testing transactions"),
        ("Cryptographic Webhooks", "Token/signature verification & payload hash storage"),
    ]
    y_s = 500
    for name, detail in stack_items_4:
        p2.text(name, 320, y_s, font='SansBold', size=8.5, hex_color='#14231B')
        p2.text(detail, 320, y_s - 11, font='Sans', size=8, hex_color='#8AA08E')
        y_s -= 30

    # Stack Category 5: Security & Governance (Bottom Full Width)
    p2.rounded_rect(30, 95, 535.28, 255, r=4, fill_hex='#FFFFFF', stroke=True, stroke_hex='#E8E0CF')
    p2.rect(30, 347, 535.28, 3, fill_hex='#B08D57')
    p2.text("SECURITY, ROLE-BASED ACCESS CONTROL (RBAC) & COMPLIANCE", 45, 330, font='SansBold', size=10.5, hex_color='#14231B')

    p2.text("ROLE MATRIX (SERVER-ENFORCED)", 45, 305, font='SansBold', size=9, hex_color='#3D5A45')
    roles = [
        ("OWNER", "Unrestricted master access: staff management, rates, financial reconciliation, cutover."),
        ("MANAGER", "Daily operations, rate overrides, folios, reports, maintenance dispatch."),
        ("FRONT_DESK", "Arrivals, departures, check-in/out, room assignments, walk-in reservations."),
        ("HOUSEKEEPING", "Room cleaning status (Clean, Dirty, Inspected), maintenance work order requests."),
        ("FINANCE", "Guest folio billing, manual payments, invoice issuance, refunds & settlements."),
        ("VIEWER", "Read-only access for audits, management inspection, and operational monitoring."),
    ]
    y_r = 285
    for rname, rdesc in roles:
        p2.rect(45, y_r - 2, 80, 13, fill_hex='#F5F1E8')
        p2.text(rname, 50, y_r + 1, font='SansBold', size=7.5, hex_color='#14231B')
        p2.text(rdesc, 135, y_r + 1, font='Sans', size=8, hex_color='#14231B')
        y_r -= 18

    p2.line(45, 172, 550, 172, stroke_hex='#E8E0CF', width=0.8)
    p2.text("DEFENSE-IN-DEPTH SECURITY PROTOCOLS", 45, 158, font='SansBold', size=9, hex_color='#3D5A45')

    sec_bullet = [
        "Strict Content-Security-Policy (CSP) with nonce-less whitelisted origins in next.config.ts",
        "Idempotency-Key request headers on all booking & payment mutation endpoints to prevent replay",
        "Immutable Operational Audit Trail logging staff actions with timestamp, user ID, and diffs",
        "Rate-limited booking endpoints and automatic account lockout on consecutive authentication failures"
    ]
    y_sb = 142
    for b in sec_bullet:
        p2.text("*", 45, y_sb, font='SansBold', size=10, hex_color='#B08D57')
        p2.text(b, 58, y_sb, font='Sans', size=8, hex_color='#14231B')
        y_sb -= 14

    p2.line(30, 50, 565.28, 50, stroke_hex='#E8E0CF', width=1)
    p2.text("THE TARU VILLAS  |  PROJECT VILLA SPECIFICATION  |  PAGE 2 OF 4", 30, 38, font='Sans', size=8, hex_color='#8AA08E')
    p2.text("CONFIDENTIAL & PROPRIETARY", 430, 38, font='SansBold', size=8, hex_color='#B08D57')


    # -------------------------------------------------------------
    # PAGE 3: BRAND DESIGN SYSTEM & PALETTE SPECIFICATION
    # -------------------------------------------------------------
    p3 = pdf.add_page()
    p3.rect(0, 0, 595.28, 841.89, fill_hex='#F5F1E8')

    p3.rect(30, 755, 535.28, 56, fill_hex='#14231B')
    p3.rect(30, 752, 535.28, 3, fill_hex='#B08D57')
    p3.text("SECTION 2: BRAND IDENTITY & DESIGN SYSTEM", 45, 788, font='SerifBold', size=14, hex_color='#F5F1E8')
    p3.text("Colorimetry, typographic anatomy, tactile materials, and spatial guidelines.", 45, 768, font='Sans', size=9, hex_color='#CBB288')

    # Color Palette Matrix
    p3.rounded_rect(30, 485, 535.28, 250, r=4, fill_hex='#FFFFFF', stroke=True, stroke_hex='#E8E0CF')
    p3.rect(30, 732, 535.28, 3, fill_hex='#3D5A45')
    p3.text("CHROMATIC COLOR PALETTE & COLORIMETRY SPECIFICATIONS", 45, 715, font='SansBold', size=10.5, hex_color='#14231B')

    colors = [
        ("Nocturnal Forest Ink", "#14231B", "Black Forest 19-5408", "Deep grounding shade for typography & high contrast"),
        ("Botanical Moss", "#3D5A45", "Forest Biome 19-0315", "Primary brand organic green, buttons & active states"),
        ("Muted Sage Mist", "#8AA08E", "Muted Sage 15-6304", "Secondary botanical tone, borders & sub-labels"),
        ("Warm Linen Ivory", "#F5F1E8", "Gardenia 11-0604", "Core canvas background, evoking raw organic linen"),
        ("Porous Sandstone", "#E8E0CF", "Sandstone 13-0905", "Neutral divider lines, card strokes & table headers"),
        ("Brushed Satin Brass", "#B08D57", "Rich Gold Metallic", "Luxury accents, active badges, highlights & rules"),
    ]

    y_col = 675
    for cname, chex, cpantone, cusage in colors:
        p3.rect(45, y_col - 14, 38, 24, fill_hex=chex, stroke=True, stroke_hex='#E8E0CF')
        p3.text(cname, 95, y_col + 1, font='SansBold', size=9, hex_color='#14231B')
        p3.text(f"HEX: {chex}   |   PANTONE: {cpantone}", 95, y_col - 11, font='Mono', size=7.5, hex_color='#8AA08E')
        p3.text(cusage, 330, y_col - 5, font='Sans', size=8, hex_color='#3D5A45')
        p3.line(45, y_col - 18, 550, y_col - 18, stroke_hex='#F5F1E8', width=0.5)
        y_col -= 34

    # Typography Hierarchy
    p3.rounded_rect(30, 265, 535.28, 205, r=4, fill_hex='#FFFFFF', stroke=True, stroke_hex='#E8E0CF')
    p3.rect(30, 467, 535.28, 3, fill_hex='#B08D57')
    p3.text("TYPOGRAPHIC SYSTEM & HIERARCHY", 45, 450, font='SansBold', size=10.5, hex_color='#14231B')

    p3.text("PRIMARY DISPLAY TYPEFACE (SERIF)", 45, 428, font='SansBold', size=9, hex_color='#3D5A45')
    p3.text("Playfair Display -- Neoclassical Transitional Serif", 45, 412, font='SerifBold', size=13, hex_color='#14231B')
    p3.text("High stroke-contrast ratio (1:8), acute hairline serifs, ball terminals, tight optical kerning (-15 tracking).", 45, 396, font='Sans', size=8, hex_color='#14231B')
    p3.text("Usage: Page Hero Headings, Section Titles, Villa Names, Luxury Pullquotes.", 45, 384, font='Sans', size=8, hex_color='#8AA08E')

    p3.line(45, 372, 550, 372, stroke_hex='#E8E0CF', width=0.8)

    p3.text("SECONDARY BODY & UI TYPEFACE (SANS-SERIF)", 45, 354, font='SansBold', size=9, hex_color='#3D5A45')
    p3.text("Jost -- Geometric Neo-Grotesque Sans", 45, 338, font='SansBold', size=11, hex_color='#14231B')
    p3.text("Tall x-height, monoline uniform stroke geometry, generous tracking (+40), tabular numeral lining.", 45, 322, font='Sans', size=8, hex_color='#14231B')
    p3.text("Usage: Body Copy, Navigation Bars, Operator Data Tables, Invoices, Financial Folios.", 45, 310, font='Sans', size=8, hex_color='#8AA08E')

    # Tactile Materials
    p3.rounded_rect(30, 95, 535.28, 155, r=4, fill_hex='#FFFFFF', stroke=True, stroke_hex='#E8E0CF')
    p3.rect(30, 247, 535.28, 3, fill_hex='#14231B')
    p3.text("TACTILE MATERIALS & ARCHITECTURAL PALETTE", 45, 230, font='SansBold', size=10.5, hex_color='#14231B')

    materials = [
        ("Reclaimed Indonesian Teak", "Straight timber grain, satin oil finish, warm golden undertone.", "Exterior louvers, custom bed frames, ceiling slats."),
        ("Honed Volcanic Basalt Stone", "Dark porous volcanic rock, high thermal mass, tactile rough texture.", "Private plunge pools, ensuite bathroom feature walls."),
        ("Heavy Belgian Linen", "Raw unbleached fiber weave, tactile grain, soft oatmeal hue.", "Bedding, drapery, lounge upholstery."),
        ("Brushed Architectural Brass", "Directional satin brush strokes, subtle natural antique patina.", "Plumbing fixtures, door handles, ambient light sconces.")
    ]
    y_m = 208
    for mtitle, mtexture, mapplication in materials:
        p3.text(f"- {mtitle}:", 45, y_m, font='SansBold', size=8.5, hex_color='#14231B')
        p3.text(f"{mtexture} ({mapplication})", 185, y_m, font='Sans', size=8, hex_color='#3D5A45')
        y_m -= 24

    p3.line(30, 50, 565.28, 50, stroke_hex='#E8E0CF', width=1)
    p3.text("THE TARU VILLAS  |  PROJECT VILLA SPECIFICATION  |  PAGE 3 OF 4", 30, 38, font='Sans', size=8, hex_color='#8AA08E')
    p3.text("CONFIDENTIAL & PROPRIETARY", 430, 38, font='SansBold', size=8, hex_color='#B08D57')


    # -------------------------------------------------------------
    # PAGE 4: OPERATIONS & DEPLOYMENT RUNBOOK
    # -------------------------------------------------------------
    p4 = pdf.add_page()
    p4.rect(0, 0, 595.28, 841.89, fill_hex='#F5F1E8')

    p4.rect(30, 755, 535.28, 56, fill_hex='#14231B')
    p4.rect(30, 752, 535.28, 3, fill_hex='#B08D57')
    p4.text("SECTION 3: OPERATIONS & DEPLOYMENT RUNBOOK", 45, 788, font='SerifBold', size=14, hex_color='#F5F1E8')
    p4.text("Operator surfaces, verification scripts, backups, and local execution instructions.", 45, 768, font='Sans', size=9, hex_color='#CBB288')

    # Operator Surfaces Table
    p4.rounded_rect(30, 475, 535.28, 260, r=4, fill_hex='#FFFFFF', stroke=True, stroke_hex='#E8E0CF')
    p4.rect(30, 732, 535.28, 3, fill_hex='#3D5A45')
    p4.text("VILLAOS PMS OPERATOR SURFACES", 45, 715, font='SansBold', size=10.5, hex_color='#14231B')

    surfaces = [
        ("/admin", "Front Desk Desk", "Arrivals, departures, modify/cancel/no-show, check-in/out, room board, housekeeping, walk-in reservations."),
        ("/admin/control -> Rates", "Revenue Management", "BAR daily pricing, minimum stay rules, Closed to Arrival (CTA), Closed to Departure (CTD), stop-sell."),
        ("/admin/control -> Finance", "Guest Accounting", "Folio charges, manual payment posting, refunds, balances, printable branded invoices."),
        ("/admin/control -> Maintenance", "Facility Dispatch", "Work orders, technician assignment, priority, automated out-of-order room blocking."),
        ("/admin/control -> Night Audit", "Daily Reconciliation", "Close business day, exceptions review, automated daily occupancy & revenue snapshots."),
        ("/admin/control -> Reports", "Management Analytics", "Occupancy pace, revenue mix, source attribution, downloadable CSV exports."),
        ("/admin/control -> Team", "Staff & Security", "Staff accounts, role enforcement, session revocation, credential resets."),
    ]

    y_surf = 688
    for sroute, sdomain, scap in surfaces:
        p4.rect(45, y_surf - 3, 140, 14, fill_hex='#F5F1E8')
        p4.text(sroute, 50, y_surf, font='MonoBold', size=7, hex_color='#14231B')
        p4.text(sdomain, 195, y_surf, font='SansBold', size=8, hex_color='#3D5A45')
        p4.text(scap, 45, y_surf - 13, font='Sans', size=7.5, hex_color='#14231B')
        p4.line(45, y_surf - 18, 550, y_surf - 18, stroke_hex='#F5F1E8', width=0.5)
        y_surf -= 31

    # Local CLI Commands (Bottom Left)
    p4.rounded_rect(30, 95, 260, 365, r=4, fill_hex='#FFFFFF', stroke=True, stroke_hex='#E8E0CF')
    p4.rect(30, 457, 260, 3, fill_hex='#14231B')
    p4.text("OPERATIONAL CLI COMMANDS", 45, 440, font='SansBold', size=10, hex_color='#14231B')

    commands = [
        ("npm run dev", "Launch local dev server on http://localhost:3000"),
        ("npm run db:setup", "Generate Prisma client, push SQLite schema, seed data"),
        ("npm run admin:bootstrap", "Create secure random local owner account in outputs/"),
        ("npm run backup", "Timestamped SQLite backup with SHA-256 validation"),
        ("npm run verify", "Audit business invariants & room allocation integrity"),
        ("npm run db:postgres:migrate", "Deploy checked-in PostgreSQL migrations"),
        ("npm run build", "Compile optimized production server bundle"),
    ]
    y_cmd = 415
    for cmd, cmddesc in commands:
        p4.rect(45, y_cmd - 2, 170, 12, fill_hex='#F5F1E8')
        p4.text(cmd, 50, y_cmd + 1, font='MonoBold', size=7.5, hex_color='#14231B')
        p4.text(cmddesc, 45, y_cmd - 12, font='Sans', size=7.5, hex_color='#3D5A45')
        y_cmd -= 34

    # Default Credentials & Access (Bottom Right)
    p4.rounded_rect(305, 95, 260, 365, r=4, fill_hex='#FFFFFF', stroke=True, stroke_hex='#E8E0CF')
    p4.rect(305, 457, 260, 3, fill_hex='#B08D57')
    p4.text("AUTHENTICATION & ACCESS POINTS", 320, 440, font='SansBold', size=10, hex_color='#14231B')

    p4.text("DEFAULT LOCAL ACCESS:", 320, 415, font='SansBold', size=8.5, hex_color='#3D5A45')
    p4.text("URL:", 320, 395, font='SansBold', size=8, hex_color='#14231B')
    p4.text("http://localhost:3000/admin", 365, 395, font='Mono', size=7.5, hex_color='#14231B')

    p4.text("Email:", 320, 378, font='SansBold', size=8, hex_color='#14231B')
    p4.text("admin@thetaruvillas.local", 365, 378, font='Mono', size=7.5, hex_color='#14231B')

    p4.text("Password:", 320, 361, font='SansBold', size=8, hex_color='#14231B')
    p4.text("Taru-E2zL3qWYsjFnuads-7", 375, 361, font='Mono', size=7.5, hex_color='#B08D57')

    p4.line(320, 345, 550, 345, stroke_hex='#E8E0CF', width=0.8)

    p4.text("SECURITY BEST PRACTICES:", 320, 330, font='SansBold', size=8.5, hex_color='#3D5A45')
    sec_notes = [
        "1. Change default credentials upon first login.",
        "2. Create named staff accounts per shift (never share).",
        "3. Keep outputs/VillaOS_LOCAL_LOGIN.txt confidential.",
        "4. Set PAYMENT_PROVIDER to xendit or midtrans in prod.",
        "5. Regularly execute 'npm run backup' before audits.",
        "6. In production, set SEED_DEMO_DATA='false'."
    ]
    y_sn = 310
    for note in sec_notes:
        p4.text(note, 320, y_sn, font='Sans', size=7.5, hex_color='#14231B')
        y_sn -= 16

    # Signoff block
    p4.rect(320, 115, 230, 48, fill_hex='#14231B')
    p4.text("THE TARU VILLAS - VILLAOS 2026", 335, 145, font='SansBold', size=8.5, hex_color='#F5F1E8')
    p4.text("Luxury Architecture x Autonomous Operations", 335, 130, font='Sans', size=7.5, hex_color='#CBB288')

    # Footer
    p4.line(30, 50, 565.28, 50, stroke_hex='#E8E0CF', width=1)
    p4.text("THE TARU VILLAS  |  PROJECT VILLA SPECIFICATION  |  PAGE 4 OF 4", 30, 38, font='Sans', size=8, hex_color='#8AA08E')
    p4.text("CONFIDENTIAL & PROPRIETARY", 430, 38, font='SansBold', size=8, hex_color='#B08D57')

    pdf.save(out_pdf_path)
    print(f"Successfully created PDF: {out_pdf_path}")

if __name__ == '__main__':
    generate_pdf()
