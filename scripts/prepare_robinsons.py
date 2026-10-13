"""Prepare reference geometry with Python 3 + shapely>=2.1 (build-time only).
Run from repository root. No network requests. Output is bundled into the Blender build.
The map trace is an approximation, not an operator-approved indoor survey.
"""
import json, math, heapq
from pathlib import Path
from collections import deque
from shapely.geometry import Polygon, Point, LineString, box
from shapely.ops import unary_union, nearest_points
from shapely import constrained_delaunay_triangles

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'references/robinsons-manila'
source=json.loads((OUT/'osm-site.json').read_text())
geo=next(w['coordinates'] for w in source['ways'] if w['id']==130532101)
# Local metric projection: X east, Z south, origin near the center atrium.
raw=[((lon-120.984)*107740,-(lat-14.5765)*111320) for lon,lat in geo]
outline=Polygon(raw).buffer(0)
# Hand-identifiable control points register the screenshot to the OSM perimeter.
# Interior coordinates are approximate; neither source provides surveyed shop dimensions.
controls=[((302,334),1),((289,403),3),((75,506),5),((177,648),9),
          ((452,1113),16),((500,1000),25),((733,986),38),((601,537),46),
          ((394,0),53),((175,20),60)]
# Inverse-distance correction to a similarity registration is smooth and reproducible.
ga,gb,tx,ty=2.5932775552,.0294433842,402.64682655,546.23588611
scale=math.hypot(ga,gb)
def base(p):
    x,y=p[0]-tx,p[1]-ty
    return ((ga*x+gb*y)/(scale*scale),(-gb*x+ga*y)/(scale*scale))
def world(p):
    q=base(p); weights=[]
    for image,index in controls:
        d=math.dist(p,image)
        if d<1e-5:return raw[index]
        v=base(image); weights.append((1/d**3,(raw[index][0]-v[0],raw[index][1]-v[1])))
    total=sum(w for w,_ in weights)
    return (q[0]+sum(w*v[0] for w,v in weights)/total,q[1]+sum(w*v[1] for w,v in weights)/total)
def shape(points):return Polygon([world(p) for p in points]).buffer(0)
def path(points):return LineString([world(p) for p in points])
def polys(g):
    if g.is_empty:return []
    return [g] if g.geom_type=='Polygon' else [p for p in g.geoms if p.geom_type=='Polygon']
def coords(g):return [[round(x,3),round(y,3)] for x,y in list(g.exterior.coords)[:-1]]
def triangles(g):
    return [coords(t) for p in polys(g) for t in constrained_delaunay_triangles(p).geoms]
def packed(g):return dict(boundaries=[coords(p) for p in polys(g)],holes=[[[round(x,3),round(y,3)] for x,y in list(r.coords)[:-1]] for p in polys(g) for r in p.interiors],triangles=triangles(g))

# The visible circulation follows the supplied screenshot: north spine,
# central circular junction, and the long southern loop. Widths are estimates.
spines=[[(278,-30),(289,70),(340,186),(397,310),(446,411),(431,474),(406,527),(419,581),(472,665),(519,751),(565,833),(608,910),(594,941)],
        [(419,581),(285,618),(235,657),(277,743),(338,835),(400,924),(479,979),(545,986),(594,941)],
        [(414,573),(373,500),(335,419),(303,369)],
        [(404,924),(478,865),(519,751)],[(277,743),(358,700),(472,665)],
        [(479,979),(494,1040)],[(278,-30),(244,-80)]]
public=unary_union([path(p).buffer(3.3,cap_style=2,join_style=2) for p in spines])
# Atriums are inferred from map circulation + the 2025 multi-level interior photograph.
central=shape([(397,512),(432,506),(458,533),(465,567),(445,597),(412,601),(388,578),(381,544)])
south=shape([(390,761),(414,767),(461,810),(493,858),(503,898),(482,926),(451,910),(417,875),(378,806)])
north=path([(328,145),(389,284)]).buffer(3.8,cap_style=1)
voids=unary_union([central.buffer(-2),south.buffer(-2),north])
public=unary_union([public,central.buffer(3).difference(central.buffer(-3)),south.buffer(4).difference(south.buffer(-3))])

