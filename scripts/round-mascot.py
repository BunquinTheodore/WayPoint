"""Round the saved Blender cat into a continuous animated surface.

Run in the open cat file, or use Blender --background blender/waypoint-cat.blend
--python scripts/round-mascot.py. Original controls remain editable.
"""
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'mascot' / 'blender'
scene = bpy.data.scenes['Waypoint Cat - Lie Down']
bpy.context.window.scene = scene
scene.frame_set(1)
if bpy.data.objects.get('Cat - continuous rounded surface'):
    raise RuntimeError('This file already contains the rounded cat surface.')

# Preserve the complete previous version, including live saved scene changes.
backup = ROOT / 'blender' / 'waypoint-cat-before-rounded.blend'
if not backup.exists():
    bpy.ops.wm.save_as_mainfile(filepath=str(backup), copy=True)

def fcurves(obj):
    action = obj.animation_data.action if obj.animation_data else None
    if action is None:
        return []
    if hasattr(action, 'fcurves'):
        return list(action.fcurves)
    result = []
    for layer in action.layers:
        for strip in layer.strips:
            for bag in getattr(strip, 'channelbags', []):
                result.extend(bag.fcurves)
    return result

def adjust_channel(obj, path, axis, multiplier=1, offset=0):
    curves = [curve for curve in fcurves(obj) if curve.data_path == path and curve.array_index == axis]
    if curves:
        for curve in curves:
            for point in curve.keyframe_points:
                point.co.y = point.co.y * multiplier + offset
                point.handle_left.y = point.handle_left.y * multiplier + offset
                point.handle_right.y = point.handle_right.y * multiplier + offset
    else:
        value = getattr(obj, path)
        value[axis] = value[axis] * multiplier + offset

head_control = bpy.data.objects['CTRL - Head']
adjust_channel(head_control, 'location', 2, offset=-.20)
adjust_channel(head_control, 'rotation_euler', 1, offset=math.radians(-7))
bpy.data.objects['Head - oversized rounded shape'].scale = (.94, .53, .81)
body = bpy.data.objects['Body - deformable oval']
adjust_channel(body, 'scale', 2, multiplier=.77)

for label, side, angle in [('left', -1, -22), ('right', 1, 32)]:
    ear = bpy.data.objects['Ear ' + label]
    for vertex in ear.data.vertices:
        vertex.co.z = .39 + (vertex.co.z - .39) * 1.17
    for modifier in ear.modifiers:
        if modifier.type == 'BEVEL':
            modifier.width = .14
            modifier.segments = 12
    adjust_channel(bpy.data.objects['CTRL - Ear ' + label], 'rotation_euler', 1, offset=math.radians(angle))
    eye = bpy.data.objects['CTRL - Eye ' + label]
    eye.location.x = side * .37
    eye.location.y = -.58
    bpy.data.objects['White eye ' + label].scale = (.34, .06, .43)
    pupil = bpy.data.objects['Pupil ' + label]
    pupil.scale = (.225, .025, .285)
    pupil.location = (.025, -.073, -.005)

nose = bpy.data.objects['Tiny white nose']
nose.location = (0, -.63, -.28)
nose.scale = (.035, .02, .013)
for obj in bpy.data.objects:
    if obj.name.startswith('Whisker'):
        obj.hide_render = True
        obj.hide_set(True)
    if obj.name.startswith('Closed eyelid'):
        for point in obj.data.splines[0].bezier_points:
            point.co.y = -.65

for label in ('far', 'near'):
    bpy.data.objects['Upper front leg ' + label].scale.x = .205
    bpy.data.objects['Upper front leg ' + label].scale.y = .205
    bpy.data.objects['Lower front leg ' + label].scale.x = .205
    bpy.data.objects['Lower front leg ' + label].scale.y = .205
    bpy.data.objects['Front paw ' + label].scale = (.255, .29, .22)
    bpy.data.objects['Back paw ' + label].scale = (.28, .30, .21)
    haunch = bpy.data.objects['Back haunch ' + label]
    haunch.scale = (.32, .29, .31)

scene.frame_set(2)
scene.frame_set(1)
bpy.context.view_layer.update()
geometry = bpy.data.collections['01 - Cat geometry']
sources = bpy.data.collections.new('05 - Organic surface sources (editable rig)')
scene.collection.children.link(sources)
for obj in list(geometry.objects):
    if obj.type not in {'MESH', 'CURVE'} or obj.name.startswith(('Pupil', 'Whisker', 'Closed eyelid')):
        continue
    if not obj.data.materials or obj.data.materials[0].name != 'Mascot - solid black':
        continue
    sources.objects.link(obj)
    geometry.objects.unlink(obj)
    obj.hide_render = True
    obj.hide_set(True)

for obj in list(sources.objects):
    if obj.type == 'CURVE':
        geometry.objects.link(obj)
        sources.objects.unlink(obj)
        obj.hide_render = False
        obj.hide_set(False)
    else:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
        bm.free()
        for modifier in obj.modifiers:
            if modifier.type == 'SUBSURF':
                modifier.levels = modifier.render_levels = 0

