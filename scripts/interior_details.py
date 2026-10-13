"""Lightweight, illustrative cutaway fixtures; never a source of routing data."""
import math


class MallInterior:
    def __init__(self, demo, shared):
        self.demo = demo
        self.palette = {
            key: shared['material']('Cutaway ' + key, (value, value, value))
            for key, value in {
                'slab': .80, 'tile': .91, 'wall': .56, 'cap': .32,
                'front': .76, 'fixture': .64, 'ink': .12, 'tread': .40,
            }.items()
        }

    def box(self, name, pos, size, material, parent):
        obj = self.demo.cube(name, pos, size, self.palette[material], parent)
        obj['illustrative_detail'] = True
        return obj

    def wall(self, a, b, y, parent, storefront=False):
        length = math.dist(a, b)
        if length < .03:
            return
        angle = math.atan2(-(b[1]-a[1]), b[0]-a[0])
        center = ((a[0]+b[0])/2, (a[1]+b[1])/2)
        height = 1.18 if storefront else 1.32
        name = 'Illustrative storefront' if storefront else 'Cutaway dividing wall'
        body = self.box(name, (center[0], y+height/2, center[1]),
                        (length, height, .16), 'front' if storefront else 'wall', parent)
        body.rotation_euler.z = angle
        cap = self.box('Partition top edge', (center[0], y+height+.025, center[1]),
                       (length+.025, .05, .19), 'cap', parent)
        cap.rotation_euler.z = angle
        if storefront:
            for point in [a, b]:
                self.box('Storefront post', (point[0], y+.63, point[1]),
                         (.18, 1.26, .18), 'cap', parent)

    def escalator(self, x, y, z, span, width, angle, parent):
        """Paired tread/rail symbols fit inside the supplied footprint; no new floor link."""
        group = self.demo.group('Illustrative escalator pair', parent, illustrative_detail=True)
        # Convert local longitudinal/lateral positions to physical model X/Z.
        def point(u, v):
            return (x+u*math.cos(angle)-v*math.sin(angle),
                    z+u*math.sin(angle)+v*math.cos(angle))
        span = max(2, span)
        lane = width*.32
        for side in [-1, 1]:
            for i in range(18):
                u = -span/2 + (i+.5)*span/18
                px, pz = point(u, side*width*.23)
                height = .14 + (.65*i/17 if side > 0 else .65*(17-i)/17)
                tread = self.box('Escalator tread', (px, y+height/2, pz),
                                 (span/18*.94, height, lane), 'tread', group)
                tread.rotation_euler.z = -angle
            for offset in [-lane/2-.08, lane/2+.08]:
                px, pz = point(0, side*width*.23+offset)
                rail = self.box('Escalator handrail', (px, y+.97, pz),
                                (math.hypot(span, .65), .09, .12), 'cap', group)
                rail.rotation_euler = (0, -side*math.atan2(.65, span), -angle)
        for u in [-span/2-.4, span/2+.4]:
            px, pz = point(u, 0)
            landing = self.box('Escalator landing', (px, y+.055, pz),
                               (.8, .11, width), 'front', group)
            landing.rotation_euler.z = -angle

    def fixtures(self, polygon, y, parent, inside, name, category, variant=0):
        self.demo.props.dress(polygon,y,parent,inside,name,category,variant)
