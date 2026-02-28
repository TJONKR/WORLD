#!/usr/bin/env python3
"""Render world JSON to PNG with decoration overlay sprites."""
import json, struct, zlib, sys, os, math

TILE_PX = 4  # pixels per tile for overview
ZOOM_PX = 8  # pixels per tile for zoomed view

BIOME_COLORS = {
    'ocean':     (0x22, 0x66, 0xaa),
    'beach':     (0xe8, 0xd8, 0x8c),
    'grassland': (0x5d, 0xaa, 0x40),
    'forest':    (0x2e, 0x7d, 0x32),
    'desert':    (0xdb, 0xb8, 0x5c),
    'mountain':  (0x9e, 0x9e, 0x9e),
    'tundra':    (0xe0, 0xe8, 0xf0),
    'swamp':     (0x4a, 0x6e, 0x48),
}

# Variant offsets per variant number
VARIANT_OFFSETS = {0: 0, 1: 12, 2: -12}

DECO_COLORS = {
    'deco_tree_pine':  (0x1b, 0x5e, 0x20),
    'deco_tree_oak':   (0x38, 0x8e, 0x3c),
    'deco_tree_palm':  (0x66, 0xbb, 0x6a),
    'deco_rock_small': (0x75, 0x75, 0x75),
    'deco_rock_large': (0x61, 0x61, 0x61),
    'deco_flower':     (0xe9, 0x1e, 0x63),
    'deco_cactus':     (0x2e, 0x7d, 0x32),
    'deco_mushroom':   (0xd3, 0x2f, 0x2f),
    'deco_reed':       (0x8b, 0xc3, 0x4a),
    'deco_snowdrift':  (0xff, 0xff, 0xff),
    'deco_seaweed':    (0x00, 0x69, 0x5c),
}

def clamp(v):
    return max(0, min(255, v))

def make_png(pixels, w, h):
    """Create PNG from flat RGB pixel array."""
    raw = b''
    for y in range(h):
        raw += b'\x00'  # filter none
        for x in range(w):
            idx = (y * w + x) * 3
            raw += bytes(pixels[idx:idx+3])
    
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    idat = zlib.compress(raw, 9)
    return sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')

