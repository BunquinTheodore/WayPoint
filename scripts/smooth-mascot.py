"""Smooth the existing mascot in place while preserving its scene and action.

Run Blender --background blender/waypoint-cat.blend --python scripts/smooth-mascot.py
Pass -- --render to refresh the animation frames as well.
"""
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'mascot' / 'blender'
scene = bpy.data.scenes.get('Waypoint Cat - Lie Down')
if scene is None:
    raise RuntimeError('Open the Waypoint cat blend file before smoothing it.')
bpy.context.window.scene = scene
geometry = bpy.data.collections.get('01 - Cat geometry')
if geometry is None:
    raise RuntimeError('The cat geometry collection was not found.')

smoothed = []
for obj in geometry.objects:
    if obj.type == 'MESH':
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        bevels = [modifier for modifier in obj.modifiers if modifier.type == 'BEVEL']
        if bevels:
            for modifier in bevels:
                modifier.segments = max(modifier.segments, 8)
        else:
            subdivision = next((modifier for modifier in obj.modifiers if modifier.type == 'SUBSURF'), None)
            if subdivision is None:
                subdivision = obj.modifiers.new('Smooth silhouette - subdivision', 'SUBSURF')
            subdivision.subdivision_type = 'CATMULL_CLARK'
            subdivision.levels = 2
            subdivision.render_levels = 2
            subdivision.show_only_control_edges = True
        smoothed.append(obj.name)
    elif obj.type == 'CURVE':
        obj.data.resolution_u = max(obj.data.resolution_u, 48)
        obj.data.bevel_resolution = max(obj.data.bevel_resolution, 8)

scene.frame_set(1)
scene.render.film_transparent = True
scene.render.filepath = str(OUT / 'frames' / 'cat-')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'blender' / 'waypoint-cat.blend'))

for frame, name in [(1, 'cat-sitting.png'), (72, 'cat-lowering.png'), (144, 'cat-lying-down.png')]:
    scene.frame_set(frame)
    scene.render.filepath = str(OUT / name)
    scene.render.film_transparent = False
    bpy.ops.render.render(write_still=True)

scene.frame_set(1)
scene.render.film_transparent = True
scene.render.filepath = str(OUT / 'frames' / 'cat-')
if '--render' in sys.argv:
    bpy.ops.render.render(animation=True)
print('SMOOTHED_MASCOT_MESHES', len(smoothed), ', '.join(smoothed))
