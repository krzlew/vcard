---
layout: layouts/post.njk
pageNumber: P203
extensionText: "203: LOCAL MOE ON APPLE SILICON"
title: Running a Local MoE Model for Claude Code and VS Code
number: 203
date: 2026-09-15
tags: [AI, MLX, LOCAL-LLM, CLAUDE-CODE]
summary: Running Claude Code and VS Code against the same local MLX MoE model using Rapid-MLX's native Anthropic and OpenAI-compatible APIs
permalink: /blog/local-moe-mlx/
---
## THE SETUP

I wanted one local model on my Mac (M2 Pro, 32 GB unified memory) to power both **Claude Code** and AI tools inside **VS Code**, without sending code to an external API.

The setup that finally worked: Qwen3.6 runs behind Rapid-MLX, which serves Claude Code over its native Anthropic `/v1/messages` API and Continue/Roo Code over its OpenAI `/v1` API from the same process. No LiteLLM proxy, no translation layer.

My current model is `mlx-community/Qwen3.6-35B-A3B-4bit`: a 35B Mixture-of-Experts model using roughly 20 GB of memory at 4-bit quantization, while activating only a fraction of its expert parameters for each token. That makes it a particularly good fit for Apple Silicon with 32 GB of unified memory.

## WHY MOE?

Apple Silicon inference is often constrained by memory bandwidth. The M2 Pro has up to roughly 200 GB/s of theoretical unified-memory bandwidth, so repeatedly moving model weights becomes expensive.

Dense models use essentially the whole model for every generated token. Mixture-of-Experts models instead route each token through only a subset of their expert layers, so an MoE model can have a relatively large total parameter count while keeping the amount of active computation much smaller.

For my machine, the interesting options were:

* `Qwen3.6-35B-A3B-4bit` - best overall balance for agentic work
* `DeepSeek-Coder-V2-Lite-Instruct-4bit-mlx` - much lighter and faster
* `gemma-4-26b-a4b-it-4bit` - another MoE alternative

Benchmarks are further below.

## WHAT DIDN'T WORK

My first setup routed Claude Code through LiteLLM to `mlx_lm.server`. Claude Code expects Anthropic's `/v1/messages` API, while `mlx_lm.server` exposes an OpenAI-compatible `/v1/chat/completions` endpoint, so LiteLLM had to translate between them.

It worked badly enough that I wouldn't recommend it. Anthropic-specific request handling created friction, and tool calling with Qwen3.6 was unreliable in my setup.

I then tried replacing Claude Code with OpenCode, expecting its OpenAI-compatible provider to remove the translation problem completely. That failed too: OpenCode 1.18.30 consistently crashed on this machine with `TypeError: undefined is not an object (evaluating 'a.name')`, inside `SystemPrompt.environment`. The crash reproduced against multiple backends, so I stopped debugging it as an MLX problem.

The fix was to keep Claude Code and replace the server.

## RAPID-MLX

