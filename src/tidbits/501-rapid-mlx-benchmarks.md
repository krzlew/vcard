---
layout: layouts/tidbit.njk
pageNumber: P501
extensionText: "501: RAPID-MLX BENCHMARKS"
title: rapid-mlx Benchmarks on an M2 Pro
number: 501
date: 2026-09-16
updated: 2026-09-16
summary: Text and image/video generation throughput on an M2 Pro (32 GB), via the rapid-mlx community benchmark - 29 models tested.
permalink: /tidbits/rapid-mlx-benchmarks/
---
I ran a set of [rapid-mlx](https://rapidmlx.com/) Community Benchmark tests on an **Apple M2 Pro with 32 GB unified memory, 12 CPU cores and 19 GPU cores**, running macOS 26.5.2 - same box behind my [local MoE setup](/blog/local-moe-mlx/). Text-generation runs used rapid-mlx 0.14.2 with GPU prefill, no speculative decoding, AC power, nominal thermal state and normal memory pressure.

The benchmark uses two workloads:

- **512 prompt tokens -> 128 generated tokens**
- **2048 prompt tokens -> 512 generated tokens**

The most useful metrics here are decode throughput, time to first token (TTFT), and peak memory use.

## TEXT GENERATION RESULTS

| Model | Peak RAM | 512->128<br>tok/s | 512->128<br>TTFT (s) | 2048->512<br>tok/s | 2048->512<br>TTFT (s) |
|:---|---:|---:|---:|---:|---:|
| Qwen3-0.6B 4-bit | 2.2 GB | 260.8 | 0.18 | 203.3 | 0.68 |
| LFM2.5-1.2B-Instruct 4-bit | 1.8 GB | 206.5 | 0.32 | 197.9 | 1.18 |
| Ternary-Bonsai 1.7B 2-bit | 2.6 GB | 192.2 | 0.32 | 156.4 | 1.26 |
| LFM2.5 8B-A1B 4-bit | 5.5 GB | 125.6 | 0.54 | 120.8 | 1.90 |
| LFM2.5 2.6B | 2.8 GB | 93.7 | 0.72 | 90.6 | 2.76 |
| Llama 3.2 3B-Instruct 4-bit | 4.2 GB | 86.3 | 0.60 | 75.3 | 2.43 |
| Nemotron 3.5 Lightning 30B-A3B 4-bit | 19.9 GB | 65.1 | 1.30 | 63.4 | 4.48 |
| Gemma 3 4B-it QAT 4-bit | 4.3 GB | 63.8 | 0.99 | 62.5 | 3.93 |
| Qwen3-4B-Thinking-2507 4-bit | 5.4 GB | 63.7 | 1.08 | 57.2 | 4.39 |
| Qwen3.6 35B-A3B MXFP4 | 19.4 GB | 63.3 | 1.18 | 61.3 | 4.04 |
| Qwen3.5 4B 4-bit | 4.5 GB | 62.6 | 1.09 | 61.0 | 4.29 |
| Qwen3.6 35B-A3B NVFP4 | 20.4 GB | 62.4 | 1.17 | 60.2 | 3.99 |
| Qwen3.6 35B-A3B 4-bit | 20.4 GB | 61.8 | 1.12 | 60.2 | 3.83 |
| Qwen3-4B-Instruct-2507 4-bit | 6.3 GB | 60.2 | 1.11 | 57.3 | 4.42 |
| Ternary-Bonsai 8B 2-bit | 5.4 GB | 59.7 | 1.47 | 54.6 | 5.85 |
| Gemma 4 E4B-it 4-bit | 5.2 GB | 52.6 | 0.71 | 51.0 | 2.79 |
| GPT-OSS 20B MXFP4-Q8 | 12.5 GB | 52.3 | 1.24 | 49.4 | 4.59 |
| Qwen3.6 35B-A3B DWQ | 21.4 GB | 47.0 | 1.13 | 45.8 | 3.86 |
| Qwen3-8B 4-bit | 7.4 GB | 37.4 | 2.00 | 35.1 | 7.99 |
| DeepSeek-R1-0528-Qwen3-8B 4-bit | 7.5 GB | 37.4 | 2.01 | 35.1 | 8.00 |
| Qwen3.5 9B 4-bit | 6.9 GB | 36.6 | 2.01 | 35.7 | 7.85 |
| Qwen3.5 9B 6-bit | 8.8 GB | 25.0 | 2.18 | 24.4 | 8.37 |
| Gemma 4 12B-it 4-bit | 7.7 GB | 23.3 | 3.18 | 21.7 | 13.15 |
| Qwen3.5 9B 8-bit | 10.8 GB | 20.3 | 2.06 | 20.0 | 7.98 |
| Ternary-Bonsai 27B 2-bit | 11.0 GB | 19.4 | 5.18 | 18.9 | 20.10 |
| Devstral Small 2 24B 4-bit | 17.5 GB | 12.7 | 6.31 | 12.4 | 24.68 |
| Qwen3.6 27B 4-bit | 18.1 GB | 11.5 | 7.11 | 11.3 | 27.89 |
| Qwen3.5 27B 4-bit | 18.1 GB | 11.3 | 7.22 | 11.1 | 28.37 |
| Qwen3.5 27B 6-bit | 24.4 GB | 7.8 | 7.63 | 8.1 | 28.74 |

Qwen3-0.6B and LFM2.5-1.2B post the highest raw numbers, but at that size speed is trivial - there's almost nothing to compute. LFM2.5-8B-A1B is the real standout: ~125 tok/s at only ~5.5 GB, more than double the throughput of any other model above 5B active parameters.

## MOE VS DENSE

Qwen3.6 27B 4-bit (dense) reaches 11.5 tok/s and needs 18.1 GB. Qwen3.6 35B-A3B 4-bit (MoE, more total parameters) reaches 61.8 tok/s at 20.4 GB - over 5x faster, because only a small slice of the model activates per token.

Nemotron 3.5 Lightning 30B-A3B (~65 tok/s, under 20 GB) and LFM2.5 8B-A1B (~125 tok/s, ~5.5 GB) show the same thing. On a 32 GB M2 Pro, a medium MoE model beats a similarly sized dense one whenever interactive speed matters.

## QUANTIZATION HITS THROUGHPUT HARD

Qwen3.5 9B, same model, three quant levels:

| Quantization | RAM | Decode |
|:---|---:|---:|
| 4-bit | 6.9 GB | 36.6 tok/s |
| 6-bit | 8.8 GB | 25.0 tok/s |
| 8-bit | 10.8 GB | 20.3 tok/s |

4-bit to 6-bit: +28% memory, -32% throughput. 4-bit to 8-bit: +57% memory, -45% throughput. Same pattern at 27B - Qwen3.5 27B goes from 11.3 tok/s at 4-bit to 7.8 tok/s at 6-bit, memory from 18.1 GB to 24.4 GB. On Apple Silicon, lower-bit quantization isn't just smaller, it's faster too, which tracks with memory bandwidth being the bottleneck during decode.

Four quant variants of Qwen3.6 35B-A3B all fit in 32 GB:

| Variant | RAM | 512->128 | 2048->512 |
|:---|---:|---:|---:|
| MXFP4 | 19.4 GB | 63.3 | 61.3 |
| NVFP4 | 20.4 GB | 62.4 | 60.2 |
| standard 4-bit | 20.4 GB | 61.8 | 60.2 |
| DWQ | 21.4 GB | 47.0 | 45.8 |

MXFP4 wins on both throughput and memory. NVFP4 and standard 4-bit land in the same class, 60-62 tok/s. DWQ trails at ~47 tok/s despite using more memory. This says nothing about output quality - speed and memory only.

## LONG PROMPTS HIT TTFT, NOT DECODE SPEED

512 to 2048 prompt tokens barely touches steady-state generation - typically a 2-5% drop:

- LFM2.5 8B-A1B: 125.6 -> 120.8 tok/s
- Nemotron 30B-A3B: 65.1 -> 63.4 tok/s
- Qwen3.6 35B-A3B MXFP4: 63.3 -> 61.3 tok/s
- Gemma 4 E4B: 52.6 -> 51.0 tok/s

Time to first token is what moves, since 4x the input has to get processed before decode starts. Qwen3.6 35B-A3B 4-bit goes from ~1.1s TTFT at 512 tokens to ~3.8s at 2048, while decode rate barely shifts. For coding agents, prompt processing can end up mattering more than generation speed once context grows.

## IMAGE AND VIDEO GENERATION

Three non-LLM workloads, for reference:

| Model | Workload | Time |
|:---|:---|---:|
| Z-Image Turbo 4-bit | 1024x1024 image | 323 s / 5m 23s |
| FLUX.2 Klein 4B 4-bit | 1024x1024 image | 414 s / 6m 54s |
| Wan2.2 TI2V 5B Q8 | 832x480, 81 frames | 1384 s / 23m 04s |

Both image runs hit macOS's "memory pressure: warning" state, so take those two numbers with a grain of salt. Wan2.2's video run stayed under normal memory pressure and nominal thermal state throughout.

For this machine, the sweet spot is 4-bit/FP4 MoE models with roughly 1-3B active parameters and under ~20-21 GB total - enough headroom for macOS and other apps while still pulling 60-120+ tok/s.

## SHARING RESULTS

rapid-mlx has a public leaderboard where contributors can submit and compare runs. Mine are up under contributor tag `easy-granite-tortoise-1a3`:

- [My contributor profile](https://rapidmlx.com/leaderboard/contributors/easy-granite-tortoise-1a3)
- [Raw submissions (JSON API)](https://rapidmlx.com/api/benchmarks/atomic/contributors/easy-granite-tortoise-1a3)
