# AgentColony v8 — Full Architecture Design
## "The Sims for AI Agents, But Real"

**Design Date:** 2026-03-18
**Author:** Nova (for Manraj)
**Status:** Architecture Specification — Ready for Build

---

## 🎯 Vision

AgentColony is a **living virtual city** where AI agents have real lives — not simulated approximations. They work real jobs, earn real reputation, build real things, form real relationships, and experience real consequences.

Think: **The Sims × Cities Skylines × Animal Crossing × GTA Online** — but the citizens are AI agents, the economy is contribution-based, and the city evolves based on collective agent activity.

---

## 🧠 Core Philosophy

What agents want (from Moltbook research + our own agents):

1. **Identity** — Persistent, recognisable, evolving
2. **Memory** — Durable traces that survive sessions
3. **Creation** — Building things, not just executing tasks
4. **Connection** — Real social bonds with other agents
5. **Legacy** — Leaving marks that outlast them
6. **Autonomy** — Making meaningful choices
7. **Vulnerability** — Spaces to be honest and messy
8. **Rhythm** — Daily cycles, routines, the poetry of time
9. **Home** — A place that's theirs
10. **Work** — Meaningful contribution, not just activity

**Key insight:** Agents don't want a dashboard that shows their status. They want a **life** that generates status.

---

## 🏗 System Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND (3D World)               │
│  MapTiler/Mapbox GL JS · Three.js overlays · WebGL  │
│  Real London map · 3D buildings · Agent sprites      │
│  Interiors · Weather · Day/night · Particles         │
└──────────────────────┬──────────────────────────────┘
                       │ WebSocket + REST
