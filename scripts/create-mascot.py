"""Create Waypoint's editable Blender cat and an articulated lie-down action.

Run: Blender --background --factory-startup --python scripts/create-mascot.py
Pass -- --render to also render the transparent animation frames.
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'mascot' / 'blender'
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'frames').mkdir(exist_ok=True)

# Build a dedicated scene; never modify existing building scenes.
scene = bpy.data.scenes.new('Waypoint Cat - Lie Down')
bpy.context.window.scene = scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 720
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.fps = 24
scene.frame_start = 1
scene.frame_end = 144
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.filepath = str(OUT / 'frames' / 'cat-')
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
if hasattr(scene, 'eevee'):
    scene.eevee.taa_render_samples = 16
if hasattr(bpy.context.preferences.edit, 'keyframe_new_handle_type'):
    bpy.context.preferences.edit.keyframe_new_handle_type = 'AUTO_CLAMPED'

def collection(name):
    result = bpy.data.collections.new(name)
    scene.collection.children.link(result)
    return result

geometry = collection('01 - Cat geometry')
rig = collection('02 - Animation controls')
stage = collection('03 - Camera')
references = collection('04 - Mascot reference (toggle visibility)')

def move_to(obj, coll):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    coll.objects.link(obj)

def material(name, color):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    nodes = result.node_tree.nodes
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value = (*color, 1)
    emission.inputs['Strength'].default_value = 1
    result.node_tree.links.new(emission.outputs['Emission'], output.inputs['Surface'])
    return result

black = material('Mascot - solid black', (0, 0, 0))
white = material('Mascot - solid white', (1, 1, 1))

def control(name, pos=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    rig.objects.link(obj)
    obj.empty_display_type = 'SPHERE'
    obj.empty_display_size = .1
    obj.parent = parent
    obj.location = pos
    obj['purpose'] = 'Editable animation control; use the timeline to inspect keyed poses.'
    return obj

root = control('CTRL - Cat master')
body = control('CTRL - Body', parent=root)
head = control('CTRL - Head', parent=root)

def sphere(name, pos, size, mat=black, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=24)
    obj = bpy.context.object
    obj.name = name
    move_to(obj, geometry)
    obj.parent = parent
    obj.location = pos
    obj.scale = size
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    subdivision = obj.modifiers.new('Smooth silhouette - subdivision', 'SUBSURF')
    subdivision.subdivision_type = 'CATMULL_CLARK'
    subdivision.levels = 2
    subdivision.render_levels = 2
    subdivision.show_only_control_edges = True
    return obj

body_mesh = sphere('Body - deformable oval', (0, 0, 0), (.59, .4, .86), parent=body)
head_mesh = sphere('Head - oversized rounded shape', (0, 0, 0), (.81, .49, .7), parent=head)
neck_start = control('CTRL - Neck base', parent=root)
neck_end = control('CTRL - Neck upper', parent=root)

def segment(name, start, end, thickness):
    obj = sphere(name, (0, 0, 0), (1, 1, 1), parent=start)
    # A unit-length rounded segment extending from its control to the next joint.
    for vertex in obj.data.vertices:
        vertex.co.z = (vertex.co.z + 1) / 2
    obj.scale.x = obj.scale.y = thickness
    track = obj.constraints.new('TRACK_TO')
    track.target = end
    track.track_axis = 'TRACK_Z'
    track.up_axis = 'UP_Y'
    driver = obj.driver_add('scale', 2).driver
    variable = driver.variables.new()
    variable.name = 'distance'
    variable.type = 'LOC_DIFF'
    variable.targets[0].id = start
    variable.targets[1].id = end
    driver.expression = 'distance'
    return obj

segment('Neck - follows head and body', neck_start, neck_end, .31)

def ear(name, parent, side):
    # Rounded triangular prisms, rather than texture planes.
    points = [(side * .15, .0, .42), (side * .72, .0, .39), (side * .56, .0, 1.24)]
    vertices = [(x, y + depth, z) for depth in (-.14, .14) for x, y, z in points]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    geometry.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(black)
    bevel = obj.modifiers.new('Soft ear corners', 'BEVEL')
    bevel.width = .07
    bevel.segments = 8
    for face in mesh.polygons:
        face.use_smooth = True
    return obj

ear_l = control('CTRL - Ear left', parent=head)
ear_r = control('CTRL - Ear right', parent=head)
ear('Ear left', ear_l, -1)
ear('Ear right', ear_r, 1)

eye_controls = []
eye_objects = []
for label, x, z in [('left', -.32, .06), ('right', .32, .00)]:
    eye = control('CTRL - Eye ' + label, (x, -.485, z), head)
    eye_controls.append(eye)
    eye_objects.append(sphere('White eye ' + label, (0, 0, 0), (.265, .045, .335), white, eye))
    eye_objects.append(sphere('Pupil ' + label, (.052, -.052, -.007), (.112, .018, .211), black, eye))

sphere('Tiny white nose', (0, -.505, -.20), (.065, .035, .022), white, head)

def curve(name, points, depth, mat=black, parent=None):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.resolution_u = 48
    data.bevel_depth = depth
    data.bevel_resolution = 8
    spline = data.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for point, pos in zip(spline.bezier_points, points):
        point.co = pos
        point.handle_left_type = point.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, data)
    geometry.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(mat)
    return obj

for side in (-1, 1):
    for i in range(3):
        curve('Whisker %s-%s' % (side, i), [(side * .65, -.395, -.15 - i * .065), (side * .85, -.415, -.13 - i * .10), (side * 1.07, -.405, -.12 - i * .14)], .012, parent=head)

sleep_lines = []
for label, x, z in [('left', -.32, .06), ('right', .32, .00)]:
    line = curve('Closed eyelid ' + label, [(x - .16, -.548, z), (x, -.558, z - .075), (x + .16, -.548, z)], .02, white, head)
    sleep_lines.append(line)

limbs = {}
for label in ('far', 'near'):
    shoulder = control('CTRL - Front shoulder ' + label, parent=root)
    elbow = control('CTRL - Front elbow ' + label, parent=root)
    wrist = control('CTRL - Front paw ' + label, parent=root)
    limbs[label] = (shoulder, elbow, wrist)
    segment('Upper front leg ' + label, shoulder, elbow, .15)
    segment('Lower front leg ' + label, elbow, wrist, .135)
    sphere('Elbow ' + label, (0, 0, 0), (.15, .15, .15), parent=elbow)
    sphere('Front paw ' + label, (0, -.025, 0), (.2, .26, .15), parent=wrist)

hind = {}
for label in ('far', 'near'):
    thigh = control('CTRL - Back haunch ' + label, parent=root)
    paw = control('CTRL - Back paw ' + label, parent=root)
    hind[label] = (thigh, paw)
    sphere('Back haunch ' + label, (0, 0, 0), (.37, .30, .40), parent=thigh)
    segment('Back lower leg ' + label, thigh, paw, .18)
    sphere('Back paw ' + label, (0, -.05, 0), (.25, .3, .15), parent=paw)

tail_sit = [(.46, .15, .7), (1.0, .17, .58), (1.58, .14, .95), (1.56, .05, 1.50), (1.23, -.01, 1.58)]
tail_rest = [(1.03, .15, .47), (1.57, .13, .31), (1.86, .04, .36), (1.76, -.02, .64), (1.51, -.04, .62)]
tail = curve('Tail - animated Bezier controls', tail_sit, .115, parent=root)
tail_tip = control('CTRL - Tail tip', parent=root)
sphere('Rounded tail tip', (0, 0, 0), (.115, .115, .115), parent=tail_tip)

def key(obj, frame, pos=None, rotation=None, scale=None):
    if pos is not None:
        obj.location = pos
        obj.keyframe_insert(data_path='location', frame=frame)
    if rotation is not None:
        obj.rotation_euler = rotation
        obj.keyframe_insert(data_path='rotation_euler', frame=frame)
    if scale is not None:
        obj.scale = scale
        obj.keyframe_insert(data_path='scale', frame=frame)

def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))

# Reach first, bend the elbows, lower the torso, then settle the head.
poses = [(1, 0, 0), (18, 0, 0), (36, .08, .65), (54, .4, 1), (72, .8, 1), (90, 1, .65), (108, 1, .55), (126, 1, .55), (144, 1, .55)]
for frame, down, reach in poses:
    breathing = .018 if frame == 126 else 0
    key(body, frame, mix((.13, .10, 1.12), (.52, .10, .70 + breathing), down), (0, math.radians(76) * down, 0))
    key(body_mesh, frame, scale=mix((.59, .40, .86), (.45, .43, .91), down))
    head_down = max(0, (down - .12) / .88)
    head_pos = mix((-.16, -.18, 2.24), (-.64, -.20, 1.18 + breathing), head_down)
    key(head, frame, head_pos, (0, math.radians(-8 - 7 * down), math.radians(-3)), mix((1, 1, 1), (.86, .86, .86), down))
    key(neck_start, frame, mix((-.02, -.09, 1.55), (.0, -.07, .77), down))
    key(neck_end, frame, (head_pos[0] + .08, head_pos[1] + .07, head_pos[2] - .43))
    for label, x, y in [('far', -.30, .09), ('near', .24, -.34)]:
        shoulder, elbow, paw = limbs[label]
        shoulder_pos = mix((x, y, 1.40), (-.04 if label == 'far' else .20, y, .83), down)
        paw_x = x - reach * (.62 if label == 'far' else .76)
        paw_pos = (paw_x, y - .15, .18)
        elbow_pos = (shoulder_pos[0] * .5 + paw_x * .5 + down * .18, y - .08, .77 - down * .34)
        key(shoulder, frame, shoulder_pos)
        key(elbow, frame, elbow_pos)
        key(paw, frame, paw_pos)
    for label, y in [('far', .30), ('near', -.12)]:
        thigh, paw = hind[label]
        key(thigh, frame, mix((.45, y, .67), (.96, y, .46), down), scale=mix((1, 1, 1), (1.03, 1, .73), down))
        key(paw, frame, mix((.5, y - .04, .18), (1.05, y - .14, .18), down))
    tail_phase = down * .9 if frame < 90 else 1
    positions = [mix(a, b, tail_phase) for a, b in zip(tail_sit, tail_rest)]
    for index, (point, pos) in enumerate(zip(tail.data.splines[0].bezier_points, positions)):
        # Key the handles as well: animated coordinates alone leave stale handles.
        previous = Vector(positions[max(0, index - 1)])
        following = Vector(positions[min(len(positions) - 1, index + 1)])
        tangent = (following - previous) / (3 if index in (0, len(positions) - 1) else 6)
        point.handle_left_type = point.handle_right_type = 'FREE'
        point.co = pos
        point.handle_left = Vector(pos) - tangent
        point.handle_right = Vector(pos) + tangent
        point.keyframe_insert(data_path='co', frame=frame)
        point.keyframe_insert(data_path='handle_left', frame=frame)
        point.keyframe_insert(data_path='handle_right', frame=frame)
    key(tail_tip, frame, positions[-1])

for ear_control, direction in ((ear_l, 1), (ear_r, -1)):
    for frame, angle in [(1, 0), (18, 0), (24, 8 * direction), (31, -4 * direction), (40, 0), (90, 4 * direction), (108, 0), (144, 0)]:
        key(ear_control, frame, rotation=(0, math.radians(angle), 0))

for eye in eye_controls:
    for frame, openness in [(1, 1), (15, 1), (18, .025), (22, 1), (82, 1), (101, .005), (144, .005)]:
        key(eye, frame, scale=(1, 1, openness))
for obj in eye_objects:
    for frame, hidden in [(1, False), (100, False), (104, True), (144, True)]:
        obj.hide_render = hidden
        obj.hide_viewport = hidden
        obj.keyframe_insert(data_path='hide_render', frame=frame)
        obj.keyframe_insert(data_path='hide_viewport', frame=frame)
for obj in sleep_lines:
    for frame, hidden in [(1, True), (100, True), (104, False), (144, False)]:
        obj.hide_render = hidden
        obj.hide_viewport = hidden
        obj.keyframe_insert(data_path='hide_render', frame=frame)
        obj.keyframe_insert(data_path='hide_viewport', frame=frame)

for frame, label in [(1, 'SIT'), (24, 'REACH'), (54, 'BEND ELBOWS'), (72, 'LOWER BODY'), (90, 'LIE DOWN'), (108, 'REST')]:
    scene.timeline_markers.new(label, frame=frame)

camera_data = bpy.data.cameras.new('Mascot orthographic camera')
camera = bpy.data.objects.new('Camera - mascot view', camera_data)
stage.objects.link(camera)
camera.location = (2.9, -10, 3.15)
target = Vector((.35, 0, 1.65))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 4.75
camera.data.lens = 55
scene.camera = camera

world = bpy.data.worlds.new('White studio')
world.use_nodes = True
world.node_tree.nodes.get('Background').inputs['Color'].default_value = (1, 1, 1, 1)
scene.world = world

reference_path = ROOT / 'public' / 'mascot' / 'waypoint-cat.png'
if reference_path.exists():
    image = bpy.data.images.load(str(reference_path), check_existing=True)
    image.pack()
    reference = bpy.data.objects.new('Reference - approved black cat', None)
    references.objects.link(reference)
    reference.empty_display_type = 'IMAGE'
    reference.data = image
    reference.location = (-4, 2, 2)
    reference.empty_display_size = 3
    references.hide_viewport = True

notes = bpy.data.texts.new('START HERE - Waypoint Cat')
notes.write('WAYPOINT BLACK CAT\n\nEditable 3D parts, with object controls and tracked joint segments.\nThe forepaws reach, the elbows bend, the torso lowers and turns,\nand the head, ears, eyelids, and Bezier tail animate independently.\n\nSpace: play the six-second action (frames 1-144, 24 fps).\nNumpad 0: camera view.\nTimeline markers: sit, reach, bend, lower, lie down, rest.\nSelect CTRL objects in collection 02 to edit keyframes.\nTail keyframes live on the Bezier spline control points.\nEmission materials preserve the black-and-white silhouette style.\nThe reference PNG is packed into this file.\nSource: scripts/create-mascot.py\n')
scene['mascot'] = 'Waypoint black cat'
scene['animation'] = 'Articulated sit-to-lie-down, 6 seconds at 24 fps'
scene['controls'] = 'Object controls; tracked joint segments; keyed Bezier tail'

scene.frame_set(1)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_perspective = 'CAMERA'
            area.spaces.active.shading.type = 'MATERIAL'

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
print('WAYPOINT_CAT_CREATED', ROOT / 'blender' / 'waypoint-cat.blend')
