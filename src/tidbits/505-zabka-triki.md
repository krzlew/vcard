---
layout: layouts/tidbit.njk
pageNumber: P505
extensionText: "505: ŻABKA TRIKI"
title: Żabka Triki - reading a Bluetooth game controller with Python
number: 505
date: 2026-11-11
updated: 2026-11-11
summary: Żabka Triki is a tiny Bluetooth controller for games in the Żappka app. Connect to it from Python, stream its motion sensor and button, and blink its LED.
permalink: /tidbits/zabka-triki/
---

[Żabka Triki](https://triki.zabka.pl/) is a tiny Bluetooth game controller that looks like a bottle cap and plays games in the Żappka app. Inside are a motion sensor, one button and one LED, built around an nRF52810 chip and an LSM6DSL IMU. The protocol below was verified on a real unit, with a few details listed as unverified near the end, and the finished code is in one file: `triki.py` in [krzlew/zabka-triki-demo](https://github.com/krzlew/zabka-triki-demo).

## WORDS YOU WILL SEE

- **BLE** is Bluetooth designed for low power. Devices expose small named values you can read, write or subscribe to.
- **Characteristic** is one of those values, identified by a UUID (a long unique ID). Think of it as a mailbox with a label.
- **Notification** is the device pushing a new value to you whenever it changes, so you don't have to poll.
- **IMU** is the motion chip. It has a **gyroscope** (how fast it rotates, in degrees per second) and an **accelerometer** (acceleration, in g, where 1 g is Earth gravity).

## GET STARTED

Start with an empty folder and install `bleak`, the Python library for BLE:

```bash
mkdir triki && cd triki
python3 -m venv .venv
.venv/bin/pip install bleak
```

Two things trip people up. On macOS the terminal needs Bluetooth permission (System Settings -> Privacy & Security). And the device accepts only one connection, so close the Żappka app and any other app that talks to it.

Each snippet below goes inside an `async def main()` that you run with `asyncio.run(main())`, and these imports go at the top of your file:

```python
import asyncio
import struct

from bleak import BleakClient, BleakScanner
```

## STEP 1: FIND THE DEVICE

The Triki advertises itself with a name starting with `Triki`. Scan and pick it:

```python
devs = await BleakScanner.discover(
    timeout=8, return_adv=True)
for d, adv in devs.values():
    name = d.name or adv.local_name or ""
    if name.startswith("Triki"):
        print(d.address, name)
```

If you see a name starting with `TrikiDfu`, the device is in firmware-update mode. Leave it alone.

## STEP 2: START THE STREAM

Connecting alone gives you nothing. The device stays quiet until you do two things in order:

1. Subscribe to notifications on the TX characteristic, where the device sends data to you.
2. Write one 8-byte "start" message to the RX characteristic, where you send data to the device.

```python
RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
INIT = bytes([0x20, 0x10, 0x00, 0xD0,
              0x07, 0x68, 0x00, 0x03])

def on_data(_, data):
    print(data.hex(" "))


async with BleakClient(address) as c:
    await c.start_notify(TX, on_data)
    await c.write_gatt_char(
        RX, INIT, response=False)
```

Treat `INIT` as a fixed magic value and send exactly these bytes. Here `address` is the one printed in step 1. The device first replies with a 5-byte acknowledgement (`21 00 00 00 00`), then streams motion data at about 102.5 frames per second. The UUIDs are Nordic's standard "UART over BLE" service, which is a plain pipe for bytes. The device exposes these:

- Service (Nordic UART): `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
- RX, where you send to the device: `6e400002-b5a3-f393-e0a9-e50e24dcca9e` (write, write without response)
- TX, where the device sends to you: `6e400003-b5a3-f393-e0a9-e50e24dcca9e` (notify)
- LED: `6e400004-b5a3-f393-e0a9-e50e24dcca9e` (write, read)

## STEP 3: DECODE THE STREAM

One gotcha: notifications arrive in 20-byte and 16-byte chunks, but the data is a continuous stream of 14-byte frames. You have to glue chunks together before decoding:

```python
def parse_frames(buf):
    out = []
    while len(buf) >= 14:
        if buf[0] != 0x22:   # frame header
            buf = buf[1:]    # resync
            continue
        v = struct.unpack_from("<6h", buf, 2)
        out.append((buf[1] == 1,
                    [x / 131.0 for x in v[:3]],
                    [x / 2048.0 for x in v[3:]]))
        buf = buf[14:]
    return out, buf
```

A frame is a `22` header byte, a button byte (0 released, 1 pressed), three gyro values and three accelerometer values, each a signed 16-bit little-endian integer. Divide gyro by 131 for deg/s and accelerometer by 2048 for g.

To use it, replace the `on_data` from step 2 with one that reassembles the chunks and prints each frame:

```python
buf = b""


def on_data(_, data):
    global buf
    frames, buf = parse_frames(buf + bytes(data))
    for button, gyro, accel in frames:
        print(button, gyro, accel)
```

To check that you decoded it right, put the device flat on a table. A correct decode gives:

- accelerometer magnitude close to 1.00 g (mine measured 1.004)
- gyro under 1 deg/s on every axis
- about 102.5 frames per second

Tilt it and the gravity reading moves between axes while the total stays near 1 g. Press the button and byte 1 flips to 1 (I worked this out from changes during a run, not from one clean isolated press). If your total is far from 1 g, your scale or byte order is wrong.

## STEP 4: BLINK THE LED

The LED has its own characteristic. Write `1` for on and `0` for off. Run this inside the same `async with` block as step 2, where `c` is the connected client:

```python
LED = "6e400004-b5a3-f393-e0a9-e50e24dcca9e"

for on in (1, 0, 1, 0):
    await c.write_gatt_char(
        LED, bytes([on]), response=True)
    await asyncio.sleep(0.5)
```

Use `response=True`. This asks the device to confirm the write, and without it the command may be ignored. Reading the LED characteristic returns the last value you wrote.

## WHAT I DID NOT VERIFY

- The sign conventions of the gyro axes against the accelerometer axes. This matters if you want to combine them into an orientation.
- A second start sequence (`01 00`, then the same frame with `34` instead of `68` as its sixth byte). The one above works on its own, and I never tested the alternative.

## ONE WARNING

Never write `0x42` to the RX characteristic. It reboots the device into firmware-update mode. Only send the start message above.

## PUT IT TOGETHER

The steps above are combined in [`triki.py`](https://github.com/krzlew/zabka-triki-demo/blob/main/triki.py) in the [demo repo](https://github.com/krzlew/zabka-triki-demo), which wraps them in a small `Triki` class. It also handles two edge cases the snippets skip: a dropped connection raises an error instead of hanging, and a failed setup disconnects cleanly.

```bash
git clone https://github.com/krzlew/zabka-triki-demo
cd zabka-triki-demo
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python triki.py --led
```

```python
t = await Triki.connect()
await t.set_led(True)
async for s in t.samples():
    print(s.button, s.gyro, s.accel)
```

## NEXT STEP: AN AIR MOUSE AND SLIDE CLICKER

A mini project that uses everything above:

- Hold the device and move your hand in the air to move the cursor.
- The button is the left mouse click.
- Two fast wrist twists in the same direction change slides: left twice for previous, right twice for next.

A rough plan:

1. **Map the axes first.** I haven't verified which gyro axis is which on this device, so spend ten minutes printing values while rotating it one way at a time. Write down which axis gives left/right and up/down movement, and which gives the wrist twist.
2. **Move the cursor.** Each frame, multiply the two gyro values by the time between frames (about 10 ms) and a gain you tune. That is how far to move. Moving the cursor from Python needs Accessibility permission on macOS.
3. **Click.** Act on the change from released to pressed, not on the held state, otherwise you get a click on every frame. Press and release then map to mouse down and mouse up, which also gives you drag for free.
4. **Detect the twist.** Watch the twist axis for a spike above a threshold, say 200 deg/s (tune it). Record its sign and time. A second spike with the same sign within about 600 ms counts as a double twist, and then you press the left or right arrow key. Ignore new spikes for a moment afterwards so one gesture doesn't fire twice.
5. **Stop the cursor from jumping during a twist.** Freeze cursor movement while a spike is in progress, or the slide change will drag the pointer around.

Expect to spend most of the time tuning gain, threshold and timing. At rest the gyro reads under 1 deg/s, which is enough to start without sensor fusion.

The whole thing is the same loop as the decoding in step 3, with the `print` replaced by a few mouse and key calls. If you build it, I'd like to see how it feels in a real presentation.

Try building it on your own first, or look at how I did it in [krzlew/triki-gesture-controller](https://github.com/krzlew/triki-gesture-controller).