# Rounded Bezier ear silhouettes, closed and extruded for the volumetric skin.
segments = [((.08,.39),(.24,.84),(.43,1.46),(.57,1.41)), ((.57,1.41),(.73,1.39),(.81,.61),(.75,.42)), ((.75,.42),(.61,.34),(.26,.34),(.08,.39))]
outline = []
for controls in segments:
    points = [Vector(value) for value in controls]
    for index in range(20):
        t = index / 20
        value = (1-t)**3*points[0] + 3*(1-t)**2*t*points[1] + 3*(1-t)*t*t*points[2] + t**3*points[3]
        outline.append(tuple(value))
for label, side in [('left', -1), ('right', 1)]:
    count = len(outline)
    vertices = [(side*x, y, z) for y in [-.17, .17] for x, z in outline]
    faces = [tuple(range(count-1,-1,-1)), tuple(range(count,count*2))] + [(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
    ear_mesh = bpy.data.meshes.new('Soft rounded ear profile ' + label)
    ear_mesh.from_pydata(vertices, [], faces)
    ear_mesh.update()
    bm = bmesh.new()
    bm.from_mesh(ear_mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(ear_mesh)
    bm.free()
    ear_mesh.materials.append(bpy.data.materials['Mascot - solid black'])
    obj = bpy.data.objects['Ear ' + label]
    obj.data = ear_mesh
    for face in ear_mesh.polygons:
        face.use_smooth = True
    for modifier in obj.modifiers:
        if modifier.type == 'BEVEL':
            modifier.width = .075
            modifier.segments = 8

mesh = bpy.data.meshes.new('Continuous cat surface carrier')
surface = bpy.data.objects.new('Cat - continuous rounded surface', mesh)
geometry.objects.link(surface)
surface.parent = bpy.data.objects['CTRL - Cat master']
surface['design'] = 'One continuous rounded body surface, regenerated from the animated controls.'

nodes = bpy.data.node_groups.new('Waypoint - organic animated union', 'GeometryNodeTree')
nodes.interface.new_socket(name='Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
nodes.interface.new_socket(name='Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
last = None
for index, obj in enumerate(sources.objects):
    info = nodes.nodes.new('GeometryNodeObjectInfo')
    info.inputs['Object'].default_value = obj
    info.transform_space = 'RELATIVE'
    info.location = (-700, -index*160)
    grid = nodes.nodes.new('GeometryNodeMeshToSDFGrid')
    grid.inputs['Voxel Size'].default_value = .03
    grid.inputs['Band Width'].default_value = 4
    grid.location = (-460, -index*160)
    nodes.links.new(info.outputs['Geometry'], grid.inputs[0])
    if last is None:
        last = grid.outputs[0]
    else:
        union = nodes.nodes.new('GeometryNodeSDFGridBoolean')
        union.operation = 'UNION'
        union.location = (-200, -index*160)
        # UNION uses the multi-input Grid socket, not its inactive Grid 1.
        nodes.links.new(last, union.inputs[1])
        nodes.links.new(grid.outputs[0], union.inputs[1])
        last = union.outputs[0]
soft = nodes.nodes.new('GeometryNodeSDFGridMean')
soft.inputs['Width'].default_value = 1
soft.inputs['Iterations'].default_value = 2
nodes.links.new(last, soft.inputs[0])
to_mesh = nodes.nodes.new('GeometryNodeGridToMesh')
to_mesh.inputs['Threshold'].default_value = 0
nodes.links.new(soft.outputs[0], to_mesh.inputs[0])
assign = nodes.nodes.new('GeometryNodeSetMaterial')
assign.inputs['Material'].default_value = bpy.data.materials['Mascot - solid black']
smooth = nodes.nodes.new('GeometryNodeSetShadeSmooth')
output = nodes.nodes.new('NodeGroupOutput')
chain = [to_mesh, assign, smooth, output]
for index, node in enumerate(chain):
    node.location = (index * 220, 0)
for left, right in zip(chain, chain[1:]):
    nodes.links.new(left.outputs[0], right.inputs[0])
modifier = surface.modifiers.new('Continuous animated skin', 'NODES')
modifier.node_group = nodes
relax = surface.modifiers.new('Relax organic transitions', 'SMOOTH')
relax.factor = .5
relax.iterations = 2
subdivision = surface.modifiers.new('Polished rounded outline', 'SUBSURF')
subdivision.levels = 1
subdivision.render_levels = 1
subdivision.show_only_control_edges = True

scene.camera.location = (0, -10, 2.8)
scene.camera.rotation_euler = (Vector((.3,0,1.55)) - scene.camera.location).to_track_quat('-Z','Y').to_euler()
scene.camera.data.ortho_scale = 4.35

# Show the new surface in the live Blender viewport.
for obj in bpy.context.selected_objects:
    obj.select_set(False)
surface.select_set(True)
bpy.context.view_layer.objects.active = surface
scene.frame_set(1)
bpy.context.view_layer.update()
evaluated = surface.evaluated_get(bpy.context.evaluated_depsgraph_get())
print('ROUNDED_SURFACE', len(evaluated.data.vertices), 'vertices', len(evaluated.data.polygons), 'faces')
if len(evaluated.data.vertices) == 0:
    raise RuntimeError('The organic surface evaluated empty; inspect its source collection.')
scene.render.filepath = str(OUT / 'frames' / 'cat-')
scene.render.film_transparent = True
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'blender' / 'waypoint-cat.blend'))
print('SAVED_ROUNDED_CAT', bpy.data.filepath)
