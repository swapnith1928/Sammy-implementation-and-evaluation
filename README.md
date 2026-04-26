# Adaptive Bitrate Video Streaming with Mahimahi Network Emulation

A DASH (Dynamic Adaptive Streaming over HTTP) video player testbed using the **Big Buck Bunny (BBB)** dataset, with controlled network emulation via [Mahimahi](http://mahimahi.mit.edu/). Supports measuring ABR performance under simulated link conditions and cross-traffic (TCP/UDP neighbours).

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Repository Structure](#repository-structure)
3. [Prerequisites](#prerequisites)
4. [Installation](#installation)
5. [Video Dataset](#video-dataset)
6. [Running the Server](#running-the-server)
7. [Network Emulation with Mahimahi](#network-emulation-with-mahimahi)
8. [Cross-Traffic Experiments](#cross-traffic-experiments)
9. [HTTP Baseline Measurements](#http-baseline-measurements)
10. [Experiment Workflow](#experiment-workflow)
11. [Logs and Outputs](#logs-and-outputs)
12. [Reference](#reference)

---

## Project Overview

This testbed evaluates ABR (Adaptive Bitrate) streaming algorithms under emulated network conditions. It uses:

- **DASH.js** (or equivalent) as the client-side video player
- **Node.js** as the media/HTTP server serving DASH segments
- **Mahimahi** for reproducible link emulation (delay, bandwidth, queue discipline)
- **iperf3** to inject competing TCP or UDP cross-traffic
- **curl** for lightweight HTTP latency probes

Experiments follow the methodology described in the reference paper (see [Reference](#reference)).

---

## Repository Structure

```
.
├── build/                  # Client build output
├── dist/                   # Alternative dist output
├── server/
│   ├── build/              # Server build output
│   ├── videos/             # DASH video segments (BBB dataset)
│   └── ...                 # Server source files
├── mahimahi/               # Mahimahi helper scripts (if any)
├── 40mbps.trace            # Mahimahi uplink/downlink trace file
└── ...
```

> **Note:** `node_modules/`, `*.trace`, `*.bin`, `*.log`, and `.env` are all gitignored.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 16.x | Required for client and server |
| npm | ≥ 8.x | Package management |
| Mahimahi | latest | Network emulator — see install note |
| iperf3 | ≥ 3.x | Cross-traffic generation |
| curl | any | HTTP latency probing |

### Installing Mahimahi (Ubuntu/Debian)

```bash
sudo apt-get update
sudo apt-get install mahimahi
```

Or build from source: https://github.com/ravinet/mahimahi

---

## Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd <repo-name>

# Install client dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..
```

---

## Video Dataset

This project uses the **Big Buck Bunny (BBB)** DASH dataset. Place the DASH-segmented video files inside `server/videos/`.

**Expected structure:**

```
server/videos/
├── bbb_sunflower_<bitrate>kbps/
│   ├── init-stream<n>.m4s
│   ├── chunk-stream<n>-<seq>.m4s
│   └── ...
└── manifest.mpd
```

You can generate or download a pre-segmented BBB dataset using tools like [MP4Box](https://gpac.io/) or from public DASH dataset repositories.

---

## Running the Server

```bash
# From the project root
cd server
npm start
```

The server will listen on `http://0.0.0.0:8080` by default, serving DASH segments and the player page.

To verify the server is reachable from a Mahimahi shell:

```bash
curl -v http://10.0.0.1:8080/
```

---

## Network Emulation with Mahimahi

All experiments should be run **inside a Mahimahi emulated shell** to enforce controlled link conditions.

### Launch the emulated link

```bash
mm-delay 3 \
  mm-link 40mbps.trace 40mbps.trace \
    --uplink-queue=droptail \
    --uplink-queue-args="bytes=120000" \
    --downlink-queue=droptail \
    --downlink-queue-args="bytes=120000" \
  -- bash
```

**Parameter breakdown:**

| Parameter | Value | Description |
|---|---|---|
| `mm-delay` | `3` ms | One-way propagation delay |
| Trace file | `40mbps.trace` | Applied to both uplink and downlink |
| Queue discipline | `droptail` | Drop-tail queue (drop on overflow) |
| Queue size | `120000` bytes (~120 KB) | Buffer size for both directions |

All commands below assume you are **inside this Mahimahi shell** (`$MM_LINK_SHELL` or similar prompt).

---

## Cross-Traffic Experiments

Use **iperf3** to inject competing traffic alongside the DASH stream. The iperf3 server (`10.0.0.1:5201`) should be running on the host before entering the Mahimahi shell.

### Start iperf3 server (on host, outside Mahimahi)

```bash
iperf3 -s -p 5201
```

### TCP cross-traffic (neighbour flow)

Saturates available bandwidth with a competing TCP connection for 60 seconds:

```bash
iperf3 -c 10.0.0.1 -p 5201 -t 60
```

### UDP cross-traffic (neighbour flow)

Injects a constant-bitrate UDP flow at 1 Mbps for 60 seconds:

```bash
iperf3 -c 10.0.0.1 -p 5201 -u -b 1M -t 60
```

> Run the DASH player simultaneously in the same Mahimahi shell while the neighbour flow is active to measure ABR performance under competition.

---

## HTTP Baseline Measurements

To measure raw HTTP download latency without the player, use this probe loop (10 requests, 2-second intervals):

```bash
for i in {1..10}; do
  curl -o /dev/null -s -w "Request $i: %{time_total}s\n" \
    http://10.0.0.1:8080/dummy.bin
  sleep 2
done
```

This is useful as a **sanity check** to confirm:
- The Mahimahi delay (`mm-delay 3`) is visible in round-trip times
- The server is reachable and serving correctly before starting video experiments

---

## Experiment Workflow

A typical experiment follows this sequence:

```
1. Start iperf3 server on host (if using cross-traffic)
         │
         ▼
2. Enter Mahimahi shell
   mm-delay 3 mm-link 40mbps.trace 40mbps.trace \
     --uplink-queue=droptail --uplink-queue-args="bytes=120000" \
     --downlink-queue=droptail --downlink-queue-args="bytes=120000" -- bash
         │
         ▼
3. (Optional) Start neighbour flow
   iperf3 -c 10.0.0.1 -p 5201 -t 60          ← TCP
   iperf3 -c 10.0.0.1 -p 5201 -u -b 1M -t 60  ← UDP
         │
         ▼
4. Open the DASH player
   Visit http://10.0.0.1:8080 in a browser inside the shell,
   OR run automated playback via a headless browser/script
         │
         ▼
5. Collect logs and results
   - Mahimahi link logs (*.log)
   - Player QoE metrics (bitrate, rebuffering, switches)
```

---

## Logs and Outputs

| File/Pattern | Description |
|---|---|
| `*.log` | Mahimahi link logs, server logs, iperf3 output |
| `*.trace` | Mahimahi network trace files |
| `*.bin` | Binary experiment outputs (e.g., dummy download targets) |

All of the above are gitignored. Store experiment results in a separate `results/` directory or archive them manually.

---

## Reference

This testbed is implemented based on the methodology described in the attached reference paper on adaptive bitrate streaming. Key design decisions (queue sizing, trace format, BBB segmentation parameters) follow the experimental setup outlined therein.

---

## Notes

- The Mahimahi inner IP for the host is always `10.0.0.1` — use this as the server address from inside the shell.
- Ensure `dummy.bin` exists at `server/videos/` or the server root if using the curl probe loop.
- For reproducible results, always specify the same `--uplink-queue-args` and `--downlink-queue-args` across runs.
- Cross-traffic and DASH playback should start as close in time as possible for competition experiments.
