"""Render review images from the saved Blender source (no changes to the source file)."""
import bpy
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'blender/robinsons-manila.blend'))
scene=bpy.context.scene
scene.render.engine='BLENDER_WORKBENCH'
scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL'
scene.display.shading.show_shadows=True;scene.display.shading.show_cavity=True
scene.display.shading.cavity_type='BOTH';scene.display.shading.show_object_outline=False
scene.display.shading.background_type='WORLD';scene.world.color=(.94,.94,.94)
scene.view_settings.view_transform='Standard'
scene.camera.location=(430,-440,310)
scene.camera.rotation_euler=(Vector((0,0,9))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
scene.camera.data.ortho_scale=570
scene.render.filepath=str(ROOT/'docs/previews/robinsons-manila-exterior.png')
bpy.ops.render.render(write_still=True)
for obj in scene.objects:
    if obj.type!='MESH':continue
    parent=obj
    while parent:
        if parent.get('roof') or parent.get('shell') or (parent.get('floor_id') is not None and parent.get('floor_id')!=0):obj.hide_render=True;break
        parent=parent.parent
scene.camera.location=(-220,-200,520)
scene.camera.rotation_euler=(Vector((0,0,0))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
scene.camera.data.ortho_scale=540
scene.render.filepath=str(ROOT/'docs/previews/robinsons-manila-interior.png')
bpy.ops.render.render(write_still=True)
