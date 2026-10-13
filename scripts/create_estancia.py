"""Build one reference-based floor. No network access or image texture at runtime."""
import json
import math
import heapq
from collections import deque
from functools import cache

# Directory units have no surveyed metric scale. This assumption is disclosed.
SCALE = .2
CENTER = (500, 530)
STEP = 4


def world(p):
    return [(p[0]-CENTER[0])*SCALE, (p[1]-CENTER[1])*SCALE]


def inside(p, poly):
    result = False
    for a, b in zip(poly, poly[1:]+poly[:1]):
        if (a[1] > p[1]) != (b[1] > p[1]):
            if p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]: result = not result
    return result


def projection(p, a, b, clamp=(0, 1)):
    dx, dy = b[0]-a[0], b[1]-a[1]
    t = max(clamp[0], min(clamp[1], ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)))
    return (a[0]+t*dx, a[1]+t*dy)


def clean(poly):
    points = []
    for point in poly:
        p = tuple(point)
        if not points or p != points[-1]: points.append(p)
    if points[0] == points[-1]: points.pop()
    return points


def boundary_distance(point, polygon):
    return min(math.dist(point, projection(point, a, b))
               for a,b in zip(polygon,polygon[1:]+polygon[:1]) if a!=b)


def clear(a, b, obstacles, clearance=0):
    count = max(2, math.ceil(math.dist(a, b)*2))
    for i in range(count+1):
        point = (a[0]+(b[0]-a[0])*i/count,a[1]+(b[1]-a[1])*i/count)
        if any(inside(point,poly) for poly in obstacles):
            # A storefront portal lies exactly on its own polygon boundary.
            if i!=0 or clearance or any(boundary_distance(point,poly)>.00001 and inside(point,poly) for poly in obstacles):
                return False
        if clearance and any(boundary_distance(point,poly)<clearance for poly in obstacles):
            return False
    return True


