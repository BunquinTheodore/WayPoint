"""Add a looping, deforming rest pose to the supplied chubby cat.

Run in Blender with blender/low-poly-cat-chubby.blend open.
The original model and its materials/topology are retained.
"""
import bpy
import math
import json
import struct
from pathlib import Path

ROOT = Path('/Users/christiannayre/Documents/ChatGPT/Appbuilders Event')
scene = bpy.context.scene
cat = scene.objects['CatMesh2_lambert1_0']
assert cat.data.shape_keys is None, 'Start from the unanimated chubby cat.'

def smooth(a, b, v):
    t = max(0.0, min(1.0, (v-a)/(b-a)))
    return t*t*(3-2*t)

basis = cat.shape_key_add(name='Standing')
rest = cat.shape_key_add(name='Lay down')
breath = cat.shape_key_add(name='Breathing')
tail = cat.shape_key_add(name='Tail flick')

for i, point in enumerate(basis.data):
    x, y, z = point.co
    # Above the leg joints the body descends as one solid form. The lower
    # limbs fold forward/back rather than scaling the entire cat or its feet.
    drop = 3.85 * smooth(0.25, 5.25, z)
    nx, ny, nz = x, y, z-drop
    limb = (1-smooth(4.0, 5.6, z)) * smooth(0.2, 0.9, abs(x))
    foreleg = 1-smooth(-2.4, -1.4, y)
    hindleg = smooth(2.0, 3.0, y)*(1-smooth(5.3, 6.0, y))
    t = max(0.0, min(1.0, z/5.6))
    ny += limb * (-1.15*foreleg + 1.05*hindleg) * math.sin(math.pi*t)
    ny -= 0.55 * foreleg * limb * (1-smooth(0.5, 1.5, z))
    # A small neck bow and relaxed tail finish the pose.
    head = 1-smooth(-6.0, -4.3, y)
    nz -= 0.28*head
    tail_weight = smooth(5.6, 14.1, y)
    nz -= 0.9*tail_weight
    nx += 0.6*tail_weight
    rest.data[i].co = (nx, ny, nz)
    torso = smooth(-4.5, -2.0, y)*(1-smooth(3.0, 5.5, y))*smooth(4.8, 6.2, z)
    breath.data[i].co = (x*(1+0.014*torso), y, z+0.085*torso)
    tail.data[i].co = (x+0.85*math.sin(tail_weight*math.pi*0.8), y, z+0.13*tail_weight)

scene.render.fps = 24
scene.frame_start = 1
scene.frame_end = 433
for frame, weight in [(1,0),(49,0),(97,0.48),(133,1),(289,1),(337,0.5),(385,0),(433,0)]:
    rest.value = weight
    rest.keyframe_insert('value', frame=frame)
for frame in range(1,434,12):
    phase = (frame-1)/432*math.tau
    breath.value = (1-math.cos(phase*6))*0.5
    tail.value = math.sin(phase*3)**2*0.75
    breath.keyframe_insert('value', frame=frame)
    tail.keyframe_insert('value', frame=frame)
keys = cat.data.shape_keys
keys.animation_data.action.name = 'Cat - settle and rest'
scene['animation'] = '18-second seamless idle: stand, fold legs and lie down, breathe and flick tail, rise.'
cat['source_author'] = 'volkanongun'
cat['source_license'] = 'CC-BY-4.0'
cat['source_url'] = 'https://sketchfab.com/3d-models/low-poly-cat-1e7143dfafd04ff4891efcb06949a0b4'
scene.frame_set(1)
for o in scene.objects:
    o.select_set(o.type in {'MESH','EMPTY'})
bpy.context.view_layer.objects.active = cat
(ROOT/'output/mascot').mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(ROOT/'output/mascot/location-cat-idle.glb'), export_format='GLB',
    use_selection=True, use_active_scene=True, export_extras=True,
    export_animations=True, export_morph=True,
)
# Preserve the supplied GLB's embedded attribution in the animated export.
asset_path = ROOT/'output/mascot/location-cat-idle.glb'
raw = asset_path.read_bytes()
json_size = struct.unpack_from('<I', raw, 12)[0]
document = json.loads(raw[20:20+json_size])
document['asset']['extras'] = {
    'author': 'volkanongun (https://sketchfab.com/volkanongun)',
    'title': 'Low Poly Cat',
    'license': 'CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/)',
    'source': cat['source_url'],
    'modifications': 'Widened torso and fuller belly; added looping lay-down idle, breathing and tail movement.',
}
encoded = json.dumps(document, separators=(',', ':')).encode()
encoded += b' '*((-len(encoded))%4)
binary = raw[20+json_size:]
asset_path.write_bytes(struct.pack('<III', 0x46546C67, 2, 20+len(encoded)+len(binary)) +
                      struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + binary)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender/low-poly-cat-idle.blend'))
print('Saved animated cat GLB and Blender file; shape keys:', [k.name for k in keys.key_blocks])