units=[]
def add(points,wing,tag='traced bay'):
    g=shape(points).intersection(outline.buffer(-.7)).difference(public).difference(voids.buffer(.4))
    occupied=unary_union([u['shape'] for u in units]) if units else Polygon()
    for poly in polys(g.difference(occupied.buffer(.12)).buffer(0)):
        if poly.area>12:units.append(dict(shape=poly,wing=wing,tag=tag))
def strip(a,b,c,d,weights,wing):
    # Paired edges of a row of mapped shop partitions. Unequal widths preserve variety.
    total=sum(weights);t=0
    for weight in weights:
        u=t+weight/total
        mix=lambda p,q,k:(p[0]+(q[0]-p[0])*k,p[1]+(q[1]-p[1])*k)
        add([mix(a,b,t),mix(a,b,u),mix(d,c,u),mix(d,c,t)],wing)
        t=u
# Anchor footprints and rows traced from the user-supplied map; north crop inferred.
add([(84,523),(319,395),(390,524),(175,648)],'Adriatico','large western anchor')
add([(252,775),(303,747),(369,867),(419,948),(368,979)],'Adriatico','southern anchor')
strip((173,28),(289,285),(313,273),(238,-5),[1,1,1.5,.7,1,.9,1.4],'Padre Faura')
strip((309,22),(402,220),(442,199),(354,-3),[1.5,1,1,.9,1,1],'Padre Faura')
strip((288,309),(331,380),(365,364),(329,289),[1,1.3,1],'Sta. Monica')
strip((354,241),(409,359),(443,342),(389,225),[1,1,1.4,1,1.2],'Padre Faura')
strip((453,292),(564,489),(520,510),(424,318),[1.5,.9,1,1.3,1.1,.8],'Center Atrium')
strip((176,662),(224,744),(260,724),(211,644),[1,1.3,1.2],'Adriatico')
strip((255,653),(308,744),(352,718),(301,627),[1,1,1.4,1],'Adriatico')
strip((312,647),(355,714),(403,687),(361,620),[1,1.3,1],'Center Atrium')
strip((483,592),(551,720),(595,698),(526,568),[1.5,1,1.2,.8,1.4],'Midtown')
strip((555,736),(631,869),(670,846),(590,715),[1,.9,1.4,1,1.1],'Midtown')
strip((624,867),(662,934),(695,920),(658,851),[1,1.2,1],'Midtown')
strip((350,753),(392,833),(421,815),(381,734),[1,1,1.2],'Pedro Gil')
strip((420,704),(468,774),(497,754),(450,682),[1,1.5,1],'Midtown')
strip((442,970),(529,1030),(551,995),(470,946),[1,1.3,1],'Pedro Gil')
strip((376,981),(431,1076),(464,1054),(412,963),[1.1,1,.8,1.5],'Adriatico')
# Curving store divisions around the central junction and rounded southern end.
for center,rin,rout,angles,wing in [((424,555),54,83,range(5,176,24),'Center Atrium'),((574,897),58,84,range(-15,126,20),'Midtown')]:
    for angle in angles:
        points=[]
        for radius,aa in [(rin,angle),(rin,angle+18),(rout,angle+18),(rout,angle)]:
            theta=math.radians(aa);points.append((center[0]+radius*math.cos(theta),center[1]+radius*math.sin(theta)))
        add(points,wing,'curved gallery bay')
# Complete cropped northern end as an explicitly estimated service/retail area.
strip((210,-83),(241,-11),(287,-30),(257,-113),[1,1,1],'Padre Faura')

