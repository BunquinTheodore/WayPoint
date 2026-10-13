"""Render the saved cat's preview poses and optional transparent frame sequence."""
import sys
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'mascot' / 'blender'
scene = bpy.data.scenes['Waypoint Cat - Lie Down']
bpy.context.window.scene = scene
for frame, name in [(1,'cat-sitting.png'),(72,'cat-lowering.png'),(144,'cat-lying-down.png')]:
    scene.frame_set(frame)
    scene.render.film_transparent = False
    scene.render.filepath = str(OUT / name)
    bpy.ops.render.render(write_still=True)
scene.frame_set(1)
scene.render.film_transparent = True
scene.render.filepath = str(OUT / 'frames' / 'cat-')
if '--render' in sys.argv:
    bpy.ops.render.render(animation=True)
print('ROUNDED_CAT_RENDERED')
