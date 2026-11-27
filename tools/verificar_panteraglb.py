#!/usr/bin/env python3
"""Verifica que el GLB combinado conserve los clips requeridos de Vigía."""
import json
import pathlib
import struct
import sys

REQUIRED = {
    'Vigia_IdleOriginal',
    'Vigia_Talking',
    'Vigia_Waving',
    'Vigia_HeadShake',
    'Vigia_ThumbsUp',
    'Vigia_Charge',
    'Vigia_IdleBriefcase',
}


def main() -> int:
    if len(sys.argv) != 2:
        print('Uso: python verificar_panteraglb.py RUTA/panteraups_animada.glb')
        return 2
    path = pathlib.Path(sys.argv[1])
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b'glTF':
        raise ValueError('El archivo no parece ser un GLB válido.')
    version, total_length = struct.unpack_from('<II', data, 4)
    if version != 2 or total_length != len(data):
        raise ValueError('Cabecera GLB inválida o incompleta.')
    json_length, json_type = struct.unpack_from('<II', data, 12)
    if json_type != 0x4E4F534A:
        raise ValueError('El primer bloque del GLB no es JSON.')
    doc = json.loads(data[20:20 + json_length].decode('utf-8').rstrip('\x00 '))
    names = {animation.get('name', '') for animation in doc.get('animations', [])}
    missing = sorted(REQUIRED - names)
    print('Animaciones encontradas:')
    for name in sorted(names):
        print(' -', name)
    if missing:
        print('\nFaltan clips requeridos:', ', '.join(missing))
        return 1
    print('\nGLB animado verificado correctamente.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