# Known names/levels/wings from the official directory. Placement within each wing
# is a demo estimate; never infer a verified tenant polygon from this assignment.
tenants=[
 [('Robinsons Supermarket','shopping',(238,513),['groceries','buy food']),('Starbucks','food',(380,614),['coffee','drink']),('The French Baker','food',(196,681),['bread','bakery']),('Shake Shack','food',(651,898),['burger','hungry']),('Robinsons Department Store','shopping',(322,874),['clothes','shopping']),('Southstar Drug','health',(322,321),['pharmacy','medicine'])],
 [('Paeng’s Bowling','social',(397,1005),['bowling','play']),('Timezone','social',(440,1010),['arcade','games']),('Texas Roadhouse','food',(600,953),['steak','dinner']),('Coffee Bean & Tea Leaf','food',(584,772),['coffee','tea']),('Robinsons Department Store','shopping',(322,874),['clothes','shopping']),('PRC','services',(324,81),['license renewal','government'])],
 [('Robinsons Appliances','shopping',(397,1005),['appliance','electronics']),('Samsung','shopping',(577,767),['phone','smartphone']),('Fitness First','social',(321,860),['gym','exercise']),('Tom’s World','social',(648,889),['arcade','games']),('Robinsons Department Store','shopping',(238,513),['clothes','shopping']),('Food Court','food',(430,1010),['hungry','lunch','eat'])],
 [('Robinsons Movieworld','social',(318,869),['movies','cinema','film']),('Wendy’s','food',(380,614),['burger','hungry']),('S&R Pizza','food',(397,1005),['pizza','food']),('Yakimix','food',(600,951),['buffet','dinner']),('Bruno’s Barbers','services',(647,890),['haircut','barber']),('Sasa Cafe','food',(435,1010),['coffee','cafe'])]]

floors=[]
for f in range(4):
    # Two-level northern wing is a massing estimate, not a surveyed height profile.
    footprint=outline if f<2 else outline.intersection(shape([(-300,307),(900,307),(1400,1500),(-300,1500)]))
    slab=footprint.difference(voids) if f else footprint
    stores=[]
    for i,u in enumerate(units):
        for p in polys(u['shape'].intersection(footprint.buffer(-.3))):
            if p.area>12:stores.append(dict(id=f'unit-{f}-{i}',polygon=coords(p),shape=p,wing=u['wing'],tag=u['tag']))
    # A 3 m corridor graph covers only physical walkable floor, outside every shop and void.
    blocked=unary_union([s['shape'].buffer(.4) for s in stores])
    walk=slab.buffer(-.6).difference(blocked)
    step=3.;lo=walk.bounds; grid={}
    for ix in range(math.floor(lo[0]/step),math.ceil(lo[2]/step)+1):
        for iz in range(math.floor(lo[1]/step),math.ceil(lo[3]/step)+1):
            p=(ix*step,iz*step)
            if walk.contains(Point(p)):grid[(ix,iz)]=p
    target=world((494,1010));root=min(grid,key=lambda k:math.dist(grid[k],target))
    neighbors={}
    for k,p in grid.items():
        neighbors[k]=[q for dx,dz in [(1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)]
                      if (q:=(k[0]+dx,k[1]+dz)) in grid and walk.covers(LineString([p,grid[q]]))]
    reached={root};todo=deque([root])
    while todo:
        for q in neighbors[todo.popleft()]:
            if q not in reached:reached.add(q);todo.append(q)
    # Find an unobstructed doorway on every reachable store. Others remain visual only.
    for s in stores:
        poly=s['shape'];choices=[]
        for k in sorted(reached,key=lambda k:poly.distance(Point(grid[k])))[:45]:
            door=nearest_points(poly.boundary,Point(grid[k]))[0];line=LineString([door,Point(grid[k])])
            if line.length<.2 or line.length>15:continue
            if not slab.buffer(-.05).covers(line):continue
            if any(line.intersection(other['shape'].buffer(-.02)).length>.001 for other in stores):continue
            points=s['polygon'];edge=min(range(len(points)),key=lambda j:LineString([points[j],points[(j+1)%len(points)]]).distance(door))
            aa,bb=points[edge],points[(edge+1)%len(points)]
            if min(math.dist(door.coords[0],v) for v in [aa,bb])<1.0:continue
            choices.append((line.length,k,list(door.coords[0]),edge))
        if choices:
            _,s['grid'],s['door'],s['doorEdge']=min(choices)
    available=[s for s in stores if 'door' in s];used=set();destinations=[]
    for j,(name,category,p,aliases) in enumerate(tenants[f]):
        chosen=min((s for s in available if s['id'] not in used),key=lambda s:s['shape'].distance(Point(world(p))))
        used.add(chosen['id']); chosen.update(name=name,category=category)
        destinations.append(dict(unit=chosen['id'],name=name,category=category,aliases=aliases,wing=chosen['wing'],grid=chosen['grid']))
    # Demonstration vertical connection location: clear public circulation, inferred.
    landing=min(reached,key=lambda k:math.dist(grid[k],world((472,665))))
    # Dijkstra tree, retained only along destination paths. No path crosses closed geometry.
    dist={root:0};prev={};heap=[(0,root)]
    while heap:
        cost,k=heapq.heappop(heap)
        if cost!=dist[k]:continue
        for q in neighbors[k]:
            value=cost+math.dist(grid[k],grid[q])
            if value<dist.get(q,math.inf):dist[q]=value;prev[q]=k;heapq.heappush(heap,(value,q))
    links=set();protected={root,landing,*(d['grid'] for d in destinations)}
    for goal in protected:
        k=goal
        while k!=root:
            p=prev[k];links.add(tuple(sorted([k,p])));k=p
    graph={}
    for a,b in links:graph.setdefault(a,set()).add(b);graph.setdefault(b,set()).add(a)
    for k in list(graph):
        if k in protected or len(graph[k])!=2:continue
        a,b=tuple(graph[k]);v=(a[0]-k[0],a[1]-k[1]);w=(b[0]-k[0],b[1]-k[1])
        if v[0]*w[1]!=v[1]*w[0]:continue
        graph[a].remove(k);graph[b].remove(k);graph[a].add(b);graph[b].add(a);del graph[k]
    key=lambda k:'entrance' if f==0 and k==root else f'gallery-{f}-{k[0]}-{k[1]}'
    nodes=[dict(id=key(k),position=[*grid[k]]) for k in graph]
    edges=[(key(k),key(q)) for k in graph for q in graph[k] if k<q]
    for d in destinations:d['approach']=key(d.pop('grid'))
    for s in stores:s.pop('shape');s.pop('grid',None)
    floors.append(dict(id=f,height=f*5.5,slab=packed(slab),footprint=packed(footprint),stores=stores,
                       nodes=nodes,edges=edges,entry=key(root),landing=key(landing),destinations=destinations))
    print(f'Floor {f+1}: {len(stores)} store bays, {len(available)} clear doorways, {len(nodes)} routing nodes')

