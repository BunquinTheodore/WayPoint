"""Dress demo interiors with vendored CC0 props. No download or inference at runtime."""
import hashlib
import math
from pathlib import Path

import bpy
from mathutils import Vector

ASSETS = Path(__file__).resolve().parents[1] / 'assets/vendor/kenney'


def store_profile(name, category='shopping', variant=0):
    text = name.lower()
    groups = [
        ('grocery', ['grocer', 'supermarket']),
        ('electronics', ['samsung', 'mac center', 'istudio', 'sony', 'technology', 'appliance', 'office']),
        ('home', ['west elm', 'pottery', 'home', 'lounge']),
        ('eyewear', ['owndays', 'sunglass']),
        ('beauty', ['rocher', 'drug', 'pharmacy']),
        ('music', ['monkeys', 'music']),
        ('cafe', ['chagee', 'coffee', 'starbucks', 'tea leaf']),
        ('bakery', ['baker']),
        ('fashion', ['levi', 'skoop', 'hla', '@tokyo', 'evernew', 'fashion', 'department']),
        ('sports', ['pacsports', 'fitness', 'sports']),
    ]
    for profile, keys in groups:
        if any(key in text for key in keys):
            return profile
    if category == 'food':
        return 'cafe' if variant % 3 == 0 else 'restaurant'
    if category in ['services', 'social']:
        return 'lounge' if variant % 2 == 0 else 'electronics'
    if category == 'facilities':
        return 'none'
    return ['fashion', 'electronics', 'home', 'beauty'][variant % 4]


