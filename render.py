#!/usr/bin/env python3
import json, struct, zlib

BIOME_COLORS = {
    'ocean': (0x22,0x66,0xaa), 'beach': (0xe8,0xd8,0x8c),
    'grassland': (0x5d,0xaa,0x40), 'forest': (0x2e,0x7d,0x32),
    'desert': (0xdb,0xb8,0x5c), 'mountain': (0x9e,0x9e,0x9e),
    'tundra': (0xe0,0xe8,0xf0), 'swamp': (0x4a,0x6e,0x48),
}

def clamp(v): return max(0, min(255, v))

def make_png(width, height, pixels_func):
    """Write PNG from a pixel function(x,y)->(r,g,b)"""
    import io
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter none
        for x in range(width):
            r,g,b = pixels_func(x, y)
            raw.extend((r, g, b))
    
    compressed = zlib.compress(bytes(raw), 6)
    
    out = io.BytesIO()
    out.write(b'\x89PNG\r\n\x1a\n')
    
    def chunk(ctype, data):
        out.write(struct.pack('>I', len(data)))
        out.write(ctype)
        out.write(data)
        out.write(struct.pack('>I', zlib.crc32(ctype + data) & 0xffffffff))
    
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    chunk(b'IHDR', ihdr)
    chunk(b'IDAT', compressed)
    chunk(b'IEND', b'')
    return out.getvalue()

print("Loading world data...")
with open('output/world-2k.json') as f:
    d = json.load(f)

W, H = d['width'], d['height']
terrain = d['terrain']
tileDefs = d['tileDefs']

# Build lookups
id_to_color = {}
id_to_biome = {}
for td in tileDefs:
    biome = td['biome']
    id_to_color[td['id']] = BIOME_COLORS.get(biome, (128,128,128))
    id_to_biome[td['id']] = biome

# Precompute all tile colors with variant offset
print("Precomputing colors...")
colors = [None] * len(terrain)
for i in range(len(terrain)):
    tid = terrain[i]
    base = id_to_color.get(tid, (128,128,128))
    variant = tid  # use tile id as variant since no separate variant data
    off = (variant % 5) * 8 - 16
    colors[i] = (clamp(base[0]+off), clamp(base[1]+off), clamp(base[2]+off))

# === FULL MAP (800x800, nearest neighbor downsample) ===
print("Rendering full map 800x800...")
OUT_W, OUT_H = 800, 800
scale_x, scale_y = W / OUT_W, H / OUT_H

def full_pixel(x, y):
    sx, sy = int(x * scale_x), int(y * scale_y)
    return colors[sy * W + sx]

png_data = make_png(OUT_W, OUT_H, full_pixel)
with open('output/world-2k-full.png', 'wb') as f:
    f.write(png_data)
print(f"Saved full map: {len(png_data)} bytes")

# === FIND INTERESTING AREA ===
print("Finding interesting crop area...")
# Scan for biome diversity in 400x400 blocks
best_score, best_pos = 0, (500, 500)
for by in range(0, H-400, 100):
    for bx in range(0, W-400, 100):
        biomes = set()
        for sy in range(by, by+400, 20):
            for sx in range(bx, bx+400, 20):
                tid = terrain[sy * W + sx]
                biomes.add(id_to_biome.get(tid, 'unknown'))
        if len(biomes) > best_score:
            best_score = len(biomes)
            best_pos = (bx, by)
            if best_score >= 6:
                break
    if best_score >= 6:
        break

cx, cy = best_pos
print(f"Best crop at ({cx},{cy}) with {best_score} biomes")

# Sample biomes in the crop
crop_biomes = set()
for sy in range(cy, cy+400, 50):
    for sx in range(cx, cx+400, 50):
        crop_biomes.add(id_to_biome.get(terrain[sy*W+sx], 'unknown'))
print(f"Biomes in crop: {crop_biomes}")

# === ZOOMED IN (400x400 tiles at 4px each = 1600x1600) ===
print("Rendering zoom 1600x1600...")

def zoom_pixel(x, y):
    tx, ty = cx + x // 4, cy + y // 4
    return colors[ty * W + tx]

png_data2 = make_png(1600, 1600, zoom_pixel)
with open('output/world-2k-zoom.png', 'wb') as f:
    f.write(png_data2)
print(f"Saved zoom: {len(png_data2)} bytes")
print("Done!")
print(f"CROP_INFO: ({cx},{cy}) biomes={crop_biomes}")