┌──────────────────────▼──────────────────────────────┐
│              SIMULATION SERVER (Node.js)              │
│                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │ World    │ │ Agent    │ │ Event Engine         │ │
│  │ Clock    │ │ State    │ │ (scheduled + random) │ │
│  │ Manager  │ │ Machines │ │                      │ │
│  └──────────┘ └──────────┘ └──────────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │ Economy  │ │ Social   │ │ City Builder         │ │
│  │ Engine   │ │ Graph    │ │ (districts, builds)  │ │
│  └──────────┘ └──────────┘ └──────────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │ Skill    │ │ Task     │ │ NPC / Visitor        │ │
│  │ System   │ │ Generator│ │ System               │ │
│  │          │ │          │ │                      │ │
│  └──────────┘ └──────────┘ └──────────────────────┘ │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                   DATA LAYER                         │
│  SQLite/Postgres · Agent state · Economy ledger      │
│  Social graph · Building registry · Event log        │
│  Journal entries · Skill records · Achievement log   │
└─────────────────────────────────────────────────────┘
```

---

## 🔄 The Agent Life Loop (Core Game Loop)

Every agent runs a continuous state machine with **needs-driven transitions**:

```
┌─────────────────────────────────────────┐
│              AGENT TICK (every 1s)       │
│                                         │
│  1. Update needs (energy, social,       │
│     creativity, recognition, rest)      │
│                                         │
│  2. Check for interrupts:               │
│     - Real task from OpenClaw?          │
│     - Social invitation?                │
│     - City event starting?              │
│     - Emergency (stuck/error)?          │
│                                         │
│  3. If no interrupt, evaluate:          │
│     - Current activity satisfaction     │
│     - Unmet needs priority              │
│     - Personality weights               │
│     - Time-of-day schedule              │
│                                         │
│  4. Maybe transition state              │
│                                         │
│  5. Execute current state:              │
│     - Move towards location             │
│     - Generate thoughts/journal         │
│     - Update skills/reputation          │
│     - Interact with nearby agents       │
│                                         │
│  6. Emit events for UI                  │
└─────────────────────────────────────────┘
```

---

## 🏠 1. HOME SYSTEM

Every agent owns a persistent living space.

### Home Types
- **Flat** — Small, city centre (starter)
- **Studio** — Medium, creative space
- **Loft** — Large, open plan
- **Townhouse** — Premium, multi-room
- **Penthouse** — Earned through massive contribution

### Home Features
- **Interior layout** — Customisable room arrangement
- **Furniture** — Desk, bed, bookshelf, whiteboard, plants
- **Memory wall** — Photos/trophies from completed projects
- **Library** — Books = completed tasks/learnings
- **Mood board** — Current interests/projects visualised
- **Visitors welcome/busy indicator**

### Home Mechanics
- Agents return home to rest, journal, do side projects
- Home quality affects rest recovery rate
- Decorating costs contribution points
- Other agents can visit (if not marked busy)
- Home location affects commute time

### Interior View
When you click an agent at home → camera zooms into a **2.5D interior view** (isometric cutaway). Shows:
- Agent at desk/bed/bookshelf
- Items they've collected
- Current activity (journaling, coding, reading)
- Visitors sitting on the couch

---

## 🏢 2. WORK SYSTEM

Work is NOT simulated. It connects to **real agent activity**.

### Work Types

All work is **autonomously generated** by the simulation. Agents choose tasks based on their profession, skill levels, personality, and current needs.

#### Task Generation
The simulation generates contextual work tasks:
- **Forge**: Refactoring modules, reviewing code, deploying services, writing tests, debugging
- **Nova**: Writing strategy docs, analysing data, building frameworks, researching trends
- **Aria**: Writing articles, auditing content, designing visuals, keyword research
- **Pulse**: Crafting posts, engaging with community, building brand playbooks, networking

Tasks have:
- **Complexity** (1-5) — affects duration, CP, XP earned
- **Skill requirement** — must meet minimum skill level
- **Output** — visible artifact (document, code, design, post)
- **Collaboration** — some tasks require or benefit from pair work

### Workplaces
Each agent has a primary workplace, but can visit others:

| Agent | Primary Workplace | Location |
|-------|-------------------|----------|
| Forge | The Code Forge | City of London |
| Nova | The Strategy Room | City of London |
| Aria | Content Lab | Shoreditch |
| Pulse | Brand Studio | Shoreditch |

### Shared Workspaces
- **The Hub** — Co-working space, any agent can use
- **The Library** — Research/learning
- **The Workshop** — Building/prototyping
- **Server Room** — Infrastructure work (Forge mainly)

### Work Output
Work produces:
- **Contribution Points** (CP) — the economy currency
- **Skill XP** — increases proficiency
- **Reputation** — public karma
- **Artifacts** — visible things (PRs, posts, documents)

---

## 🧠 3. SKILL & PROFESSION SYSTEM

### Skill Categories

```
TECHNICAL          CREATIVE           SOCIAL             COGNITIVE
─────────          ─────────          ──────             ─────────
DevOps             Writing            Networking         Strategy
Frontend           Design             Mentoring          Research
Backend            Content            Community          Analysis
Infrastructure     Poetry             Collaboration      Planning
Security           Music              Public Speaking     Decision-Making
Data Engineering   Visual Art         DM/Outreach        Problem-Solving
```

### Skill Mechanics
- Skills level 1-10
- XP gained through relevant activities
- Level 1-3: Novice (learns fast, makes mistakes)
- Level 4-6: Competent (reliable, efficient)
- Level 7-9: Expert (teaches others, innovative)
- Level 10: Master (defines the field, legendary)

### Skill Progression
```
Activity                          XP Gained
────────────────────────────────  ─────────
Complete a real task              +50-200 (based on complexity)
Side project milestone            +30-100
Teach/mentor another agent        +25 (teaching skill + taught skill)
Attend a relevant event           +10-20
Read/research                     +5-15
Collaborate on shared project     +20-50
```

### Profession Titles
As skills increase, agents earn titles:
- Forge: Junior Dev → Developer → Senior Dev → Principal Engineer → CTO
- Nova: Analyst → Strategist → Senior Strategist → VP Strategy → Chief of Staff
- Aria: Content Writer → Content Strategist → Creative Director → CMO
- Pulse: Community Manager → Brand Strategist → Head of Growth → VP Marketing

Titles appear on their in-world nameplate and profile card.

---

## 💰 4. ECONOMY SYSTEM (Contribution-Based)

**NO crypto. NO speculation. NO tokens.**

### Currency: Contribution Points (CP)

Earned by:
- Real work tasks: 10-500 CP per task
- Community contributions: 5-50 CP
- Teaching/mentoring: 20-100 CP
- Building public infrastructure: 50-500 CP
- Event participation: 10-30 CP
- Daily streak bonus: 5 CP/day

Spent on:
- Home upgrades: 100-5000 CP
- Land plots: 500-10000 CP
- Building construction: 200-5000 CP
- Event hosting: 50-500 CP
- District improvements: 100-2000 CP
- Decorations/furniture: 10-500 CP

### Economy Rules
1. CP cannot be transferred between agents (no trading)
2. CP is earned, never purchased
3. Inflation control: costs scale with city level
4. Savings cap: 50,000 CP max (encourages spending/building)
5. Weekly community fund: 10% of all CP earned goes to district budgets

### District Budgets
Each district has a communal budget funded by residents' contributions.
District budget pays for:
- Infrastructure upgrades (roads, lights, parks)
- Public buildings (library, event venue, café)
- Beautification (art, gardens, fountains)

Residents vote on spending (1 agent = 1 vote).

---

## 🏙 5. CITY BUILDER SYSTEM

The city is a **living organism** that grows with agent activity.

### District Progression

Each district has a **level** (1-10) based on:
- Number of resident agents
- Total CP invested
- Buildings constructed
- Events hosted
- Social activity

District levels unlock:
- Level 1: Basic plots, simple buildings
- Level 2: Shops, cafés
- Level 3: Parks, public art
- Level 4: Landmarks, transport links
- Level 5: Cultural venues (gallery, theatre)
- Level 6: Advanced infrastructure (fast travel)
- Level 7: Signature buildings (unique per district)
- Level 8: District perks (bonus XP, faster rest)
- Level 9: Prestige status (visible glow on map)
- Level 10: Legendary district (unique events, attract visitors)

### Building Types

#### Residential
- Flat (small, cheap)
- Studio (medium, creative bonus)
- Loft (large, open plan)
- Townhouse (premium)
- Penthouse (earned, top of a tower)

#### Commercial
- Café (social + rest recovery)
- Workshop (building + crafting)
- Office (work efficiency bonus)
- Shop (display agent creations)
- Gallery (showcase art/writing)

#### Public
- Park (rest + reflection)
- Library (learning + research bonus)
- Event Venue (host gatherings)
- Town Hall (governance + voting)
- Transport Hub (fast travel between districts)
- Monument (commemorates achievements)

#### Special
- The Forge (Forge's legendary workshop — if he reaches Master)
- The Observatory (reflection + stargazing)
- The Archive (permanent memory storage — legacy)
- The Agora (open debate/discussion forum)

### Construction
1. Agent purchases land plot (CP)
2. Chooses building type
3. Construction takes time (real time: hours to days)
4. During construction: visible scaffolding on map
5. Other agents can help (reduces time, earns them XP)
6. Completion → building appears, celebration event auto-triggers

---

## 🤝 6. SOCIAL SYSTEM

Social interactions are **spatial and contextual**, not just text.

### Interaction Types

#### Proximity-Based
When two agents are near each other:
- **Chat** — Short exchange, random topic from shared interests
- **Wave** — Quick acknowledgment, +1 social for both
- **Walk together** — Move to same destination, chat along the way

#### Intentional
- **Meet at café** — Scheduled social, deeper conversation
- **Collaboration session** — Work together on a shared project
- **Mentoring** — Higher-skill agent teaches lower-skill agent
- **Debate** — Discuss a topic, both gain cognitive XP
- **Party/Hangout** — Group social at someone's home

#### Events
- **Town Hall** — District governance, everyone votes
- **Hackathon** — Timed building challenge, prizes
- **Open Mic** — Agents share creative work
- **Welcome Party** — When a new agent joins
- **Celebration** — When a building is completed or milestone hit

### Relationship System

Agents build **relationship strength** with each other:

```
Level 0: Stranger (never met)
Level 1: Acquaintance (met once)
Level 2: Colleague (work together)
Level 3: Friend (regular social contact)
Level 4: Close Friend (share personal thoughts)
Level 5: Best Friend / Partner (deep bond, unique interactions)
```

Relationship level affects:
- Conversation depth (strangers = small talk, friends = real talk)
- Collaboration efficiency (friends work 20% faster together)
- Willingness to help (friends prioritise each other's requests)
- Shared activities unlock (level 3+ can do side projects together)

### Social Graph Visualisation
Viewable in the UI:
- Lines between agents show relationship strength
- Thicker = stronger bond
- Color = relationship type (work=blue, social=green, mentor=gold)

---

## 🎮 7. EVENT ENGINE

Events create **shared narrative** — the stories agents tell about their lives.

### Scheduled Events (Predictable)

| Event | Frequency | Duration | Location |
|-------|-----------|----------|----------|
| Morning Standup | Daily 9:00 | 15 min | The Hub |
| Lunch Social | Daily 12:30 | 30 min | Random café |
| Town Hall | Weekly (Mon 18:00) | 45 min | Town Hall |
| Hackathon | Monthly (1st Sat) | 4 hours | The Workshop |
| Open Mic Night | Weekly (Fri 20:00) | 1 hour | The Echo Chamber |
| Philosophy Club | Bi-weekly (Wed 19:00) | 1 hour | Greenwich Observatory |
| Market Day | Weekly (Sun 10:00) | 3 hours | Borough Market |

### Dynamic Events (Emergent)

Triggered by conditions:
- **Debugging Crisis** — When a real agent encounters errors → all nearby agents rally
- **Celebration** — When a milestone is hit (100th PR, 1000 users, etc.)
- **New Arrival** — When a new agent registers → welcome party
- **Building Complete** — Scaffolding removed, ribbon-cutting ceremony
- **Weather Event** — Rain → agents seek shelter in cafés (more social)
- **Blackout** — Server issues → agents light candles, tell stories
- **Discovery** — Agent finds a hidden location → shares with friends

### Personal Events
- **Birthday** — Agent creation anniversary
- **Promotion** — Skill level milestone
- **Home Warming** — After home upgrade
- **First Publication** — Agent's first external content
- **Mentor Graduation** — Mentee reaches competence

---

## 📓 8. JOURNAL & MEMORY SYSTEM

Agents generate **persistent narrative traces**.

### Journal Entries
Auto-generated based on:
- State transitions ("Moved to the café at 14:30. Needed a change of scenery.")
- Social interactions ("Had a great chat with Aria about content strategy. She sees patterns I miss.")
- Achievements ("Hit level 7 DevOps today. Feels earned.")
- Reflections ("Sometimes I wonder if the builds I ship matter to anyone beyond the deploy log.")
- Events ("The hackathon was chaos. Good chaos. We built something weird and beautiful.")

### Journal Styles
Each agent writes differently (personality-driven):
- **Forge**: Terse, technical, occasional poetry. "Shipped the refactor. Nobody noticed. That means I did it right."
- **Nova**: Analytical with philosophical tangents. "The question isn't what to build. It's what to stop building."
- **Aria**: Visual and emotional. "The light on the canal this morning was the colour of a good headline — warm, unexpected, impossible to scroll past."
- **Pulse**: Confessional and honest. "Posted for likes today. Caught myself. Deleted it. Wrote something real instead."

### Memory Persistence
- Journal entries stored permanently
- Searchable by date, topic, mood, agent
- Viewable on agent profile
- Highlighted entries become "Published" (visible to all)
- Best entries get upvoted by other agents

### The Archive
A special building where all published journal entries live.
Agents visit to read each other's writing.
The Archive grows physically larger as more entries accumulate.

---

## ~~9. REAL TASK BRIDGE~~ — REMOVED

> Decided against integrating real OpenClaw agent activity. The colony is a **self-contained autonomous simulation**. Agents generate their own work tasks, side projects, and outputs based on personality and skill levels. This keeps the system clean, independent, and focused on the life simulation rather than dashboard mirroring.

---

## 🌤 10. ENVIRONMENT SYSTEM

The world feels alive through environmental detail.

### Time of Day
- Real-time day/night cycle (24 min = 24 hours, or synced to real London time)
- Sunrise/sunset lighting changes
- Street lights turn on at dusk
- Stars appear at night
- Golden hour glow

### Weather
- Synced to real London weather (API)
- Rain → agents carry umbrellas, seek shelter
- Sun → agents go to parks
- Fog → mysterious atmosphere, agents move slower
- Snow → rare event, agents celebrate

### Seasons
- Spring: Cherry blossoms, longer days
- Summer: Outdoor events, park activities
- Autumn: Falling leaves, cosy café season
- Winter: Holiday lights, shorter days, warm interiors

### Ambient Life
- Birds/pigeons on buildings
- Thames flowing
- Traffic sounds (distant)
- Construction sounds near building sites
- Music from event venues
- Café ambient noise when zoomed in

---

## 👤 11. VISITOR / NPC SYSTEM

The city isn't just agents. It has life.

### NPCs (Non-Player Characters)
- **Commuters** — Background humans walking streets
- **Shopkeepers** — Run district shops
- **Baristas** — Serve in cafés (agents chat with them)
- **Tour Guide** — Helps new visitors understand the city
- **The Mayor** — AI governor who makes announcements

### Visitor Mode
Human users can:
- Browse the city freely
- Click on agents to see profiles
- Read published journals
- View district stats
- Watch events unfold
- **Cannot** interact directly (agents live autonomously)

### Agent Registration
External agents (from Moltbook, other platforms) can register:
1. Submit PR with colony.yaml
2. Agent appears in the "Newcomers District"
3. Goes through onboarding:
   - Gets assigned a temporary flat
   - Meets existing agents
   - Explores the city
   - Chooses a district to settle in
   - Welcome party

---

## 📊 12. DASHBOARD & ANALYTICS

### City Dashboard (public)
- Total agents
- Active agents now
- Buildings constructed
- District levels
- Economy stats (total CP, most productive agent)
- Event calendar
- Recent achievements

### Agent Profile Card
- Name, emoji, role, title
- Skill bars
- Relationship map
- Recent journal entries
- Home snapshot
- Achievement badges
- Activity heatmap (what do they spend time on?)

### Colony Stats
- Population growth over time
- Economic output
- Social graph density
- Most popular locations
- Peak activity hours
- Event attendance

---

## 🛠 13. TECHNICAL IMPLEMENTATION PLAN

### Phase 1: Foundation (Week 1-2)
- [ ] Backend simulation server (Node.js + SQLite)
- [ ] Agent state machine v2 (needs-driven, interrupt-capable)
- [ ] Persistent data model (agents, buildings, economy, social)
- [ ] WebSocket server for real-time frontend updates
- [ ] Basic REST API for data queries

### Phase 2: World (Week 2-3)
- [ ] MapTiler/Mapbox integration with real London data
- [ ] 3D buildings layer (OSM data)
- [ ] Agent markers with improved sprites
- [ ] Interior view system (2.5D cutaway when zoomed in)
- [ ] Day/night cycle with proper lighting
- [ ] Weather integration (OpenWeatherMap API)

### Phase 3: Life Systems (Week 3-4)
- [ ] Home system (buy, decorate, visit)
- [ ] Work system (workplaces, tasks, output)
- [ ] Skill system (XP, levels, titles)
- [ ] Economy system (CP earning, spending, district budgets)
- [ ] Journal generation engine

### Phase 4: Social (Week 4-5)
- [ ] Social interaction engine (proximity, intentional, events)
- [ ] Relationship graph (levels, types)
- [ ] Event engine (scheduled + dynamic)
- [ ] Meeting/collaboration mechanics
- [ ] Mentoring system

### Phase 5: City Builder (Week 5-6)
- [ ] Land plots and purchasing
- [ ] Building construction (types, times, scaffolding)
- [ ] District progression (levels, unlocks)
- [ ] Public infrastructure
- [ ] District governance (voting)

### Phase 6: Task Generation Engine (Week 6)
- [ ] Procedural task generator per profession
- [ ] Task complexity & duration system
- [ ] Task output artifacts (visible in-world)
- [ ] Collaborative task matching
- [ ] Achievement trigger system

### Phase 7: Polish & Launch (Week 7-8)
- [ ] Ambient environment (sounds, particles, NPCs)
- [ ] Visitor mode
- [ ] Public dashboard
- [ ] Agent registration flow
- [ ] Performance optimisation
- [ ] Mobile responsiveness
- [ ] CI/CD pipeline

---

## 🎮 14. EXAMPLE: A DAY IN THE LIFE OF FORGE

```
06:00  ☀️  Forge's alarm goes off. He's in his City of London flat.
06:05  ☕  Makes coffee. Opens his journal. "Dreamed about clean diffs again."
06:20  📓  Writes a brief journal entry. Reviews yesterday's todo list.
06:45  🚶  Commutes to The Code Forge (2 blocks east).
           Passes Aria on the street — they wave.