class ReusableAssets:
    def __init__(self, demo):
        self.demo = demo
        self.cache = {}
        self.usage = set()

    def template(self, name):
        if name in self.cache:
            return self.cache[name]
        path = next(ASSETS.glob('*/'+name+'.glb'), None)
        if path is None:
            raise FileNotFoundError('Missing vendored interior asset: '+name)
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(path))
        imported = set(bpy.data.objects)-before
        bpy.context.view_layer.update()
        meshes = [obj for obj in imported if obj.type == 'MESH']
        vertices, faces, indices, materials = [], [], [], []
        for obj in meshes:
            offset = len(vertices)
            vertices.extend(obj.matrix_world @ vertex.co for vertex in obj.data.vertices)
            slot = len(materials)
            materials.extend(obj.data.materials)
            for face in obj.data.polygons:
                faces.append(tuple(offset+i for i in face.vertices))
                indices.append(slot+face.material_index)
        lo = Vector(tuple(min(v[i] for v in vertices) for i in range(3)))
        hi = Vector(tuple(max(v[i] for v in vertices) for i in range(3)))
        anchor = Vector(((lo.x+hi.x)/2, (lo.y+hi.y)/2, lo.z))
        mesh = bpy.data.meshes.new('Kenney '+name)
        mesh.from_pydata([v-anchor for v in vertices], [], faces)
        # The app uses a monochrome map. Remove palette images from the source props
        # so every exported building remains texture-free and completely self-contained.
        for mat in materials:
            if mat.use_nodes:
                for node in list(mat.node_tree.nodes):
                    if node.type == 'TEX_IMAGE':
                        mat.node_tree.nodes.remove(node)
            mesh.materials.append(mat)
        for face, index in zip(mesh.polygons, indices):
            face.material_index = index
        for obj in imported:
            bpy.data.objects.remove(obj, do_unlink=True)
        self.cache[name] = (mesh, hi-lo, path.parent.name)
        return self.cache[name]

    def place(self, name, x, y, z, size, parent, polygon, inside, angle=0):
        mesh, bounds, pack = self.template(name)
        scale = min(size/max(bounds.x, bounds.y), 1.25/max(bounds.z, .001))
        # Reject an entire prop if its bounding footprint reaches a wall or corridor.
        dx, dz = bounds.x*scale/2+.22, bounds.y*scale/2+.22
        c, s = math.cos(angle), math.sin(angle)
        if not all(inside((x+a*dx*c-b*dz*s, z+a*dx*s+b*dz*c), polygon)
                   for a in [-1,-.5,0,.5,1] for b in [-1,-.5,0,.5,1]):
            return None
        obj = bpy.data.objects.new('Reusable '+name, mesh)
        self.demo.scene.collection.objects.link(obj)
        obj.location = (x, -z, y)
        obj.scale = (scale, scale, scale)
        obj.rotation_euler.z = -angle
        obj.parent = parent
        obj['illustrative_detail'] = True
        obj['asset_author'] = 'Kenney'
        obj['asset_license'] = 'CC0-1.0'
        obj['asset_pack'] = pack
        obj['asset_name'] = name
        self.usage.add((pack, name))
        return bounds.z*scale

    def dress(self, polygon, y, parent, inside, name, category='shopping', variant=0):
        profile = store_profile(name, category, variant)
        parent['interior_profile'] = profile
        parent['fitout_verified'] = False
        if profile == 'none':
            return
        lo = [min(p[i] for p in polygon) for i in [0,1]]
        hi = [max(p[i] for p in polygon) for i in [0,1]]
        if min(hi[i]-lo[i] for i in [0,1]) < 2.8:
            return
        seed = int(hashlib.sha256((name+str(variant)).encode()).hexdigest()[:8], 16)
        points = [(.24,.25),(.76,.75),(.24,.75),(.76,.25)]
        # Use differing prop families and arrangements, leaving the center/door aisle clear.
        for i, (fx,fz) in enumerate(points[:2 if profile in ['fashion','sports','beauty','eyewear'] else 3]):
            x,z = lo[0]+fx*(hi[0]-lo[0]), lo[1]+fz*(hi[1]-lo[1])
            def prop(asset, size, dx=0, dz=0, up=0, angle=0):
                return self.place(asset,x+dx,y+.07+up,z+dz,size,parent,polygon,inside,angle)
            if profile in ['cafe','restaurant','bakery','music']:
                top = prop('tableRound' if (seed+i)%2 else 'table', 1.35)
                if top is not None:
                    prop('chairRounded' if profile=='cafe' else 'chairCushion',.55,-.95)
                    prop('chair',.55,.95,angle=math.pi)
                    dish = ('cup-tea' if 'chagee' in name.lower() else
                            ['cup-coffee','frappe'][i%2] if profile=='cafe' else
                            ['croissant','cake'][i%2] if profile=='bakery' else
                            'burger' if 'shack' in name.lower() else
                            'bowl-soup' if 'heybo' in name.lower() else 'plate-dinner')
                    prop(dish,.32,up=top+.02)
                if i==2:
                    prop('speaker' if profile=='music' else 'kitchenCoffeeMachine',.65,dz=1.45)
            elif profile in ['home','lounge']:
                if i==0:
                    prop('loungeSofa',1.9)
                    prop('tableCoffee',.95,dz=1.1)
                elif i==1:
                    prop('loungeChair',.85)
                    prop('lampRoundFloor',.45,dx=.95)
                else:
                    prop('bookcaseOpen',1.1)
                    prop('pottedPlant',.55,dx=1.1)
            elif profile=='electronics':
                top = prop('desk',1.65)
                if top is not None:
                    prop('laptop' if (seed+i)%2 else 'computerScreen',.55,up=top+.01)
                    prop('computerKeyboard',.35,dz=.35,up=top+.01)
                    prop('computerMouse',.12,dx=.5,dz=.35,up=top+.01)
                if i==2:
                    prop('televisionModern',1.1,dz=1.2)
            elif profile=='grocery':
                top = prop('bookcaseOpenLow',1.45)
                if top is not None:
                    for j,item in enumerate(['bread','apple','carton']):
                        prop(item,.3,dx=(j-1)*.4,up=top+.01)
            elif profile in ['fashion','sports']:
                prop('coatRackStanding',.65)
                prop('bookcaseOpenLow' if i else 'cabinetBedDrawer',1.35,dx=1.1)
            else:
                top = prop('sideTable' if profile=='eyewear' else 'bookcaseOpenLow',1.2)
                if top is not None and profile=='beauty':
                    for dx in [-.3,0,.3]: prop('bottle-oil',.18,dx=dx,up=top+.01)
                if profile=='eyewear': prop('bathroomMirror',.65,dz=.95)
        if seed%2:
            x,z=lo[0]+.76*(hi[0]-lo[0]),lo[1]+.25*(hi[1]-lo[1])
            self.place('plantSmall1',x,y+.07,z,.48,parent,polygon,inside)
