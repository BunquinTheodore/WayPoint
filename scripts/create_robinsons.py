"""Blender reconstruction of Robinsons Manila from documented, local references.
Regenerate geometry.json with prepare_robinsons.py after editing the source trace.
"""
import json, math
from mathutils import Vector
from create_estancia import inside
from interior_details import MallInterior


def build_robinsons(demo,shared):
    bpy,ROOT,material=shared['bpy'],shared['ROOT'],shared['material']
    data=json.loads((ROOT/'references/robinsons-manila/geometry.json').read_text())
    detail=MallInterior(demo,shared)
    cream=material('Reference: warm limestone',(.79,.74,.63))
    white=material('Reference: ivory balcony bands',(.93,.91,.84))
    red=material('Reference: Robinsons red',(.55,.012,.035))
    charcoal=material('Reference: charcoal framing',(.085,.10,.11))
    glazing=material('Reference: blue glazing',(.21,.39,.46))
    tile=material('Reference: pale terrazzo',(.84,.81,.74))
    leaf=material('Reference: palm green',(.12,.23,.095))
    trunk=material('Reference: palm trunk',(.36,.27,.17))
    asphalt=material('Reference: pavement',(.30,.31,.31))
    def mesh(name,vertices,faces,mat,parent,**extras):
        m=bpy.data.meshes.new(name);m.from_pydata([(x,-z,y) for x,y,z in vertices],[],faces);m.materials.append(mat)
        o=bpy.data.objects.new(name,m);demo.scene.collection.objects.link(o);o.parent=parent
        for k,v in extras.items():o[k]=v
        return o
    def plate(name,geom,y,thickness,mat,parent):
        vertices=[];faces=[]
        for triangle in geom['triangles']:
            offset=len(vertices);vertices.extend((x,y,z) for x,z in triangle)
            a,b,c=triangle
            area=(b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1])
            # X/Z is reflected into Blender X/-Y. Keep top normals facing up.
            faces.append((offset,offset+1,offset+2) if area<0 else (offset+2,offset+1,offset))
        for ring in geom['boundaries']+geom.get('holes',[]):
            for a,b in zip(ring,ring[1:]+ring[:1]):
                offset=len(vertices);vertices.extend([(a[0],y,a[1]),(b[0],y,b[1]),(b[0],y-thickness,b[1]),(a[0],y-thickness,a[1])]);faces.append(tuple(range(offset,offset+4)))
        return mesh(name,vertices,faces,mat,parent)
    def polyplate(name,poly,y,mat,parent):
        # Convex/concave n-gon tessellation is handled by Blender's exporter.
        area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(poly,poly[1:]+poly[:1]))
        face=tuple(range(len(poly))) if area<0 else tuple(range(len(poly)-1,-1,-1))
        return mesh(name,[(x,y,z) for x,z in poly],[face],mat,parent)
    def bar(name,a,b,width,height,y,mat,parent):
        length=math.dist(a,b)
        if length<.015:return
        o=demo.cube(name,((a[0]+b[0])/2,y,(a[1]+b[1])/2),(length,height,width),mat,parent)
        o.rotation_euler.z=-math.atan2(b[1]-a[1],b[0]-a[0]);return o
    def pole(name,x,z,y,height,radius,mat,parent):
        n=10;vertices=[(x+radius*math.cos(i*math.tau/n),h,z+radius*math.sin(i*math.tau/n)) for h in [y,y+height] for i in range(n)]
        return mesh(name,vertices,[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat,parent)
    def rail(ring,y,parent):
        for a,b in zip(ring,ring[1:]+ring[:1]):
            bar('Atrium glass balustrade',a,b,.1,.85,y+.54,glazing,parent)
            bar('Atrium stainless handrail',a,b,.07,.07,y+1.02,charcoal,parent)
            count=max(1,math.ceil(math.dist(a,b)/3))
            for i in range(count):
                p=[a[j]+(b[j]-a[j])*i/count for j in [0,1]]
                pole('Balustrade post',*p,y,1.04,.045,charcoal,parent)
    def sign(text,a,b,y,size,mat,parent):
        font=bpy.data.curves.new('Facade lettering','FONT');font.body=text;font.align_x='CENTER';font.size=size;font.extrude=.025
        font.materials.append(mat);obj=bpy.data.objects.new('Robinsons identity '+text,font);demo.scene.collection.objects.link(obj);obj.parent=parent
        obj.location=((a[0]+b[0])/2,-(a[1]+b[1])/2,y)
        obj.rotation_euler=(math.pi/2,0,-math.atan2(b[1]-a[1],b[0]-a[0]))
        return obj

    demo.floor_height=5.5
    for f in data['floors']:
        idx,y=f['id'],f['height'];floor=demo.group('Floor_'+str(idx),demo.root,floor_id=idx)
        plate('Floor slab - reference footprint',f['slab'],y-.025,.35,tile,floor)
        shell=demo.group('Robinsons exterior '+str(idx),floor,shell=True)
        # OSM outline controls the building envelope, including west indentation.
        for ring in f['footprint']['boundaries']:
            for i,(a,b) in enumerate(zip(ring,ring[1:]+ring[:1])):
                length=math.dist(a,b)
                bar('Limestone facade base',a,b,.35,1.08,y+.54,cream,shell)
                bar('White horizontal balcony band',a,b,.46,.62,y+4.96,white,shell)
                # Glazed public frontages contrast with the more solid anchor/service sides.
                public_front=(a[1]+b[1])/2>100 or ((a[0]+b[0])/2<-10 and (a[1]+b[1])/2>20)
                bar('Recessed blue frontage' if public_front else 'Solid mall cladding',a,b,.14,3.15,y+2.75,glazing if public_front else cream,shell)
                bays=max(1,math.ceil(length/5.5))
                for j in range(bays):
                    p=[a[k]+(b[k]-a[k])*j/bays for k in [0,1]]
                    pole('Facade mullion',*p,y+1.1,3.6,.065,charcoal,shell)
                for offset in [.15,.29,.43]:bar('Balcony recessed stripe',a,b,.49,.025,y+4.7+offset,cream,shell)
        # Real map-inspired partitions with opened storefront doorways.
        for i,s in enumerate(f['stores']):
            poly=s['polygon'];group=demo.group(s.get('name',s['id']),floor,source_unit=s['id'],fitout_verified=False)
            polyplate('Store footprint',poly,y+.04,detail.palette['tile'],group)
            for j,(a,b) in enumerate(zip(poly,poly[1:]+poly[:1])):
                if 'door' in s and j==s['doorEdge']:
                    d=s['door'];length=math.dist(a,b);gap=min(2.4,length*.5)
                    unit=[(b[k]-a[k])/length for k in [0,1]]
                    before=[d[k]-unit[k]*gap/2 for k in [0,1]];after=[d[k]+unit[k]*gap/2 for k in [0,1]]
                    detail.wall(a,before,y,group,True);detail.wall(after,b,y,group,True)
                else:detail.wall(a,b,y,group)
            name=s.get('name',['Fashion boutique','Cafe','Home furnishings','Electronics','Beauty store','Restaurant'][i%6])
            category=s.get('category','food' if i%6 in [1,5] else 'shopping')
            demo.props.dress(poly,y,group,inside,name,category,i+idx*101)
            # Irregular / triangular bays can reject all bbox-corner placements.
            # Add a compact category-specific set at the safest interior point.
            if not any(o.get('asset_name') for o in group.children):
                from create_estancia import boundary_distance
                xs=[p[0] for p in poly];zs=[p[1] for p in poly]
                candidates=[(x,z) for x in range(math.ceil(min(xs)),math.floor(max(xs)),2)
                            for z in range(math.ceil(min(zs)),math.floor(max(zs)),2) if inside((x,z),poly)]
                if candidates:
                    cx,cz=max(candidates,key=lambda p:boundary_distance(p,poly))
                    if category=='food':
                        top=demo.props.place('tableRound',cx,y+.08,cz,1.3,group,poly,inside)
                        for dz in [-1.1,1.1]:demo.props.place('chairRounded',cx,y+.08,cz+dz,.6,group,poly,inside)
                        if top:demo.props.place('cup-coffee',cx,y+.1+top,cz,.3,group,poly,inside)
                    else:
                        demo.props.place('desk' if i%3==0 else 'bookcaseOpenLow' if i%3==1 else 'coatRackStanding',cx,y+.08,cz,1.6,group,poly,inside)
            # A few recognizable low-poly shelving aisles replace the dense grid of
            # tiny imported cabinets. They are illustrative, not a surveyed fit-out.
            if s['tag'] in ['large western anchor','southern anchor']:
                lo=[min(p[k] for p in poly) for k in [0,1]];hi=[max(p[k] for p in poly) for k in [0,1]]
                shelves=demo.group('Simplified anchor shelving',group,illustrative_detail=True)
                count=0
                for xx in range(math.ceil(lo[0]/14)*14,math.floor(hi[0]/14)*14,14):
                    for zz in range(math.ceil(lo[1]/14)*14,math.floor(hi[1]/14)*14,14):
                        if count>=24:break
                        if not all(inside((xx+dx,zz+dz),poly) for dx in [-1,1] for dz in [-3.5,3.5]):continue
                        demo.cube('Illustrative display plinth shelf',(xx,y+.55,zz),(1.1,1.1,6),detail.palette['fixture'],shelves)
                        for dy in [.25,.8,1.15]:demo.cube('Lightweight shelf tier',(xx,y+dy,zz),(1.4,.06,6.1),detail.palette['tile'],shelves)
                        count+=1
            if 'name' in s:
                xs=[p[0] for p in poly];zs=[p[1] for p in poly]
                demo.label(s['name'],((min(xs)+max(xs))/2,y+.12,(min(zs)+max(zs))/2),group,.7,detail.palette['ink'])
        for ring in f['slab']['holes']:rail(ring,y,floor)
        # Columns along the actual void edges, clear of graph links and door approaches.
        for ring in f['slab']['holes']:
            for j,p in enumerate(ring):
                if j%3==0:pole('Atrium cylindrical column',*p,y,4.8,.3,white,floor)
        # Symbolic paired escalators stand inside the open atrium; separate graph
        # links use a clear demonstration landing and do not claim surveyed positions.
        if idx<3:
            for key in ['center','south']:
                x,z=data['landmarks'][key];detail.escalator(x,y,z,10,3.2,.98,floor)
        for n in f['nodes']:demo.node(n['id'],idx,[n['position'][0],y+.18,n['position'][1]],'Public gallery')
        for a,b in f['edges']:demo.edge(a,b,evacuation=False)
        for d in f['destinations']:
            s=next(s for s in f['stores'] if s['id']==d['unit']);p=s['door'];rid=s['id']
            demo.node(rid,idx,[p[0],y+.18,p[1]],d['name']+' storefront')
            demo.edge(d['approach'],rid,'door',evacuation=False)
            xs=[p[0] for p in s['polygon']];zs=[p[1] for p in s['polygon']]
            demo.rooms.append(dict(id=rid,name=d['name'],category=d['category'],aliases=d['aliases'],floor=idx,
                position=[(min(xs)+max(xs))/2,y+.18,(min(zs)+max(zs))/2],size=[max(xs)-min(xs),max(zs)-min(zs)],footprint=s['polygon'],node=rid,
                description=f"Official directory lists {d['name']} on Level {idx+1}. Its modeled storefront position within the mall is estimated. The ground-floor divisions follow a manually interpreted map; upper-floor divisions and CC0 furnishings are illustrative. Route ends at the storefront."))
        # Preserve the established QR entry ID. These are demo anchors, not on-site codes.
        landing=next(n for n in demo.nodes if n['id']==f['landing']);landing['label']=f'Elevator · Level {idx+1}';landing['checkpoint']=f'floor-{idx}-lift'
        # Concept restrooms beside each elevator landing so facility requests have an answer.
        demo.rooms.append(dict(id=f'restroom-{idx}',name='Restrooms',category='facilities',aliases=['toilet','bathroom','cr','comfort room'],floor=idx,
            position=[landing['position'][0]+6,landing['position'][1],landing['position'][2]],size=[6,6],node=landing['id'],
            description=f'Demo restroom position beside the Level {idx+1} elevator landing. The real mall restrooms are not surveyed; this is a concept placement for navigation demonstrations.'))
        if idx:demo.edge(data['floors'][idx-1]['landing'],f['landing'],'elevator',True,False)
        else:
            entry=next(n for n in demo.nodes if n['id']==f['entry']);entry['checkpoint']='entrance';entry['label']='Midtown entrance · demo anchor'
            # app checkpoints look up checkpoint values, not a specific node id
    roof=demo.group('Roof',demo.root,roof=True)
    plate('Lower Padre Faura roof',data['northRoof'],11.25,.5,white,roof)
    plate('Main mall roof',data['floors'][3]['slab'],22.4,.55,white,roof)
    # Faceted glass atrium roofs and ribs; removable with the exterior on cutaway.
    for ring in data['atriums']['boundaries']:
        cx=sum(p[0] for p in ring)/len(ring);cz=sum(p[1] for p in ring)/len(ring)
        height=12.4 if cz<-80 else 25.5
        vertices=[(x,height-2,z) for x,z in ring]+[(cx,height,cz)]
        mesh('Faceted atrium skylight',vertices,[(i,(i+1)%len(ring),len(ring)) for i in range(len(ring))],glazing,roof)
        for i,p in enumerate(ring):
            if i%2==0:
                # Roof ribs are narrow pitched beams joining eave to apex.
                a=Vector((p[0],-p[1],height-2));b=Vector((cx,-cz,height));delta=b-a
                o=demo.cube('Steel atrium roof truss',((a.x+b.x)/2,(a.z+b.z)/2,-(a.y+b.y)/2),(.16,delta.length,.16),white,roof)
                o.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
    for x,z in [(-55,55),(-70,-5),(16,42),(2,-123)]:demo.cube('Screened roof plant',(x,23.3 if z>-80 else 12.2,z),(10,1.8,6),cream,roof)

    # Curved Midtown/Pedro Gil frontage sampled from the southern OSM boundary.
    frontage=data['outline'][17:36]
    for f in data['floors']:
        floor=next(o for o in demo.scene.objects if o.get('floor_id')==f['id'])
        facade=demo.group('Curved entrance balcony',floor,shell=True);y=f['height']
        for a,b in zip(frontage,frontage[1:]):
            bar('Projecting entrance balcony',a,b,3.2,.34,y+4.72,white,facade)
            bar('Entrance glass canopy',a,b,4.2,.08,y+4.35,glazing,facade)
            bar('Balcony glass guard',a,b,.12,.95,y+1,glazing,facade)
        for i,p in enumerate(frontage):
            if i%3==0:pole('Entrance round column',*p,y,5.4,.5,white,facade)
    # Lettering faces south, matching the photographic frontage; no photo texture needed.
    sa,sb=frontage[7],frontage[-2]
    sign('ROBINSONS',sa,sb,25.2,3.3,red,roof)
    sign('PLACE Manila',sa,sb,22.8,2.0,red,roof)
    bar('Ribbed sign backing',sa,sb,.5,7.3,24.9,charcoal,roof)
    # Front-face lettering sits .5 m in front of the signboard.
    for o in list(roof.children):
        if o.name.startswith('Robinsons identity'):o.location.y-=.65
    for f in range(12):bar('Signboard horizontal rib',sa,sb,.54,.07,21.55+f*.6,cream,roof)
    entrance=demo.group('Grounds',demo.root)
    # Lightweight steel-and-fabric drop-off canopy, modeled from the May 2025 photos.
    for a,b in zip(frontage,frontage[1:]):
        aa=(a[0],a[1]+5.8);bb=(b[0],b[1]+5.8)
        mesh('Tensile entrance canopy',[(a[0],4.6,a[1]),(b[0],4.6,b[1]),(bb[0],3.9,bb[1]),(aa[0],3.9,aa[1])],[(3,2,1,0)],white,entrance)
        bar('Canopy edge steel',aa,bb,.13,.18,3.9,charcoal,entrance)
    for i,p in enumerate(frontage):
        if i%4:continue
        pole('Canopy mast',p[0],p[1]+5.8,0,4.1,.13,white,entrance)
    # Palms frame the entrance; stay outside the mall and the routing graph.
    for p in [frontage[i] for i in [0,5,10,15]]:
        x,z=p[0],p[1]+10
        pole('Palm planter',x,z,0,.6,1.0,cream,entrance);pole('Palm trunk',x,z,.6,6,.16,trunk,entrance)
        for i in range(9):
            t=i*math.tau/9;dx,dz=math.cos(t),math.sin(t)
            mesh('Palm frond',[(x,6.5,z),(x+dx*1.5-dz*.55,7,z+dz*1.5+dx*.55),(x+dx*3,5.8,z+dz*3),(x+dx*1.5+dz*.55,7,z+dz*1.5-dx*.55)],[(0,1,2),(0,2,3)],leaf,entrance)
    building=dict(id=demo.entry['id'],name=demo.entry['name'],version='2.1.0',schemaVersion=1,reviewDate='2026-10-10',
        floors=[dict(id=f['id'],name=f"Level {f['id']+1}",height=f['height']) for f in data['floors']],rooms=demo.rooms,nodes=demo.nodes,edges=demo.edges,model='building.glb',
        provenance={key:demo.entry[key] for key in ['layoutStatus','layoutNote','sources']},
        instructions=dict(assistance='Vertical connections are demonstration estimates; accessible paths require an on-site survey.',emergency='DEMONSTRATION ONLY. Reference reconstruction, not an approved evacuation map. No evacuation routes or assembly points are supplied. Follow posted signs and facility staff.'),
        attribution='Building footprint © OpenStreetMap contributors (ODbL). See bundled provenance sources.',
        interiorAssets=dict(author='Kenney',license='CC0-1.0',sources=['https://kenney.nl/assets/furniture-kit','https://kenney.nl/assets/food-kit'],models=[dict(pack=p,name=n) for p,n in sorted(demo.props.usage)],fitoutsVerified=False))
    demo.save(building,280,460,29)