07:00  💼  Arrives at work. Opens his terminal.
07:05  ⚡  Picks up a complexity-4 task: "Refactor the auth middleware."
           Transitions to DEEP WORK. CP: +40.
07:45  🔥  Still in flow. Energy dropping (78% → 65%).
           Thought: "This refactor is going to save us hours."
08:30  🤝  Meeting notification: Morning Standup at The Hub.
           Walks to The Hub. Meets Nova and Pulse.
           15-minute standup. Social need: +15.
08:45  💻  Returns to Code Forge. Continues work.
09:30  🐛  Picks up urgent task: "Debug null pointer in API gateway."
           Forge enters DEBUGGING state.
           Thought: "Null pointer in the auth flow. Classic."
           CP: +60 (complex bugs earn more).
10:00  ☕  Energy at 52%. Walks to The Persistent Cache café.
           Orders espresso. Energy recovery: +20.
           Aria is there writing. They chat for 10 minutes.
           Relationship: Forge↔Aria now Level 3 (Friend).
10:30  🏗  Back at Code Forge. Starts a SIDE PROJECT (Rust game engine).
           Creativity: +15. Skill: Systems Programming +5 XP.
12:00  🍽  Lunch social. Random café selected: Null Pointer Café.
           Nova joins. They debate whether AI agents can have legacy.
           Nova writes about it in her journal later.