def build_estancia(demo, shared):
    from interior_details import MallInterior
    interior = MallInterior(demo, shared)
    bpy = shared['bpy']
    source = json.loads((shared['ROOT']/'references/estancia-main-gf.json').read_text())
    features, seen = [], set()
    for feature in source['features']:
        if not feature['name']: continue
        poly = clean(feature['coordinates'])
        fingerprint = (feature['name'], tuple(poly))
        if fingerprint in seen: continue
        seen.add(fingerprint)
        features.append(dict(feature, polygon=poly))
    # Source records disagree with the selected GF map for these two labels.
    conflicts = {4992, 7837}
    facilities = {'Exit', 'Escalator'}
    units = [f for f in features if f['name'] not in facilities and f['id'] != 7837]
    obstacles = [f['polygon'] for f in units] + [f['polygon'] for f in features if f['name']=='Escalator']
    segments = [tuple(map(tuple, f['coordinates'])) for f in source['features'] if not f['name'] and len(f['coordinates'])==2]
    segments = list(dict.fromkeys(segments))

    # Sample a narrow band around the published unnamed connector lines.
    # Their routing role is inferred; collision checks reject shop intersections.
    grid = set()
    for a, b in segments:
        for x in range(math.floor((min(a[0], b[0])-14)/STEP)*STEP, math.ceil((max(a[0], b[0])+14)/STEP)*STEP+1, STEP):
            for z in range(math.floor((min(a[1], b[1])-14)/STEP)*STEP, math.ceil((max(a[1], b[1])+14)/STEP)*STEP+1, STEP):
                p = (x, z)
                if math.dist(p, projection(p, a, b)) <= 12 and not any(inside(p, poly) or boundary_distance(p,poly)<1.5 for poly in obstacles): grid.add(p)

    @cache
    def neighbors(p):
        result = []
        for dx, dz in [(STEP,0),(-STEP,0),(0,STEP),(0,-STEP),(STEP,STEP),(STEP,-STEP),(-STEP,STEP),(-STEP,-STEP)]:
            q = (p[0]+dx, p[1]+dz)
            if q in grid and clear(p, q, obstacles,clearance=1.5): result.append(q)
        return tuple(result)

    # The central published Exit marker establishes a demo starting anchor.
    root = min(grid, key=lambda p: math.dist(p, (507, 514)))
    reachable = {root}
    pending = deque([root])
    while pending:
        for q in neighbors(pending.popleft()):
            if q not in reachable: reachable.add(q); pending.append(q)

    def shortest(goal):
        heap = [(math.dist(root, goal), 0, root)]
        costs, previous = {root:0}, {}
        while heap:
            _, cost, p = heapq.heappop(heap)
            if cost > costs[p]: continue
            if p == goal:
                result = [p]
                while p != root: p = previous[p]; result.append(p)
                return result[::-1]
            for q in neighbors(p):
                if q not in reachable: continue
                value = cost+math.dist(p, q)
                if value < costs.get(q, math.inf):
                    costs[q], previous[q] = value, p
                    heapq.heappush(heap, (value+math.dist(q, goal), value, q))
        raise ValueError('Disconnected directory corridor')

    targets = []
    for feature in units:
        if feature['id'] in conflicts: continue
        candidates = []
        poly = feature['polygon']
        for edge, (a, b) in enumerate(zip(poly, poly[1:]+poly[:1])):
            if math.dist(a, b)<3: continue
            nearby = sorted(reachable, key=lambda p: math.dist(p, projection(p, a, b, (.18, .82))))[:35]
            for p in nearby:
                q = projection(p, a, b, (.18, .82))
                distance = math.dist(p, q)
                others = [obstacle for obstacle in obstacles if obstacle is not poly]
                if 2 <= distance <= 45 and clear(q,p,[poly]) and clear(q,p,others,clearance=1.5): candidates.append((distance, p, q, edge))
        if not candidates: raise ValueError('No clear storefront approach: '+feature['name'])
        _, p, q, edge = min(candidates)
        targets.append(dict(feature=feature, grid=p, door=q, edge=edge))

    graph = {}
    def link(a, b):
        graph.setdefault(a, set()).add(b)
        graph.setdefault(b, set()).add(a)
    for target in targets:
        path = shortest(target['grid'])
        for a, b in zip(path, path[1:]): link(a, b)
    # Merge only collinear degree-two vertices; preserve turns and portal anchors.
    protected = {root, *(target['grid'] for target in targets)}
    changed = True
    while changed:
        changed = False
        for p, adjacent in list(graph.items()):
            if p in protected or len(adjacent)!=2: continue
            a, b = tuple(adjacent)
            if abs((a[0]-p[0])*(b[1]-p[1])-(a[1]-p[1])*(b[0]-p[0]))>1e-8: continue
            graph[a].remove(p); graph[b].remove(p); del graph[p]; link(a,b); changed=True

    floor = demo.group('Floor_0', demo.root, floor_id=0)
    shell = demo.group('Reference partitions', floor)
    floor_mat = interior.palette['slab']
    # Hand-traced floor perimeter: estimate, independent of source store polygons.
    perimeter = [(140,470),(139,450),(139,315),(145,298),(160,286),(395,286),(406,290),(419,307),(437,326),(574,326),(594,310),(610,288),(620,285),(829,285),(845,295),(851,310),(851,690),(846,724),(830,760),(814,782),(800,782),(786,778),(757,757),(744,739),(741,725),(719,709),(679,684),(644,666),(603,648),(560,661),(542,658),(533,651),(522,642),(488,642),(480,652),(471,658),(450,664),(412,665),(391,664),(276,709),(272,722),(260,730),(235,743),(184,763),(157,770),(145,765),(133,748),(128,735),(130,710),(139,651),(139,575),(146,563),(146,474)]

    def prism(name, poly, bottom, top, mat, parent, **extras):
        import bmesh
        coords = [world(p) for p in poly]
        n = len(coords)
        vertices = [(x, -z, h) for h in [bottom, top] for x, z in coords]
        faces = [tuple(range(n-1,-1,-1)), tuple(range(n,2*n))] + [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], faces)
        bm = bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(mesh); bm.free()
        mesh.materials.append(mat)
        obj = bpy.data.objects.new(name, mesh)
        demo.scene.collection.objects.link(obj); obj.parent=parent
        for key, value in extras.items(): obj[key]=value
        return obj

    prism('Estimated floor outline', perimeter, -.24, -.02, floor_mat, floor)

    for i, feature in enumerate(units):
        poly = feature['polygon']
        group = demo.group('Source unit '+str(feature['id']), shell, source_id=feature['id'])
        color = interior.palette['tile']
        prism('Published store footprint', poly, 0, .06, color, group, source_id=feature['id'])
        target = next((t for t in targets if t['feature']['id']==feature['id']), None)
        for edge, (a,b) in enumerate(zip(poly,poly[1:]+poly[:1])):
            if target and edge==target['edge']:
                q = target['door']; length=math.dist(a,b); gap=min(1.8/SCALE,length*.55)
                unit=((b[0]-a[0])/length,(b[1]-a[1])/length)
                before=(q[0]-unit[0]*gap/2,q[1]-unit[1]*gap/2)
                after=(q[0]+unit[0]*gap/2,q[1]+unit[1]*gap/2)
                # Clamp openings to the boundary segment for short, angled faces.
                before=projection(before,a,b); after=projection(after,a,b)
                interior.wall(world(a),world(before),0,group,storefront=True)
                interior.wall(world(after),world(b),0,group,storefront=True)
            else: interior.wall(world(a),world(b),0,group)
        if target and feature['name']!='Bathroom':
            interior.fixtures([world(p) for p in poly],0,group,inside,
                              feature['name'],'food' if feature['type']==4 else 'shopping',i)

    for feature in features:
        if feature['name']=='Escalator':
            prism('Published escalator zone',feature['polygon'],0,.04,interior.palette['front'],floor,source_id=feature['id'])
            points = [world(p) for p in feature['polygon']]
            lo = [min(p[i] for p in points) for i in [0,1]]
            hi = [max(p[i] for p in points) for i in [0,1]]
            interior.escalator((lo[0]+hi[0])/2,.04,(lo[1]+hi[1])/2,
                               hi[0]-lo[0]-2.4,hi[1]-lo[1]-2.4,0,floor)

    ids = {p:('entrance' if p==root else 'gallery-'+str(i)) for i,p in enumerate(sorted(graph))}
    for p, nid in ids.items():
        x,z=world(p)
        demo.node(nid,0,[x,.18,z],'Demo central entrance' if p==root else 'Ground-floor gallery', **({'checkpoint':'entrance'} if p==root else {}))
    edges_seen = set()
    for a, adjacent in graph.items():
        for b in adjacent:
            fingerprint=tuple(sorted((a,b)))
            if fingerprint in edges_seen: continue
            edges_seen.add(fingerprint); demo.edge(ids[a],ids[b],evacuation=False)

    for target in targets:
        f=target['feature']; poly=f['polygon']; rid='store-'+str(f['id'])
        name = ('Restrooms · west' if f['id']==7846 else 'Restrooms · east') if f['name']=='Bathroom' else f['name']
        category='facilities' if f['name']=='Bathroom' else 'food' if f['type']==4 else 'shopping'
        footprint=[world(p) for p in poly]
        lo=[min(p[i] for p in footprint) for i in [0,1]]; hi=[max(p[i] for p in footprint) for i in [0,1]]
        center=[(lo[i]+hi[i])/2 for i in [0,1]]
        if not inside(center,footprint): center=world(target['door'])
        x,z=world(target['door']); demo.node(rid,0,[x,.18,z],name+' storefront')
        demo.edge(ids[target['grid']],rid,'door',evacuation=False)
        aliases=[f['name'].lower()]
        if category=='facilities': aliases+=['restroom','bathroom','toilet']
        if name=='Power Mac Center': aliases+=['buy a MacBook','Apple computer','laptop','Apple accessories']
        if name=='Pottery Barn': aliases+=['home furniture','sofa','home decor']
        if name=='Samsung': aliases+=['Samsung phone','smartphone','electronics']
        if name=='Chagee': aliases+=['tea','milk tea','drink']
        description=f"Official Main Mall GF map: {name}. Published store outline; doorway and dimensions are estimated. Furnishings use reusable CC0 props and illustrative arrangements, not verified tenant fit-outs. Navigation ends at the modeled storefront."
        demo.rooms.append(dict(id=rid,name=name,category=category,description=description,aliases=aliases,floor=0,position=[center[0],.18,center[1]],size=[hi[0]-lo[0],hi[1]-lo[1]],node=rid,footprint=footprint))
        if min(hi[i]-lo[i] for i in [0,1])>3:
            demo.label(name,(center[0],.1,center[1]),floor,min(.5,(hi[0]-lo[0])/(len(name)*.7)),interior.palette['ink'])

    for feature in features:
        if feature['name']!='Exit': continue
        p=tuple(sum(v[i] for v in feature['polygon'])/len(feature['polygon']) for i in [0,1])
        x,z=world(p)
        demo.label('EXIT REFERENCE',(x,.1,z),floor,.4,interior.palette['ink'])
    # No off-site assembly destination or emergency-safe connectivity is fabricated.
    # The single floor is open at overview scale; there is no invented full-mall shell.
    building=dict(id=demo.entry['id'],name=demo.entry['name'],version='1.1.0',schemaVersion=1,reviewDate=source['retrieved'],floors=[dict(id=0,name='Main Mall · Ground floor',height=0)],rooms=demo.rooms,nodes=demo.nodes,edges=demo.edges,model='building.glb',provenance={key:demo.entry[key] for key in ['layoutStatus','layoutNote','sources']},instructions=dict(assistance='This reference floor has no verified emergency or step-free evacuation route. Follow actual facility signs and staff instructions.',emergency='DEMONSTRATION ONLY. Source exit markers are reference labels. Assembly points, emergency connections, and current hazards have not been verified; evacuation routing is unavailable for this floor.'))
    report=dict(source=source['source'],retrieved=source['retrieved'],sourceFloorId=88,scaleMetersPerDirectoryUnit=SCALE,scaleVerified=False,doorPositionsVerified=False,accuracyPercent=None,publishedNamedPolygons=36,duplicatesRemoved=[4978,9713],conflictingLabelsExcluded=[4992,7837],destinationCount=len(demo.rooms),partitionBasis='Published click-area polygons, not architectural wall survey',corridorBasis='Collision-checked sampling of published unnamed connector lines; routing role inferred',emergencyRoutingEnabled=False)
    report['interiorDetails'] = 'Illustrative low cutaway walls, storefront posts, display plinths, cafe seating, and escalator symbols; not surveyed fit-outs or new floor connections'
    building['version']='1.2.0'
    building['interiorAssets']=dict(author='Kenney',license='CC0-1.0',
        sources=['https://kenney.nl/assets/furniture-kit','https://kenney.nl/assets/food-kit'],
        models=[dict(pack=pack,name=name) for pack,name in sorted(demo.props.usage)],fitoutsVerified=False)
    report['interiorDetails']='CC0 Kenney props arranged by store type; low cutaway partitions and escalator symbols. Fit-outs remain illustrative, not surveyed.'
    out=shared['ROOT']/'public'/'demos'/demo.entry['id']; out.mkdir(parents=True,exist_ok=True)
    (out/'reference-report.json').write_text(json.dumps(report,indent=2)+'\n')
    demo.save(building,150,105,4.5)