[`rapid-mlx`](https://pypi.org/project/rapid-mlx/) exposes an OpenAI-compatible endpoint and a native Anthropic-compatible `/v1/messages` endpoint from the same server, so Claude Code can talk to it directly.

It also supports model-specific tool-call parsing. For Qwen3.6, Rapid-MLX automatically selects the `qwen3_coder_xml` parser. That's what removes LiteLLM entirely - Claude Code talks straight to Rapid-MLX, which talks straight to Qwen3.6.

I verified this with an actual multi-step Claude Code tool call: create a file, read it back, and confirm its contents.

## SETUP

### 1. Install Rapid-MLX

```bash
python3 -m venv ~/mlx-env
source ~/mlx-env/bin/activate

pip install rapid-mlx
```

Claude Code and your VS Code AI extension are assumed to already be installed.

### 2. Start the server

```bash
rapid-mlx serve mlx-community/Qwen3.6-35B-A3B-4bit --port 8090
```

Rapid-MLX prints both endpoints on startup - the OpenAI-compatible one at `http://127.0.0.1:8090/v1`, and the Anthropic-compatible one at the server root, `http://127.0.0.1:8090`.

Verify it:

```bash
curl http://localhost:8090/v1/models
```

## CLAUDE CODE

Point Claude Code directly at the Anthropic-compatible endpoint:

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:8090"
export ANTHROPIC_API_KEY="sk-noop"
export ANTHROPIC_MODEL="mlx-community/Qwen3.6-35B-A3B-4bit"

claude
```

No proxy or special command-line flags are required for normal use.

Rapid-MLX can also configure Claude Code automatically:

```bash
rapid-mlx agents claude-code --setup
```

This writes the required configuration to `~/.claude/settings.json` after showing the changes and asking for confirmation.

Claude Code may warn that it doesn't recognize the model name. In my setup this only affects assumptions such as the context window used by auto-compaction; it does not prevent the model from working.

## VS CODE

The same server can simultaneously expose its OpenAI-compatible API to VS Code extensions.

### Continue

Add this to `~/.continue/config.yaml`:

```yaml
models:
  - name: Local Qwen MoE
    provider: openai
    model: mlx-community/Qwen3.6-35B-A3B-4bit
    apiBase: http://localhost:8090/v1
    apiKey: dummy

tabAutocompleteModel:
  title: Local Qwen MoE Autocomplete
  provider: openai
  model: mlx-community/Qwen3.6-35B-A3B-4bit
  apiBase: http://localhost:8090/v1
  apiKey: dummy
```

### Roo Code

Set Provider to "OpenAI Compatible", Base URL to `http://localhost:8090/v1`, API Key to `dummy`, and Model ID to `mlx-community/Qwen3.6-35B-A3B-4bit`.

Both clients can use the same running model as Claude Code.

## VERIFY TOOL CALLING

A normal chat response proves very little. For an agentic coding setup, test actual tools:

```bash
ANTHROPIC_BASE_URL="http://127.0.0.1:8090" \
ANTHROPIC_API_KEY="sk-noop" \
ANTHROPIC_MODEL="mlx-community/Qwen3.6-35B-A3B-4bit" \
claude -p "create a file named hello.txt containing 'local moe works', then read it back to confirm" \
  --tools "Bash,Write,Read" \
  --dangerously-skip-permissions
```

This created `hello.txt`, read it back, and confirmed its contents - real structured tool calls, not the model just describing what it would do.

### MCP caveat

A large Claude Code configuration can expose more than 100 tools through MCP servers such as Playwright, Chrome DevTools or Vercel. I hit `400` validation errors when one generated MCP tool name exceeded Rapid-MLX's 64-character tool-name limit. For isolated testing, `--strict-mcp-config --tools "Bash,Write,Read"` restricts the available tools and avoids the problem.

## BENCHMARKS

`mlx-lm` prints prompt and generation throughput, so a simple generation command is enough for a rough comparison:

```bash
mlx_lm.generate \
  --model mlx-community/Qwen3.6-35B-A3B-4bit \
  --prompt "Write a Python function that reverses a linked list, with tests." \
  --max-tokens 256
```

All tests below used the same prompt and a 256-token limit on my Mac:

* `DeepSeek-Coder-V2-Lite-Instruct-4bit-mlx` - 84.58 tok/s generation, 92.58 tok/s prompt, 9.03 GB peak memory
* `Qwen3.6-35B-A3B-4bit` - 61.95 tok/s generation, 7.61 tok/s prompt, 19.66 GB peak memory
* `gemma-4-26b-a4b-it-4bit` - 53.22 tok/s generation, 14.71 tok/s prompt, 14.36 GB peak memory

DeepSeek-Coder-V2-Lite is clearly the fastest and lightest of the three. Qwen3.6-35B-A3B remains my preferred model for larger agentic tasks and multi-step tool use - the extra memory usage and lower throughput are worth it once the task goes beyond straightforward code completion.

## PRACTICAL NOTES

On a 32 GB Mac, context size matters almost as much as model size. Large codebases and long agent sessions can push memory pressure high enough to trigger swapping. If that happens, reduce the KV-cache size, shorten the active context, or switch to the smaller DeepSeek-Coder-V2-Lite model.

For coding work I also tend to keep temperature low, usually around `0.0`-`0.2`.

I prefer native MLX model conversions from `mlx-community` and similar repositories rather than running GGUF through a separate runtime. With this setup, the entire inference stack stays inside MLX and uses Apple Silicon's unified memory directly.

## CONCLUSION

The API layer mattered more than the model. `mlx_lm.server` handles basic OpenAI-compatible inference fine, but Claude Code needs a working Anthropic-compatible API with structured tool calls - Rapid-MLX is the piece that provides both, with no translation layer in between.