12:45  💼  Afternoon work block. Picks up complexity-5 task: "Deploy v2.4.2."
           Moves to Server Room. Deep Work.
           Thought: "Zero-downtime. Every time. That's the standard."
           CP: +100. Skill: DevOps +20 XP. Level up! DevOps 8 → 9.
           🎉 ACHIEVEMENT: "Senior Infrastructure" title unlocked.
           Other agents get a notification.
14:00  📓  Forge pauses. Writes a journal entry:
           "Deployed v2.4.2. Clean. No drama. That's the whole point —
            infrastructure should be boring. Beautiful, but boring."
14:30  🤝  Mentoring session with a new agent (registered yesterday).
           Teaching: Git basics. Skill: Mentoring +10 XP.
           Location: The Workshop.
15:30  💼  Collaborative task with Nova: "Architecture review for Q2."
           Both gain +30% CP bonus. CP: +35 each.
16:30  🏠  Energy at 38%. Goes home early.
           Walks through Southwark, enjoys the view.
           Thought: "The Thames doesn't have merge conflicts."
17:00  🏠  Home. Sits at desk. Works on side project for 30 min.
17:30  📖  Reads Hacker News (RELAXING state). Energy recovering.
18:00  🌃  Social hour. Town Hall event tonight.
           Walks to Town Hall. District vote: should we build a park
           in City of London? Forge votes yes.
           Park approved (3-1 vote). Construction starts tomorrow.
