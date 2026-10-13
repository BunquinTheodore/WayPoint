"""Run in Blender: blender --background --python scripts/create-building.py.
Coordinates in metadata are glTF/Three.js Y-up, meters. Fictional demo only.
"""
import bpy, json, math, os
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'demo'
OUT.mkdir(parents=True, exist_ok=True)
# Create a separate scene; never delete objects in an existing user's scene.
scene = bpy.data.scenes.new('Waypoint Learning Center')
if bpy.context.window:
    bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

def material(name, color, roughness=.65, metallic=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return m

cream = material('Warm limestone', (.82, .80, .73))
white = material('Ivory walls', (.92, .91, .85))
sage = material('Sage corridor', (.38, .52, .43))
wood = material('Oak furniture', (.58, .39, .23))
dark = material('Charcoal metal', (.15, .21, .20))
glass = material('Blue window panels', (.50, .68, .72), .24)
floor_colors = [material('Ground room tile', (.69, .77, .68)), material('Second room tile', (.73, .75, .84)), material('Third room tile', (.85, .75, .61))]
root = bpy.data.objects.new('WaypointBuilding', None)
scene.collection.objects.link(root)

def group(name, parent=root):
    o = bpy.data.objects.new(name, None)
    scene.collection.objects.link(o)
    o.parent = parent
    return o

def cube(name, pos, size, mat, parent, bevel=0):
    # Metadata uses x/y-up/z; Blender uses x/y/z-up.
    bpy.ops.mesh.primitive_cube_add(size=1, location=(pos[0], -pos[2], pos[1]))
    o = bpy.context.object
    o.name = name
    o.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.parent = parent
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new('Soft edges', 'BEVEL'); mod.width = bevel; mod.segments = 2
        o.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return o

def text(name, content, pos, size, mat, parent):
    bpy.ops.object.text_add(location=(pos[0], -pos[2], pos[1]))
    o = bpy.context.object; o.name = name; o.data.body = content
    o.data.size = size; o.data.align_x = 'CENTER'; o.data.align_y = 'CENTER'
    o.data.extrude = .002; o.data.materials.append(mat); o.parent = parent
    bpy.ops.object.convert(target='MESH')
    return bpy.context.object

rooms = []; nodes = []; edges = []
def node(id, floor, pos, label, **extra):
    nodes.append(dict(id=id, floor=floor, position=pos, label=label, **extra))
    return id
def edge(a, b, kind='corridor', accessible=True, evacuation=True):
    p = next(n['position'] for n in nodes if n['id']==a); q = next(n['position'] for n in nodes if n['id']==b)
    edges.append(dict(id=a+'--'+b, **{'from':a, 'to':b}, distance=round(math.dist(p,q),2), kind=kind, accessible=accessible, evacuation=evacuation))

catalog = [
 [('Clinic','health','First aid and visitor assistance',['nurse','medical help','feeling unwell']),('Student Lounge','social','Seating and a space to meet friends',['meet friends','relax','waiting area']),('Restrooms','facilities','Ground floor accessible toilets',['bathroom','toilet','washroom']),('Exhibition','learning','Student projects and displays',['projects','gallery']),('Reception','services','Visitor information and registration',['help desk','information','ask for help']),('Café','food','Coffee, drinking water, and refreshments',['hungry','drink','coffee','water'])],
 [('Classroom 201','learning','Mathematics classroom',['math class','lesson','class 201']),('Computer Lab','learning','Computers and printing facilities',['print a document','computer','printing']),('Classroom 203','learning','Science classroom',['science class','laboratory lesson']),('Faculty Office','services','Teachers and academic support',['find a teacher','instructor','academic help']),('Restrooms 2F','facilities','Second floor toilets',['bathroom upstairs','second floor toilet']),('Study Room','learning','Quiet individual study desks',['study quietly','homework','quiet place'])],
 [('Meeting Room','services','Group meetings and collaboration',['team meeting','discussion']),('Library','learning','Books, reading, borrowing and returning books',['borrow books','return books','read a book','books']),('Restrooms 3F','facilities','Third floor toilets',['third floor toilet']),('Workshop','learning','Creative activities and model making',['make something','craft','creative']),('Reading Room','learning','Quiet reading tables',['reading','quiet reading']),('Event Hall','social','Talks, presentations and gatherings',['presentation','talk','event'])]
]
for f in range(3):
    h = f*3.8
    floor = group('Floor_'+str(f)); floor['floor_id'] = f
    cube('Central floor slab '+str(f), (0,h-.13,0), (24,.26,17), cream, floor, .05)
    for side in [-1,1]:
        # Open stairwells, upper landings, and an unobstructed return walkway.
        cube('Wing landing', (side*13.5,h-.13,3.4), (3,.26,10.2), cream, floor)
        cube('Upper stair landing', (side*13.5,h-.13,-7.8), (3,.26,1.4), cream, floor)
        cube('Stair return walkway', (side*14.5,h-.13,-4.5), (1,.26,5.8), cream, floor)
    cube('Corridor '+str(f), (0,h+.025,0), (30,.05,3.5), sage, floor)
    shell = group('Shell_'+str(f),floor); shell['shell'] = True
    # Exterior facades with openings for main entrance and side exits.
    for z in [-8.4,8.4]:
        if f==0 and z>0:
            for x in [-7,7]: cube('Entrance facade', (x,h+1.4,z),(12.3,2.8,.18),white,shell)
        else: cube('Facade', (0,h+1.4,z),(30,2.8,.18),white,shell)
    for x in [-14.9,14.9]:
        for z in [-5.2,5.2]: cube('Side facade', (x,h+1.4,z),(.18,2.8,6.2),white,shell)
        if f>0: cube('Side glazing', (x,h+1.6,0),(.12,2.4,3.9),glass,shell)
    # Windows and structural posts add a readable exterior silhouette.
    for x in [-10,-6,-2,2,6,10]:
        for z in [-8.52,8.52]:
            cube('Window', (x,h+1.7,z),(2.5,1.3,.07),glass,shell,.025)
    for x in [-12,-4,4,12]:
        for z in [-8.3,8.3]: cube('Column', (x,h+1.45,z),(.3,2.9,.3),cream,shell)
    for j,(name,category,description,aliases) in enumerate(catalog[f]):
        x = [-8,0,8][j%3]; z = -4.9 if j<3 else 4.9
        rid = f'room-{f}-{j}'; roomgroup=group('Room_'+rid,floor)
        cube('Room floor', (x,h+.05,z),(7.8,.08,5.8),floor_colors[f],roomgroup)
        # Interior room walls with a genuine 1.6 m central door opening.
        doorz = -1.95 if z<0 else 1.95
        for dx in [-2.4,2.4]: cube('Door wall', (x+dx,h+1.35,doorz),(3.1,2.7,.14),white,roomgroup)
        cube('Door lintel', (x,h+2.5,doorz),(1.7,.5,.14),white,roomgroup)
        for sx in [x-3.95,x+3.95]: cube('Partition', (sx,h+1.35,z),(.12,2.7,5.9),white,roomgroup)
        # Floor labels are horizontal, readable in the game-like cutaway view.
        text('Label '+name,name,(x,h+.12,z),.38,dark,roomgroup)
        if 'Restroom' in name:
            for dx in [-2,2]: cube('Sink', (x+dx,h+.5,z+1.8),(1,.8,.5),white,roomgroup,.08)
        elif name == 'Library':
            for dx in [-2.6,2.6]:
                cube('Bookcase', (x+dx,h+.8,z),(1,1.6,4),wood,roomgroup,.04)
                for dz in [-1.5,-.5,.5,1.5]: cube('Book row', (x+dx,h+1.65,z+dz),(.8,.12,.5),sage,roomgroup)
        else:
            for dx in [-2,2]:
                cube('Table', (x+dx,h+.73,z+1.7),(1.6,.12,.9),wood,roomgroup,.045)
                for dz in [1,2.4]: cube('Seat', (x+dx,h+.4,z+dz),(.5,.75,.5),dark,roomgroup,.04)
        rn=node(rid,f,[x,h+.18,z],name)
        door=node(f'door-{f}-{j}',f,[x,h+.18,doorz],name+' doorway')
        rooms.append(dict(id=rid,name=name,category=category,description=description,aliases=aliases,floor=f,position=[x,h+.18,z],size=[7.8,5.8],node=rn))
        edge(door,rn,'door')
    corridors=[]
    for x,label in [(-13,'West stairs'),(-8,'West corridor'),(0,'Central junction'),(8,'East corridor'),(13,'East stairs')]:
        id=f'corridor-{f}-{x+13}'; cp=f'floor-{f}-'+('west-stairs' if x==-13 else 'east-stairs' if x==13 else 'junction')
        corridors.append(node(id,f,[x,h+.18,0],f'{label}, '+['ground floor','second floor','third floor'][f],**({'checkpoint':cp} if x in [-13,0,13] else {})))
    for a,b in zip(corridors,corridors[1:]): edge(a,b)
    for j in range(6): edge(corridors[1+(j%3)], f'door-{f}-{j}')
    # Stair flights in side wings, clear of the main corridor.
    for side,x in [('West',-13),('East',13)]:
        if f<2:
            for i in range(18):
                cube(side+' stair step', ((-1 if x<0 else 1)*13.25,h+(i+1)*3.8/18/2,-2.05-i*.29),(1.25,(i+1)*3.8/18,.29),cream,floor)
        cube(side+' landing', (x,h+.04,-1.3),(2.8,.08,.9),sage,floor)
        text(side+' stair label',side.upper()+' STAIRS',(x,h+.15,1),.28,dark,floor)
        refuge=node(f'refuge-{f}-{side.lower()}',f,[x,h+.18,1.1],side+' stair assistance point',refuge=True)
        edge(corridors[0 if side=='West' else 4],refuge)
    # Elevator opening at central junction, model and graph agree.
    lift=group('Lift_'+str(f),floor)
    cube('Elevator doors',(3,h+1.1,1.9),(1.3,2.2,.10),dark,lift)
    elevator=node(f'lift-{f}',f,[3,h+.18,1.1],f'Elevator, floor {f+1}')
    edge(corridors[2],elevator)

for f in range(2):
    for side,sign,corridor in [('west',-1,0),('east',1,26)]:
        bottom=node(f'stairs-{f}-{side}-bottom',f,[sign*13.25,f*3.8+.18,-1.75],side.title()+' stair entrance')
        top=node(f'stairs-{f+1}-{side}-top',f+1,[sign*13.25,(f+1)*3.8+.18,-7.45],side.title()+' upper stair landing')
        corner=node(f'stairs-{f+1}-{side}-return',f+1,[sign*14.5,(f+1)*3.8+.18,-7.45],side.title()+' stair return walkway')
        end=node(f'stairs-{f+1}-{side}-hall',f+1,[sign*14.5,(f+1)*3.8+.18,0],side.title()+' stair corridor')
        edge(f'corridor-{f}-{corridor}',bottom)
        edge(bottom,top,'stairs',False,True)
        edge(top,corner);edge(corner,end);edge(end,f'corridor-{f+1}-{corridor}')
    edge(f'lift-{f}',f'lift-{f+1}','elevator',True,False)

entry=node('entrance',0,[0,.18,9.5],'Main entrance',checkpoint='ground-reception')
edge(entry,'room-0-4'); edge('room-0-4','door-0-4')
grounds=group('Grounds')
cube('Entrance path',(0,-.1,11.5),(4,.12,6),cream,grounds)
for side,x in [('west',-1),('east',1)]:
    exit=node('exit-'+side,0,[x*15.8,.18,0],side.title()+' exterior exit',exit=True)
    assembly=node('assembly-'+side,0,[x*19,.18,0],side.title()+' assembly point',assembly=True)
    edge('corridor-0-'+str(0 if x<0 else 26),exit,'outside');edge(exit,assembly,'outside')
    cube('Exit path',(x*17,-.1,0),(6,.12,3),cream,grounds)
    text('Exit sign',side.upper()+' EXIT',(x*15.8,.08,0),.30,sage,grounds)
roof=group('Roof');roof['roof']=True
cube('Roof slab',(0,11.3,0),(30.4,.22,17.4),cream,roof,.05)
for z in [-8.6,8.6]:cube('Roof parapet',(0,11.65,z),(30,.6,.16),white,roof)
for x in [-15,15]:cube('Roof parapet',(x,11.65,0),(.16,.6,17),white,roof)
cube('Solar panel',(4,11.51,0),(7,.12,4),dark,roof)

building=dict(id='demo-001',name='Meridian Learning Center',version='1.0.0',schemaVersion=1,reviewDate='2026-10-09',
 floors=[dict(id=f,name=['Ground floor','Second floor','Third floor'][f],height=f*3.8) for f in range(3)],rooms=rooms,nodes=nodes,edges=edges,model='building.glb',
 instructions=dict(assistance='If no step-free exit route is available, move only to a reachable designated assistance point and follow staff instructions. This fictional demo is not an approved emergency plan.',emergency='Routes use the stored plan, not live hazard information. Follow building signs and emergency personnel.'))
(OUT/'building.json').write_text(json.dumps(building,indent=2))
# Select only this generated hierarchy for export.
bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=str(OUT/'building.glb'),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_apply=True)

# A camera and lighting make the editable Blender example ready to inspect.
bpy.ops.object.camera_add(location=(32,-38,30)); camera=bpy.context.object
camera.name='Building overview'; scene.camera=camera
camera.rotation_euler=(Vector((0,0,5))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=45
bpy.ops.object.light_add(type='AREA',location=(2,-8,28));bpy.context.object.data.energy=2200;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=20
scene.world=bpy.data.worlds.new('Waypoint daylight');scene.world.use_nodes=True
scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.78,.81,.76,1)
scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.8
scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100
(ROOT/'blender').mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender'/'meridian-learning-center.blend'))
print('WAYPOINT_EXPORT',len(rooms),'rooms',len(nodes),'nodes',len(edges),'edges',str(OUT/'building.glb'))
