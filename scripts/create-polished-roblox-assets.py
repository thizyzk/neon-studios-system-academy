import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
OUT_ROOT = ROOT / "generated-models" / "polished"


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def mat(name, color, roughness=0.72, metallic=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
    material.diffuse_color = color
    return material


def apply_modifiers(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def shade_smooth(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    obj.select_set(False)


def bevel_cube(name, location, scale, material, bevel=0.08):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material:
        obj.data.materials.append(material)
    bevel_mod = obj.modifiers.new("soft bevel", "BEVEL")
    bevel_mod.width = bevel
    bevel_mod.segments = 5
    bevel_mod.affect = "EDGES"
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    apply_modifiers(obj)
    shade_smooth(obj)
    return obj


def ellipsoid(name, location, scale, material, noise_strength=0.0, segments=32, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=16, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.rotation_euler = rotation
    if material:
        obj.data.materials.append(material)
    if noise_strength > 0:
        texture = bpy.data.textures.new(f"{name}_soft_noise", "VORONOI")
        texture.noise_scale = 0.7
        texture.intensity = 0.18
        displace = obj.modifiers.new("soft cotton surface", "DISPLACE")
        displace.strength = noise_strength
        displace.texture = texture
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    apply_modifiers(obj)
    shade_smooth(obj)
    return obj


def cylinder_between(name, p1, p2, radius, material, vertices=18):
    p1 = Vector(p1)
    p2 = Vector(p2)
    midpoint = (p1 + p2) * 0.5
    direction = p2 - p1
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=direction.length, location=midpoint)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    if material:
        obj.data.materials.append(material)
    obj.modifiers.new("stem normals", "WEIGHTED_NORMAL")
    apply_modifiers(obj)
    shade_smooth(obj)
    return obj


def leaf_mesh(name, angle, length, width, location, material):
    verts = [
        (0.0, 0.0, 0.0),
        (width * 0.55, length * 0.42, 0.04),
        (0.0, length, 0.0),
        (-width * 0.55, length * 0.42, 0.04),
    ]
    faces = [(0, 1, 2, 3)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (math.radians(65), 0.0, angle)
    if material:
        obj.data.materials.append(material)
    obj.modifiers.new("leaf thickness", "SOLIDIFY").thickness = 0.018
    bevel = obj.modifiers.new("leaf edge", "BEVEL")
    bevel.width = 0.012
    bevel.segments = 2
    apply_modifiers(obj)
    shade_smooth(obj)
    return obj


def create_root_marker(size=(0.18, 0.18, 0.18)):
    root_mat = mat("Root_Marker_Material", (0.1, 0.45, 1.0, 0.18))
    root = bevel_cube("Root", (0, 0, 0), size, root_mat, bevel=0.01)
    root.hide_render = True
    root.display_type = "WIRE"
    return root


def export_asset(asset_name):
    out_dir = OUT_ROOT / asset_name
    out_dir.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.resolution_x = 1280
    bpy.context.scene.render.resolution_y = 900
    bpy.context.scene.render.filepath = str(out_dir / f"{asset_name}_preview.png")
    bpy.context.scene.view_settings.view_transform = "Filmic"
    bpy.context.scene.view_settings.look = "Medium High Contrast"
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / f"{asset_name}.blend"))
    bpy.ops.wm.obj_export(
        filepath=str(out_dir / f"{asset_name}.obj"),
        export_materials=True,
        apply_modifiers=True,
    )
    bpy.ops.export_scene.fbx(
        filepath=str(out_dir / f"{asset_name}.fbx"),
        use_selection=False,
        apply_unit_scale=True,
        bake_space_transform=False,
        path_mode="AUTO",
    )


def setup_camera():
    bpy.ops.object.light_add(type="AREA", location=(-3, -4, 5))
    light = bpy.context.object
    light.name = "Key_Light"
    light.data.energy = 450
    light.data.size = 5
    bpy.ops.object.camera_add(location=(2.6, -3.6, 2.35), rotation=(math.radians(61), 0, math.radians(36)))
    bpy.context.scene.camera = bpy.context.object


def cotton_boll():
    reset_scene()
    cotton = mat("Warm_White_Cotton", (0.94, 0.92, 0.86, 1), roughness=0.92)
    cotton_shadow = mat("Soft_Cream_Cotton", (0.84, 0.80, 0.70, 1), roughness=0.96)
    stem = mat("Dry_Cotton_Stem", (0.32, 0.20, 0.12, 1), roughness=0.88)
    husk = mat("Olive_Brown_Husk", (0.28, 0.25, 0.13, 1), roughness=0.9)

    cylinder_between("Curved_Stem_A", (-0.95, -0.18, 0.15), (-0.18, 0.02, 0.48), 0.055, stem)
    cylinder_between("Curved_Stem_B", (-0.18, 0.02, 0.48), (0.18, 0.02, 0.28), 0.05, stem)

    centers = [
        (0.05, 0.08, 0.72),
        (0.32, 0.03, 0.55),
        (-0.20, 0.08, 0.53),
        (0.10, -0.20, 0.50),
        (0.08, 0.25, 0.50),
    ]
    scales = [
        (0.32, 0.26, 0.30),
        (0.30, 0.24, 0.27),
        (0.29, 0.24, 0.26),
        (0.27, 0.21, 0.24),
        (0.26, 0.20, 0.23),
    ]
    for i, (center, scale) in enumerate(zip(centers, scales), start=1):
        ellipsoid(f"Cotton_Lobe_{i}", center, scale, cotton if i % 2 else cotton_shadow, noise_strength=0.018)

    tufts = [
        (-0.08, -0.17, 0.75, 0.12, 0.09, 0.08),
        (0.22, 0.24, 0.70, 0.10, 0.08, 0.07),
        (0.40, -0.08, 0.48, 0.09, 0.07, 0.06),
        (-0.28, -0.02, 0.58, 0.08, 0.07, 0.07),
        (0.06, 0.34, 0.43, 0.08, 0.06, 0.06),
    ]
    for i, (x, y, z, sx, sy, sz) in enumerate(tufts, start=1):
        ellipsoid(f"Small_Cotton_Tuft_{i}", (x, y, z), (sx, sy, sz), cotton, noise_strength=0.012, segments=20)

    for i in range(5):
        angle = i * math.tau / 5.0 + 0.25
        leaf_mesh(f"Dry_Husk_{i+1}", angle, 0.62, 0.26, (0.08, 0.02, 0.36), husk)
        ellipsoid(
            f"Husk_Rib_{i+1}",
            (0.08 + math.cos(angle) * 0.16, 0.02 + math.sin(angle) * 0.16, 0.40),
            (0.035, 0.13, 0.025),
            husk,
            segments=12,
            rotation=(math.radians(76), 0, angle),
        )

    create_root_marker()
    setup_camera()
    export_asset("cotton_boll_polished")


def cotton_bale():
    reset_scene()
    cotton = mat("Compressed_Cotton", (0.89, 0.86, 0.77, 1), roughness=0.94)
    side = mat("Cotton_Shadowed_Sides", (0.72, 0.68, 0.58, 1), roughness=0.96)
    band = mat("Jute_Fabric_Bands", (0.42, 0.30, 0.18, 1), roughness=0.86)

    bale = bevel_cube("Compressed_Cotton_Bale", (0, 0, 0.62), (1.75, 1.05, 0.82), cotton, bevel=0.14)
    texture = bpy.data.textures.new("bale_lumpy_surface", "VORONOI")
    texture.noise_scale = 0.9
    texture.intensity = 0.22
    displace = bale.modifiers.new("compressed cotton unevenness", "DISPLACE")
    displace.strength = 0.035
    displace.texture = texture
    apply_modifiers(bale)

    bevel_cube("Left_Fold_Shadow", (-0.91, 0, 0.6), (0.08, 0.96, 0.72), side, bevel=0.06)
    bevel_cube("Right_Fold_Shadow", (0.91, 0, 0.6), (0.08, 0.96, 0.72), side, bevel=0.06)
    bevel_cube("Band_A_Top", (-0.42, 0, 1.08), (0.12, 1.15, 0.12), band, bevel=0.025)
    bevel_cube("Band_B_Top", (0.42, 0, 1.08), (0.12, 1.15, 0.12), band, bevel=0.025)
    bevel_cube("Band_A_Front", (-0.42, -0.56, 0.62), (0.12, 0.08, 0.78), band, bevel=0.02)
    bevel_cube("Band_B_Front", (0.42, -0.56, 0.62), (0.12, 0.08, 0.78), band, bevel=0.02)
    bevel_cube("Center_Cotton_Fold", (0, -0.59, 0.65), (0.62, 0.06, 0.64), cotton, bevel=0.08)
    ellipsoid("Loose_Cotton_Corner", (0.72, -0.62, 0.24), (0.18, 0.05, 0.10), cotton, noise_strength=0.012, segments=20)

    create_root_marker()
    setup_camera()
    export_asset("cotton_bale_polished")


def cotton_machine():
    reset_scene()
    paint = mat("Painted_Green_Metal", (0.24, 0.43, 0.34, 1), roughness=0.58)
    dark = mat("Dark_Rubber_Rollers", (0.04, 0.045, 0.04, 1), roughness=0.72)
    steel = mat("Brushed_Steel", (0.62, 0.63, 0.60, 1), roughness=0.42, metallic=0.35)
    cloth = mat("Cotton_Cloth_Output", (0.88, 0.85, 0.76, 1), roughness=0.9)
    brass = mat("Warm_Brass_Details", (0.75, 0.53, 0.23, 1), roughness=0.36, metallic=0.45)

    bevel_cube("Machine_Base", (0, 0, 0.35), (1.7, 1.1, 0.55), paint, bevel=0.08)
    bevel_cube("Top_Hopper", (-0.35, 0, 0.95), (0.9, 0.85, 0.45), paint, bevel=0.07)
    bevel_cube("Output_Chute", (0.72, -0.02, 0.72), (0.72, 0.72, 0.22), steel, bevel=0.04)
    bevel_cube("Folded_Cloth", (1.12, -0.02, 0.52), (0.38, 0.58, 0.12), cloth, bevel=0.05)

    cylinder_between("Front_Roller", (-0.15, -0.58, 0.72), (0.65, -0.58, 0.72), 0.09, dark, vertices=24)
    cylinder_between("Back_Roller", (-0.15, 0.58, 0.72), (0.65, 0.58, 0.72), 0.09, dark, vertices=24)
    cylinder_between("Drive_Axle", (-0.7, 0, 0.72), (-0.7, 0, 1.05), 0.05, steel, vertices=20)

    for y in (-0.42, 0.42):
        for x in (-0.55, 0.55):
            cylinder_between(f"Leg_{x}_{y}", (x, y, 0.02), (x, y, 0.35), 0.055, steel, vertices=16)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.105, location=(-0.86, -0.58, 0.98))
    knob = bpy.context.object
    knob.name = "Control_Knob"
    knob.data.materials.append(brass)
    shade_smooth(knob)

    create_root_marker()
    setup_camera()
    export_asset("cotton_machine_polished")


def main():
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    cotton_boll()
    cotton_bale()
    cotton_machine()


if __name__ == "__main__":
    main()
