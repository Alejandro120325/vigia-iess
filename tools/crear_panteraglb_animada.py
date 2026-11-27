# Ejecutar con Blender 4.x: blender --background --python crear_panteraglb_animada.py -- --repo "RUTA_DEL_PROYECTO"
import bpy
import os
import sys
import math
import traceback

CLIPS = [
    ("Charge.fbx", "Vigia_Charge"),
    ("Talking.fbx", "Vigia_Talking"),
    ("Waving-2.fbx", "Vigia_Waving"),
    ("Standing W_Briefcase Idle.fbx", "Vigia_IdleBriefcase"),
    ("Standing Thumbs Up.fbx", "Vigia_ThumbsUp"),
    ("Thoughtful Head Shake.fbx", "Vigia_HeadShake"),
]


def repo_from_args():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    for i, value in enumerate(args):
        if value in ("--repo", "--repo-path") and i + 1 < len(args):
            return os.path.abspath(args[i + 1])
    raise RuntimeError("Falta --repo RUTA_DEL_PROYECTO")


def bone_names(armature):
    return set(bone.name for bone in armature.data.bones)


def find_target_armature():
    candidates = [obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE']
    expected = candidates and max(candidates, key=lambda obj: len(bone_names(obj)))
    if not expected:
        raise RuntimeError("No se encontró una armadura en el GLB de la Pantera.")
    names = bone_names(expected)
    if "mixamorig:Hips" not in names or len(names) < 20:
        raise RuntimeError("La armadura de la Pantera no parece ser el esqueleto Mixamo esperado.")
    return expected


def add_action_track(target, action, track_name):
    if not target.animation_data:
        target.animation_data_create()
    track = target.animation_data.nla_tracks.new()
    track.name = track_name
    start = float(action.frame_range[0])
    end = float(action.frame_range[1])
    strip_start = 1
    strip = track.strips.new(track_name, strip_start, action)
    strip.action_frame_start = start
    strip.action_frame_end = end
    strip.frame_start = strip_start
    strip.blend_type = 'REPLACE'
    strip.extrapolation = 'NOTHING'
    return track


def remove_imported_objects(new_objects, target):
    for obj in list(new_objects):
        if obj == target or obj.name not in bpy.data.objects:
            continue
        bpy.data.objects.remove(obj, do_unlink=True)


def main():
    repo = repo_from_args()
    base_glb = os.path.join(repo, 'mod_avatar_accesibilidad', 'models', 'panteraups.glb')
    fbx_dir = os.path.join(repo, 'mod_avatar_accesibilidad', 'animaciones_fuente')
    output_glb = os.path.join(repo, 'mod_avatar_accesibilidad', 'models', 'panteraups_animada.glb')
    if not os.path.isfile(base_glb):
        raise RuntimeError("No existe el GLB base: " + base_glb)
    missing = [name for name, _ in CLIPS if not os.path.isfile(os.path.join(fbx_dir, name))]
    if missing:
        raise RuntimeError("Faltan archivos FBX: " + ", ".join(missing))

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=base_glb)
    target = find_target_armature()
    target.name = 'Vigia_Pantera_Rig'
    target_bones = bone_names(target)
    print("Rig Pantera:", len(target_bones), "huesos Mixamo")

    # Conserva la animación que ya venía en el GLB, pero no reemplaza el archivo original.
    if target.animation_data and target.animation_data.action:
        original = target.animation_data.action.copy()
        original.name = 'Vigia_IdleOriginal'
        target.animation_data.action = None
        add_action_track(target, original, 'Vigia_IdleOriginal')

    for filename, clip_name in CLIPS:
        filepath = os.path.join(fbx_dir, filename)
        before_objects = set(bpy.data.objects)
        before_actions = set(bpy.data.actions)
        bpy.ops.import_scene.fbx(filepath=filepath, use_anim=True, automatic_bone_orientation=False)
        imported_objects = set(bpy.data.objects) - before_objects
        source_armatures = [obj for obj in imported_objects if obj.type == 'ARMATURE']
        if not source_armatures:
            raise RuntimeError("No se encontró armadura al importar " + filename)
        source = max(source_armatures, key=lambda obj: len(bone_names(obj)))
        source_bones = bone_names(source)
        missing_bones = sorted(target_bones - source_bones)
        extra_bones = sorted(source_bones - target_bones)
        if missing_bones or extra_bones:
            raise RuntimeError(
                "El rig de " + filename + " no coincide con Pantera. "
                "Faltan: " + str(missing_bones[:8]) + "; extras: " + str(extra_bones[:8])
            )

        action = source.animation_data.action if source.animation_data else None
        if action is None:
            new_actions = [a for a in bpy.data.actions if a not in before_actions and len(a.fcurves) > 0]
            if new_actions:
                action = max(new_actions, key=lambda a: len(a.fcurves))
        if action is None or len(action.fcurves) == 0:
            raise RuntimeError("No se encontró una acción de animación en " + filename)

        # Las acciones Mixamo apuntan a nombres de huesos. Como los 25 nombres
        # coinciden exactamente, se asocian al rig de la Pantera sin traer otro mesh.
        action_copy = action.copy()
        action_copy.name = clip_name
        add_action_track(target, action_copy, clip_name)
        print("Clip agregado:", clip_name, "| F-curves:", len(action_copy.fcurves), "| frames:", tuple(action_copy.frame_range))
        remove_imported_objects(imported_objects, target)

    # Selecciona únicamente la mascota y la armadura para exportar un GLB compacto.
    bpy.ops.object.select_all(action='DESELECT')
    export_objects = [target]
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        attached = obj.parent == target or any(mod.type == 'ARMATURE' and mod.object == target for mod in obj.modifiers)
        if attached:
            export_objects.append(obj)
    for obj in export_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = target

    os.makedirs(os.path.dirname(output_glb), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=output_glb,
        export_format='GLB',
        use_selection=True,
        export_animations=True,
        export_animation_mode='NLA_TRACKS',
        export_nla_strips=True,
        export_force_sampling=True,
        export_skins=True,
        export_materials='EXPORT',
        export_apply=False,
    )
    if not os.path.isfile(output_glb) or os.path.getsize(output_glb) < 100000:
        raise RuntimeError("La exportación no generó un GLB válido.")
    print("\nGLB animado creado:", output_glb)
    print("No se modificó el archivo original panteraups.glb.")
    print("Pistas exportadas:", [track.name for track in target.animation_data.nla_tracks])


if __name__ == '__main__':
    try:
        main()
    except Exception:
        traceback.print_exc()
        raise