def render(world_path, out_prefix):
    with open(world_path) as f:
        w = json.load(f)
    
    width, height = w['width'], w['height']
    terrain = w['terrain']
    decorations = w['decorations']
    tile_defs = {d['id']: d for d in w['tileDefs']}
    
    print(f"World: {width}x{height}, {len(w['tileDefs'])} tile types")
    deco_count = sum(1 for d in decorations if d != 0)
    print(f"Decorations: {deco_count}")
    
    # --- Overview (downsampled) ---
    scale = max(1, width // 500)  # target ~500px wide
    ow, oh = width // scale, height // scale
    print(f"Rendering overview {ow}x{oh} (1:{scale})...")
    
    pixels = bytearray(ow * oh * 3)
    for oy in range(oh):
        for ox in range(ow):
            sx, sy = ox * scale, oy * scale
            idx = sy * width + sx
            tid = terrain[idx]
            td = tile_defs.get(tid)
            if td:
                bc = BIOME_COLORS.get(td['biome'], (255, 0, 255))
                off = VARIANT_OFFSETS.get(td.get('variant', 0), 0)
                r, g, b = clamp(bc[0]+off), clamp(bc[1]+off), clamp(bc[2]+off)
            else:
                r, g, b = 255, 0, 255
            
            # Check for decoration at this sample point
            did = decorations[idx]
            if did != 0:
                dd = tile_defs.get(did)
                if dd and dd['name'] in DECO_COLORS:
                    dc = DECO_COLORS[dd['name']]
                    # Blend 60% deco + 40% terrain
                    r = clamp(int(dc[0]*0.6 + r*0.4))
                    g = clamp(int(dc[1]*0.6 + g*0.4))
                    b = clamp(int(dc[2]*0.6 + b*0.4))
            
            pi = (oy * ow + ox) * 3
            pixels[pi] = r
            pixels[pi+1] = g
            pixels[pi+2] = b
    
    overview_path = f"{out_prefix}-overview.png"
    with open(overview_path, 'wb') as f:
        f.write(make_png(pixels, ow, oh))
    print(f"Saved: {overview_path}")
    
    # --- Zoomed detail (center 200x200 tiles at 8px/tile) ---
    crop = 200
    cx, cy = width // 2 - crop // 2, height // 2 - crop // 2
    zw, zh = crop * ZOOM_PX, crop * ZOOM_PX
    print(f"Rendering zoom {zw}x{zh} (tiles [{cx},{cy}]-[{cx+crop},{cy+crop}])...")
    
    zpx = bytearray(zw * zh * 3)
    for ty in range(crop):
        for tx in range(crop):
            wx, wy = cx + tx, cy + ty
            idx = wy * width + wx
            tid = terrain[idx]
            td = tile_defs.get(tid)
            if td:
                bc = BIOME_COLORS.get(td['biome'], (255, 0, 255))
                off = VARIANT_OFFSETS.get(td.get('variant', 0), 0)
                r, g, b = clamp(bc[0]+off), clamp(bc[1]+off), clamp(bc[2]+off)
            else:
                r, g, b = 255, 0, 255
            
            # Fill terrain pixels
            for py in range(ZOOM_PX):
                for px_i in range(ZOOM_PX):
                    pi = ((ty * ZOOM_PX + py) * zw + (tx * ZOOM_PX + px_i)) * 3
                    zpx[pi] = r
                    zpx[pi+1] = g
                    zpx[pi+2] = b
            
            # Draw decoration sprite
            did = decorations[idx]
            if did != 0:
                dd = tile_defs.get(did)
                if dd and dd['name'] in DECO_COLORS:
                    dc = DECO_COLORS[dd['name']]
                    name = dd['name']
                    cx2 = tx * ZOOM_PX + ZOOM_PX // 2
                    cy2 = ty * ZOOM_PX + ZOOM_PX // 2
                    
                    # Draw shape based on type
                    if 'tree' in name:
                        # Triangle (tree)
                        for dy in range(-3, 4):
                            w2 = max(0, 3 - abs(dy))
                            for dx in range(-w2, w2 + 1):
                                px2, py2 = cx2 + dx, cy2 + dy
                                if 0 <= px2 < zw and 0 <= py2 < zh:
                                    pi = (py2 * zw + px2) * 3
                                    zpx[pi] = dc[0]
                                    zpx[pi+1] = dc[1]
                                    zpx[pi+2] = dc[2]
                    elif 'rock' in name:
                        # Circle
                        rad = 2 if 'large' in name else 1
                        for dy in range(-rad, rad+1):
                            for dx in range(-rad, rad+1):
                                if dx*dx + dy*dy <= rad*rad:
                                    px2, py2 = cx2+dx, cy2+dy
                                    if 0 <= px2 < zw and 0 <= py2 < zh:
                                        pi = (py2 * zw + px2) * 3
                                        zpx[pi] = dc[0]
                                        zpx[pi+1] = dc[1]
                                        zpx[pi+2] = dc[2]
                    elif 'flower' in name or 'snowdrift' in name:
                        # Diamond
                        for dy in range(-2, 3):
                            w2 = 2 - abs(dy)
                            for dx in range(-w2, w2+1):
                                px2, py2 = cx2+dx, cy2+dy
                                if 0 <= px2 < zw and 0 <= py2 < zh:
                                    pi = (py2 * zw + px2) * 3
                                    zpx[pi] = dc[0]
                                    zpx[pi+1] = dc[1]
                                    zpx[pi+2] = dc[2]
                    else:
                        # Line (cactus, reed, seaweed)
                        for dy in range(-3, 4):
                            px2, py2 = cx2, cy2+dy
                            if 0 <= px2 < zw and 0 <= py2 < zh:
                                pi = (py2 * zw + px2) * 3
                                zpx[pi] = dc[0]
                                zpx[pi+1] = dc[1]
                                zpx[pi+2] = dc[2]
    
    zoom_path = f"{out_prefix}-zoom.png"
    with open(zoom_path, 'wb') as f:
        f.write(make_png(zpx, zw, zh))
    print(f"Saved: {zoom_path}")

if __name__ == '__main__':
    world = sys.argv[1] if len(sys.argv) > 1 else 'output/world-2k-deco.json'
    prefix = sys.argv[2] if len(sys.argv) > 2 else 'output/world-deco'
    render(world, prefix)
