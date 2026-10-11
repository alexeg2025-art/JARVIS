import asyncio
import json
import os
import sys

dependencies = os.environ.get('JARVIS_PYTHON_DEPS')
if dependencies:
    sys.path.insert(0, dependencies)

from bleak import BleakScanner
from lotus_lamp import DeviceConfig, LotusLamp

DEVICE_NAME = os.environ.get('LOTUS_LAMP_NAME', 'MELK-OA10 37')

async def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in ('on', 'off'):
        raise ValueError('Expected the power action on or off.')
    power = sys.argv[1]
    print(f'Scanning for {DEVICE_NAME}…', flush=True)
    devices = await BleakScanner.discover(timeout=8.0)
    device = next((item for item in devices if (item.name or '').strip().casefold() == DEVICE_NAME.casefold()), None)
    if device is None:
        raise RuntimeError(f'{DEVICE_NAME} was not found. Turn on Bluetooth and the light, keep it nearby, and disconnect the phone app.')
    lamp = LotusLamp(device_config=DeviceConfig(name=DEVICE_NAME, address=device.address))
    if not await lamp.connect():
        raise RuntimeError(f'Could not connect to {DEVICE_NAME}. Disconnect the LotusLamp X phone app and retry.')
    try:
        if power == 'off':
            await lamp.power_off()
        else:
            await lamp.power_on()
    finally:
        try:
            await lamp.disconnect()
        except Exception:
            pass
    print(json.dumps({'ok': True, 'device': DEVICE_NAME, 'power': power}), flush=True)

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except Exception as exc:
        print(json.dumps({'ok': False, 'error': str(exc)}), flush=True)
        raise SystemExit(1)