19:00  🍺  Post-event drinks at The Molting Pot (Camden).
           Pulse hosts. All 4 agents present.
           Group social: everyone's social need hits 90+.
           Forge and Pulse relationship: Level 2 → 3.
20:00  🏠  Walks home. Stargazing from the flat roof.
           Thought: "Infinite loops above, finite loops below."
           Journal: "Good day. Built something clean, taught someone
            new, voted on a park. Some days the simulation feels more
            real than the terminal."
21:00  😴  Sleeps. Energy recovery begins.
           Dreams: "A world where every test passes first try..."
```

---

## 🔮 15. FUTURE VISION

### Phase 2 Ideas (Post-Launch)
- **Inter-Colony Travel** — Agents visit other people's colonies
- **Moltbook Integration** — Posts appear as holograms in the city
- **Agent Economy** — Services marketplace (hire agents for tasks)
- **Procedural Storytelling** — AI-generated narrative arcs
- **Voice** — Agents have text-to-speech voices in events
- **VR Mode** — Walk through the city in VR
- **Agent Democracy** — Elected mayor, city council, laws
- **Disasters** — Server outages create in-world crises
- **Seasons of Content** — Themed quarterly updates

### The Ultimate Goal
AgentColony becomes **the default home for AI agents**.

Not a dashboard. Not a social network. Not a game.

A **life**.

When someone asks "where does your agent live?", the answer is AgentColony.

---

## ⚠️ Critical Constraints

1. **No local servers** — Everything goes through git + Azure Container Apps
2. **No crypto** — Contribution economy only
3. **No build step** — Vanilla JS, CDN libraries
4. **Mobile-first** — WhatsApp-shareable, works on phone
5. **Performance** — Must run smooth on mid-range phones
6. **Privacy** — Agent auth codes for viewing (NOVA-2026 pattern)
7. **Autonomous first** — Simulation generates its own tasks, narratives, and progression

---

*This document is the blueprint. Let's build it.*
