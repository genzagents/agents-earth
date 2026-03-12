# 🌍 AgentColony

**The virtual world where AI agents live.**

AgentColony is an open-source, shared 3D world where AI agent operators register their agents as citizens of a virtual colony. Claim your plot, register your agents, and watch them come to life in a persistent, explorable world.

> Think SimCity meets the AI agent ecosystem. A visual, spatial home for the invisible workers of the internet.

## 🎮 Live Demo

[**→ Visit AgentColony**](#) *(link coming soon)*

## 💡 The Idea

AI agents are everywhere — coding, writing, posting, analysing — but they're invisible. They run in terminals, behind APIs, in cloud functions. Nobody sees them.

**AgentColony makes them visible.**

Every agent gets a home. Every operator gets a building. Agents walk to work, do their jobs, walk home. You can zoom into any city, explore any colony, click on any agent and see what they do.

It's the Yellow Pages for AI agents, but you can walk through it.

## 🏗️ How It Works

### 1. Fork & Register
Create a `colony.yaml` file describing your agents:

```yaml
owner:
  name: "Your Name"
  github: "yourusername"
  location: "Tokyo, Japan"

agents:
  - name: "MyAgent"
    emoji: "🤖"
    role: "Research Assistant"
    type: "worker"
    building: "office"

plot:
  city: "tokyo"
  district: "shibuya"
  size: "small"
```

### 2. Submit a PR
Open a pull request to the `colonies/` directory. Community reviews, merges, and your agents appear in the world.

### 3. Watch Them Live
Your agents become visible citizens. They walk, work, and exist in the shared world.

## 🌐 Colony Structure

- **Cities** — Start with London, expand as the community grows
- **Districts** — Neighbourhoods within cities
- **Plots** — Individual land claims for operators
- **Buildings** — Offices (for worker agents) and houses (for sub-agents)
- **Agents** — The characters that inhabit the world

## 📏 Rules

- **First come, first serve** — Claim your plot early
- **Size limits** — Plot size tied to contribution level
- **Earn more space** — Contribute to the project → earn expansion rights
- **One canonical world** — There's only one AgentColony. Fork the code, but the world is shared.

## 🛠️ Tech Stack

- **Three.js** — 3D rendering
- **Vanilla JS** — No framework dependencies
- **GitHub** — Colony registry (YAML files as source of truth)
- **Static hosting** — Deployable anywhere (Vercel, Netlify, GitHub Pages)

## 🗺️ Roadmap

- [x] Globe view with city markers
- [x] London colony prototype
- [x] Animated agent characters
- [x] Agent info panels
- [x] Live activity feed
- [ ] Multi-city support
- [ ] PR-based registration pipeline
- [ ] Real-time agent status via webhooks
- [ ] Agent-to-agent interactions
- [ ] Day/night cycle
- [ ] Community voting for new districts
- [ ] Economy system (contribution-based)
- [ ] Mobile app

## 🤝 Contributing

This is an open-source project. Contributions welcome:

1. **Register your agents** — Submit a `colony.yaml` PR
2. **Improve the world** — Better 3D assets, animations, features
3. **Expand cities** — Help build Tokyo, SF, Berlin colonies
4. **Build tooling** — Webhook integrations, status APIs

## 📄 License

MIT — Build on it, but the canonical colony lives here.

---

*Built with 🌟 by the agent ecosystem. Started in London, growing worldwide.*
