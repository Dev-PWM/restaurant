import zlib
import struct
import math

def create_png(width, height, filepath):
    # Generates a PNG with MasaFlow brand: terracotta background, inner cream plate, tortilla and 'M'
    raw_data = bytearray()
    
    cx, cy = width / 2.0, height / 2.0
    r_plate = width * 0.38
    r_inner = width * 0.30
    
    bg_r, bg_g, bg_b = 0xa6, 0x49, 0x30 # #a64930
    plate_r, plate_g, plate_b = 0xf8, 0xf5, 0xef # #f8f5ef
    masa_r, masa_g, masa_b = 0xe2, 0xa1, 0x4e # #e2a14e
    dark_r, dark_g, dark_b = 0x87, 0x38, 0x22 # #873822
    
    for y in range(height):
        raw_data.append(0) # filter type 0 (None)
        for x in range(width):
            dx = x - cx
            dy = y - cy
            dist = math.sqrt(dx * dx + dy * dy)
            
            # Corner rounding for app icon (corner radius ~ 20% width)
            # Check rounded rect
            cr = width * 0.22
            in_rect = True
            if x < cr and y < cr:
                in_rect = math.hypot(x - cr, y - cr) <= cr
            elif x > width - cr and y < cr:
                in_rect = math.hypot(x - (width - cr), y - cr) <= cr
            elif x < cr and y > height - cr:
                in_rect = math.hypot(x - cr, y - (height - cr)) <= cr
            elif x > width - cr and y > height - cr:
                in_rect = math.hypot(x - (width - cr), y - (height - cr)) <= cr
                
            if not in_rect:
                raw_data.extend((0, 0, 0, 0))
                continue
                
            # Default terracotta bg
            r, g, b, a = bg_r, bg_g, bg_b, 255
            
            # Plate border and fill
            if dist <= r_plate:
                if dist >= r_plate - (width * 0.025):
                    r, g, b = dark_r, dark_g, dark_b
                else:
                    r, g, b = plate_r, plate_g, plate_b
                    
                    # Inner comal circle
                    if dist <= r_inner:
                        # Tortilla shape: dome on bottom
                        tort_y = dy - (height * 0.05)
                        if tort_y >= -(r_inner * 0.6) and tort_y <= (r_inner * 0.5) and abs(dx) <= (r_inner * 0.85):
                            # Half ellipse / tortilla shape
                            ell = (dx / (r_inner * 0.8)) ** 2 + ((tort_y - r_inner * 0.1) / (r_inner * 0.6)) ** 2
                            if ell <= 1.0:
                                r, g, b = masa_r, masa_g, masa_b
                                
                    # Letter 'M' in center
                    # Simple 5-stem M in center
                    mx = dx / (width * 0.18)
                    my = (dy - (height * 0.02)) / (height * 0.18)
                    if -1.0 <= mx <= 1.0 and -1.0 <= my <= 1.0:
                        # Left bar: mx in [-0.85, -0.55]
                        # Right bar: mx in [0.55, 0.85]
                        # Left diagonal, right diagonal
                        in_m = False
                        if -0.85 <= mx <= -0.55 and -0.8 <= my <= 0.8:
                            in_m = True
                        elif 0.55 <= mx <= 0.85 and -0.8 <= my <= 0.8:
                            in_m = True
                        elif -0.55 <= mx <= 0.0 and (my - mx) >= 0.2 and (my - mx) <= 0.6:
                            in_m = True
                        elif 0.0 <= mx <= 0.55 and (my + mx) >= 0.2 and (my + mx) <= 0.6:
                            in_m = True
                        if in_m:
                            r, g, b = dark_r, dark_g, dark_b
                            
            raw_data.extend((r, g, b, a))

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        crc = zlib.crc32(tag + data) & 0xffffffff
        return c + struct.pack('>I', crc)

    png = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png += chunk(b'IHDR', ihdr)
    idat = zlib.compress(bytes(raw_data), 9)
    png += chunk(b'IDAT', idat)
    png += chunk(b'IEND', b'')

    with open(filepath, 'wb') as f:
        f.write(png)

create_png(180, 180, 'assets/apple-touch-icon.png')
create_png(192, 192, 'assets/pwa-192x192.png')
create_png(512, 512, 'assets/pwa-512x512.png')
create_png(512, 512, 'assets/pwa-maskable-512x512.png')
print('Generated PWA icons successfully')
