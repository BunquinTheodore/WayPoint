"""Blender: --background --python scripts/create-demos.py.
All geometry and routes are approximate/fictional demos, not surveyed plans.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / 'demo-catalog.json').read_text())

def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*color, 1)
    mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .7
    return mat

ivory = material('Warm concrete', (.83, .82, .75))
walls = material('Ivory partitions', (.94, .92, .84))
glass = material('Muted blue glazing', (.39, .62, .67))
dark = material('Charcoal frames', (.19, .27, .26))
corridor_mat = material('Public promenade', (.47, .61, .50))
colors = [material('Sage tile', (.70, .79, .68)), material('Lavender tile', (.75, .76, .86)), material('Sand tile', (.88, .77, .59)), material('Terracotta tile', (.82, .64, .55))]
BOXES = {}

class Demo:
    def __init__(self, entry):
        self.entry = entry
        self.scene = bpy.data.scenes.new(entry['name'] + ' - DEMONSTRATION')
        bpy.context.window.scene = self.scene
        self.scene.unit_settings.system = 'METRIC'
        self.root = self.group('WaypointBuilding')
        self.nodes = []
        self.edges = []
        self.rooms = []
        self.floor_height = 3.6 if entry['kind'] == 'tower' else 4.5
        from reusable_assets import ReusableAssets
        self.props = ReusableAssets(self)

    def group(self, name, parent=None, **extras):
        obj = bpy.data.objects.new(name, None)
        self.scene.collection.objects.link(obj)
        obj.parent = parent
        for key, value in extras.items(): obj[key] = value
        return obj

    def cube(self, name, pos, size, mat, parent):
        if mat.name not in BOXES:
            mesh = bpy.data.meshes.new('Shared box '+mat.name)
            mesh.from_pydata([(-.5,-.5,-.5),(.5,-.5,-.5),(.5,.5,-.5),(-.5,.5,-.5),(-.5,-.5,.5),(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5)], [], [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
            mesh.materials.append(mat)
            BOXES[mat.name] = mesh
        obj = bpy.data.objects.new(name, BOXES[mat.name])
        self.scene.collection.objects.link(obj)
        obj.location = (pos[0], -pos[2], pos[1])
        obj.scale = (size[0], size[2], size[1])
        obj.parent = parent
        return obj

    def label(self, name, pos, parent, size=.7, mat=None):
        font = bpy.data.curves.new('Label '+name, type='FONT')
        obj = bpy.data.objects.new('Label '+name, font)
        self.scene.collection.objects.link(obj)
        obj.location = (pos[0], -pos[2], pos[1])
        font.body = name
        font.size = size
        font.align_x = 'CENTER'
        font.align_y = 'CENTER'
        font.materials.append(mat or dark)
        obj.parent = parent

    def node(self, name, f, pos, label, **extras):
        self.nodes.append(dict(id=name, floor=f, position=pos, label=label, **extras))
        return name

    def edge(self, a, b, kind='corridor', accessible=True, evacuation=True):
        p = next(n['position'] for n in self.nodes if n['id'] == a)
        q = next(n['position'] for n in self.nodes if n['id'] == b)
        self.edges.append(dict(id=a+'--'+b, **{'from': a, 'to': b}, distance=round(math.dist(p, q), 2), kind=kind, accessible=accessible, evacuation=evacuation))

    def room(self, f, j, definition, x, z, width, depth, hall_z, floor):
        name, category, description, aliases = definition
        h = f*self.floor_height
        rid = f'room-{f}-{j}'
        group = self.group('Room_'+rid, floor)
        self.cube('Room tile', (x, h+.04, z), (width, .08, depth), colors[f % 4], group)
        # Door faces the actual modeled corridor, with a 2 m opening.
        face = z + (depth/2 if hall_z > z else -depth/2)
        for sign in [-1, 1]:
            wall_width = (width-2)/2
            self.cube('Door wall', (x+sign*(width+2)/4, h+1.4, face), (wall_width, 2.8, .16), walls, group)
            self.cube('Side partition', (x+sign*width/2, h+1.4, z), (.16, 2.8, depth), walls, group)
        self.cube('Rear partition', (x, h+1.4, 2*z-face), (width, 2.8, .16), walls, group)
        self.label(name, (x, h+.12, z), group, .42)
        polygon = [(x-width/2,z-depth/2),(x+width/2,z-depth/2),
                   (x+width/2,z+depth/2),(x-width/2,z+depth/2)]
        from create_estancia import inside
        self.props.dress(polygon,h,group,inside,name,category,f*6+j)
        self.node(rid, f, [x, h+.18, z], name)
        self.node(f'door-{f}-{j}', f, [x, h+.18, face], name+' doorway')
        self.edge(rid, f'door-{f}-{j}', 'door')
        hall = f'hall-{f}-{j}'
        self.node(hall, f, [x, h+.18, hall_z], 'Gallery outside '+name)
        self.edge(f'door-{f}-{j}', hall)
        self.rooms.append(dict(id=rid, name=name, category=category, description=description+' Reusable CC0 furnishings are illustrative; actual fit-outs are not verified.', aliases=aliases, floor=f, position=[x, h+.18, z], size=[width, depth], node=rid))
        return hall

    def definitions(self, f):
        if f == 0:
            names = [('Clinic', 'health'), ('Café', 'food'), ('Restrooms', 'facilities'), ('Visitor lounge', 'social'), ('Reception', 'services'), ('Mail room', 'services')]
        elif f == 19:
            names = [('Sky lounge', 'social'), ('Viewing room', 'social'), ('Meeting room 2003', 'services'), ('Sky café', 'food'), ('Restrooms 20F', 'facilities'), ('Conference room', 'services')]
        else:
            names = [(f'Office {f+1:02d}01', 'services'), (f'Meeting room {f+1:02d}02', 'services'), (f'Workspace {f+1:02d}03', 'services'), (f'Study lounge {f+1:02d}04', 'learning'), (f'Restrooms {f+1}F', 'facilities'), (f'Pantry {f+1}F', 'food')]
        return [(name, cat, f'Fictional {name.lower()} on floor {f+1} of Waypoint Tower.', ['coffee', 'eat', 'drink'] if cat=='food' else ['toilet', 'bathroom'] if cat=='facilities' else ['medical help', 'first aid'] if cat=='health' else [name.lower()]) for name, cat in names]

    def build_tower(self):
        if self.entry['kind'] != 'tower':
            raise ValueError('Mall models require a dedicated reference generator.')
        width, depth = 30, 24
        for f in range(self.entry['floors']):
            h = f*self.floor_height
            floor = self.group('Floor_'+str(f), self.root, floor_id=f)
            shell = self.group('Shell_'+str(f), floor, shell=True)
            self.cube('Floor slab', (0, h-.12, 0), (width, .24, depth), ivory, floor)
            for z in [-depth/2, depth/2]:
                # Opening at ground entrance and landing bands at left/right.
                for x in [-width/4-1, width/4+1]: self.cube('Glazed facade', (x, h+1.5, z), (width/2-2, 3, .16), glass, shell)
            for x in [-width/2, width/2]:
                for z in [-depth/4-1, depth/4+1]: self.cube('Side facade', (x, h+1.5, z), (.16, 3, depth/2-2), glass, shell)
            definitions = self.definitions(f)
            xs = [-8, 0, 8]
            hall_z = 1.8
            room_z = 7
            halls = [[], []]
            for j, definition in enumerate(definitions):
                side = 0 if j<3 else 1
                x = xs[j%3]
                z = -room_z if side==0 else room_z
                lane = -hall_z if side==0 else hall_z
                halls[side].append(self.room(f,j,definition,x,z,7.6,9,lane,floor))
            left_x = -13
            right_x = 13
            for side, lane in enumerate([-hall_z, hall_z]):
                self.cube('Navigation promenade', ((left_x+right_x)/2,h+.025,lane), (right_x-left_x, .05, 3), corridor_mat, floor)
                for a,b in zip(halls[side],halls[side][1:]): self.edge(a,b)
            for side, x in [('west',left_x),('east',right_x)]:
                self.cube('Side gallery', (x,h+.025,0), (3,.05,2*hall_z+3), corridor_mat, floor)
                mid = self.node(f'stair-{f}-{side}',f,[x,h+.18,0],f'{side.title()} stairs, floor {f+1}',checkpoint=f'floor-{f}-{side}',refuge=True)
                for j, lane in enumerate([-hall_z,hall_z]):
                    corner = self.node(f'corner-{f}-{side}-{j}',f,[x,h+.18,lane],side.title()+' gallery corner')
                    self.edge(mid,corner)
                    self.edge(corner,halls[j][0 if side=='west' else -1])
                if f < self.entry['floors']-1:
                    for i in range(18):
                        self.cube('Stair tread', (x,h+(i+1)*self.floor_height/36,2+i*.28), (1.3,(i+1)*self.floor_height/18,.28), ivory, floor)
                self.label(side.upper()+' STAIRS',(x,h+.1,-2),floor,.35)
            # A lift at the tower gallery.
            lift_z = 1
            self.node(f'lift-{f}', f, [2,h+.18,lift_z],f'Elevator, floor {f+1}',checkpoint=f'floor-{f}-lift')
            self.edge(halls[1][1], f'lift-{f}')
            self.cube('Elevator doors',(2,h+1.2,lift_z+.5),(1.6,2.4,.12),dark,floor)
            if f>0:
                for side in ['west','east']:
                    self.edge(f'stair-{f-1}-{side}',f'stair-{f}-{side}','stairs',False,True)
                self.edge(f'lift-{f-1}',f'lift-{f}','elevator',True,False)
        grounds = self.group('Grounds',self.root)
        # Ground entry is aligned with the central room, whose door opens into the gallery.
        entry_z = depth/2+2
        self.node('entrance',0,[0,.18,entry_z],'Demo main entrance',checkpoint='entrance')
        self.edge('entrance','room-0-4')
        self.cube('Entrance walkway',(0,-.12,entry_z+1),(5,.12,6),ivory,grounds)
        for side,x in [('west',left_x),('east',right_x)]:
            sign = -1 if side=='west' else 1
            self.node('exit-'+side,0,[x+sign*4,.18,0],side.title()+' demo exit',exit=True)
            self.node('assembly-'+side,0,[x+sign*10,.18,0],side.title()+' demo assembly point',assembly=True)
            self.edge('stair-0-'+side,'exit-'+side,'outside')
            self.edge('exit-'+side,'assembly-'+side,'outside')
            self.cube('Exit walkway',(x+sign*5,-.12,0),(10,.12,3),ivory,grounds)
        roof = self.group('Roof',self.root,roof=True)
        top = self.entry['floors']*self.floor_height
        self.cube('Roof slab',(0,top,0),(width+.4,.3,depth+.4),ivory,roof)
        self.cube('Roof plant',(0,top+1.2,-depth*.2),(width*.25,2.4,depth*.25),dark,roof)
        out = ROOT/'public'/'demos'/self.entry['id']
        out.mkdir(parents=True,exist_ok=True)
        names = [f'Floor {f+1}' for f in range(self.entry['floors'])]
        building = dict(id=self.entry['id'],name=self.entry['name'],version='1.2.0',schemaVersion=1,reviewDate='2026-10-09',floors=[dict(id=f,name=names[f],height=f*self.floor_height) for f in range(self.entry['floors'])],rooms=self.rooms,nodes=self.nodes,edges=self.edges,model='building.glb',provenance={key:self.entry[key] for key in ['layoutStatus','layoutNote','sources']},instructions=dict(assistance='No step-free evacuation route is modeled on upper floors. Follow facility staff instructions; demo assistance points are not verified real refuges.',emergency='DEMONSTRATION ONLY. Exit positions and routes are illustrative, not approved evacuation instructions. Follow real building signs and emergency personnel.'))
        building['interiorAssets'] = dict(author='Kenney',license='CC0-1.0',
            sources=['https://kenney.nl/assets/furniture-kit','https://kenney.nl/assets/food-kit'],
            models=[dict(pack=pack,name=name) for pack,name in sorted(self.props.usage)],
            fitoutsVerified=False)
        self.save(building, width, depth, top)

    def save(self, building, width, depth, top):
        out = ROOT/'public'/'demos'/self.entry['id']
        out.mkdir(parents=True,exist_ok=True)
        (out/'building.json').write_text(json.dumps(building,indent=2))
        bpy.ops.object.select_all(action='DESELECT')
        labels = [obj for obj in self.scene.objects if obj.type=='FONT']
        for obj in labels: obj.select_set(True)
        if labels:
            bpy.context.view_layer.objects.active=labels[0]
            bpy.ops.object.convert(target='MESH')
        bpy.ops.object.select_all(action='DESELECT')
        for obj in self.scene.objects: obj.select_set(True)
        bpy.context.view_layer.objects.active=self.root
        bpy.ops.export_scene.gltf(filepath=str(out/'building.glb'),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_apply=True)
        bpy.ops.object.camera_add(location=(width,-depth,top+width*.65))
        camera=bpy.context.object
        camera.rotation_euler=(Vector((0,0,top/2))-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.type='ORTHO'
        camera.data.ortho_scale=max(max(width,depth)*1.7,top*1.8)
        if self.entry['id']=='robinsons-manila':
            camera.location=(-430,-360,340)
            camera.rotation_euler=(Vector((0,0,top*.35))-camera.location).to_track_quat('-Z','Y').to_euler()
            camera.data.ortho_scale=560
        self.scene.camera=camera
        bpy.ops.object.light_add(type='AREA',location=(0,-15,top+30))
        bpy.context.object.data.energy=3500
        bpy.context.object.data.size=35
        self.scene.world=bpy.data.worlds.new('Demo daylight')
        self.scene.world.use_nodes=True
        self.scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.78,.81,.76,1)
        (ROOT/'blender').mkdir(exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender'/(self.entry['id']+'.blend')))
        print('WAYPOINT_DEMO',self.entry['id'],len(self.rooms),'destinations',top,'meters high')
        # Remove only the scene and objects created by this generator.
        for obj in list(self.scene.objects): bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.scenes.remove(self.scene)

if __name__ == '__main__':
    sys.path.insert(0, str(ROOT/'scripts'))
    requested = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    for entry in CATALOG:
        if requested and entry['id'] not in requested: continue
        if entry['id'] == 'estancia-main-gf':
            from create_estancia import build_estancia
            build_estancia(Demo(entry), globals())
        elif entry['id'] == 'robinsons-manila':
            from create_robinsons import build_robinsons
            build_robinsons(Demo(entry), globals())
        else: Demo(entry).build_tower()