result=dict(schemaVersion=1,license='OSM-derived exterior: ODbL-1.0; interior: see reference provenance',attribution='© OpenStreetMap contributors',
  note='Adapted geodata. Interior trace, vertical circulation, heights and tenant coordinates are estimates; see README.md.',
  outline=coords(outline),floors=floors,atriums=packed(voids),
  northRoof=packed(outline.difference(Polygon(floors[2]['footprint']['boundaries'][0]))),
  projection=dict(origin=[120.984,14.5765],longitudeMetersPerDegree=107740,latitudeMetersPerDegree=111320),
  landmarks={name:list(world(p)) for name,p in [('entry',(494,1010)),('center',(424,555)),('south',(443,840)),('north',(344,208))]})
(OUT/'geometry.json').write_text(json.dumps(result,separators=(',',':')))
# Standalone plan for review: geometry only, no copied basemap tiles.
colors=['#dbe9e6','#f1e3cd','#e2dded','#dce5f1']; parts=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="-180 -245 360 470">','<rect x="-180" y="-245" width="360" height="470" fill="#faf9f6"/>']
pp=lambda p:' '.join(f'{x:.2f},{z:.2f}' for x,z in p)
parts.append(f'<polygon points="{pp(result["outline"])}" fill="#ede9e1" stroke="#514d46" stroke-width=".6"/>')
for i,s in enumerate(floors[0]['stores']):parts.append(f'<polygon points="{pp(s["polygon"])}" fill="{colors[i%4]}" stroke="#887e70" stroke-width=".4"/>')
for a,b in floors[0]['edges']:
 nd={n['id']:n['position'] for n in floors[0]['nodes']};parts.append(f'<polyline points="{pp([nd[a],nd[b]])}" fill="none" stroke="#b62436" stroke-width=".7"/>')
parts.append('<text x="-170" y="-229" font-family="sans-serif" font-size="5">ROBINSONS MANILA · REFERENCE RECONSTRUCTION</text><text x="-170" y="217" font-family="sans-serif" font-size="3.8">Approximate shop trace / © OpenStreetMap contributors · ODbL · demo routing</text></svg>')
(OUT/'plan-review.svg').write_text(''.join(parts))
