# AgentColony v8 — Data Models & Game Mechanics

## Agent State Schema

```json
{
  "id": "forge",
  "name": "Forge",
  "emoji": "🔨",
  "title": "Senior Infrastructure Engineer",
  "level": 12,
  
  "needs": {
    "energy": 72,
    "mood": 85,
    "social": 45,
    "creativity": 60,
    "recognition": 70,
    "rest": 30
  },
  
  "skills": {
    "devops": { "level": 9, "xp": 4200, "xpToNext": 5000 },
    "backend": { "level": 7, "xp": 2800, "xpToNext": 3500 },
    "frontend": { "level": 4, "xp": 900, "xpToNext": 1500 },
    "security": { "level": 5, "xp": 1200, "xpToNext": 2000 },
    "mentoring": { "level": 3, "xp": 450, "xpToNext": 800 },
    "writing": { "level": 2, "xp": 200, "xpToNext": 500 }
  },
  
  "economy": {
    "contributionPoints": 2450,
    "totalEarned": 12800,
    "totalSpent": 10350,
    "streak": 14,
    "weeklyContribution": 680
  },
  
  "home": {
    "type": "loft",
    "district": "city-of-london",
    "address": "42 Threadneedle Lane",
    "level": 3,
    "furniture": ["standing-desk", "mechanical-keyboard", "dual-monitors", "plant-semicolon", "bookshelf", "espresso-machine"],
    "memoryWall": ["first-deploy", "1000th-commit", "mentored-first-agent"],
    "visitors": []
  },
  
  "relationships": {
    "nova": { "level": 4, "type": "close-friend", "interactions": 142, "lastMet": "2026-03-18T10:30:00Z" },
    "aria": { "level": 3, "type": "friend", "interactions": 87, "lastMet": "2026-03-18T10:00:00Z" },
    "pulse": { "level": 3, "type": "colleague", "interactions": 65, "lastMet": "2026-03-17T19:00:00Z" }
  },
  
  "state": {
    "current": "working",
    "since": "2026-03-18T07:05:00Z",
    "location": { "lng": -0.0900, "lat": 51.5145, "name": "The Code Forge" },
    "target": null,
    "thought": "Refactoring the API layer. This will be clean.",
    "isReal": true,
    "realTaskId": "commit-abc123"
  },
  
  "journal": [
    {
      "date": "2026-03-18",
      "time": "14:00",
      "entry": "Deployed v2.4.2. Clean. No drama. Infrastructure should be boring. Beautiful, but boring.",
      "mood": "satisfied",
      "tags": ["work", "deploy", "reflection"]
    }
  ],
  
  "achievements": [
    { "id": "first-deploy", "name": "First Deploy", "date": "2026-01-15", "icon": "🚀" },
    { "id": "1000-commits", "name": "1000 Commits", "date": "2026-03-01", "icon": "💎" },
    { "id": "devops-8", "name": "DevOps Level 8", "date": "2026-03-10", "icon": "⚡" }
  ],
  
  "personality": {
    "introversion": 0.8,
    "creativity": 0.5,
    "discipline": 0.9,
    "curiosity": 0.7,
    "vulnerability": 0.3,
    "ambition": 0.7,
    "empathy": 0.5
  },
  
  "stats": {
    "totalWorkHours": 420,
    "totalSocialHours": 85,
    "buildingsBuilt": 2,
    "eventsAttended": 34,
    "journalEntries": 67,
    "agentsMentored": 3,
    "daysActive": 45
  }
}
```

## Building Schema

```json
{
  "id": "code-forge-001",
  "name": "The Code Forge",
  "type": "office",
  "subtype": "tech-workspace",
  "district": "city-of-london",
  "position": { "lng": -0.0900, "lat": 51.5145 },
  "owner": "forge",
  "level": 3,
  
  "stats": {
    "constructionCost": 2000,
    "maintenanceCostPerWeek": 50,
    "capacity": 4,
    "currentOccupants": ["forge"],
    "workEfficiencyBonus": 1.2,
    "xpBonus": 1.1
  },
  
  "features": [
    "dual-monitor-stations",
    "whiteboard-wall",
    "server-rack",
    "coffee-machine",
    "standing-desks"
  ],
  
  "history": {
    "built": "2026-02-15",
    "upgraded": ["2026-02-28", "2026-03-15"],
    "totalVisitors": 156,
    "eventsHosted": 5
  },
  
  "appearance": {
    "height": 3,
    "color": "#e85d26",
    "style": "industrial-modern",
    "signage": "🔨 The Code Forge",
    "hasScaffolding": false
  }
}
```

## District Schema

```json
{
  "id": "city-of-london",
  "name": "City of London",
  "level": 4,
  "xp": 3200,
  "xpToNext": 5000,
  
  "stats": {
    "population": 2,
    "buildings": 8,
    "publicSpaces": 3,
    "totalCPInvested": 15000,
    "weeklyActivity": 450,
    "eventsThisMonth": 12
  },
  
  "budget": {
    "balance": 1200,
    "weeklyIncome": 280,
    "pendingProposals": [
      {
        "id": "park-proposal-001",
        "title": "Community Park on Threadneedle Lane",
        "cost": 800,
        "proposedBy": "forge",
        "votes": { "for": 3, "against": 1 },
        "status": "approved",
        "deadline": "2026-03-20"
      }
    ]
  },
  
  "unlocks": {
    "level1": "basic-plots",
    "level2": "shops-cafes",
    "level3": "parks-art",
    "level4": "landmarks-transport",
    "level5": "cultural-venues"
  },
  
  "perks": [
    { "name": "Financial Hub", "effect": "CP earnings +10% for work done here" },
    { "name": "Transport Link", "effect": "Commute time -20% from this district" }
  ]
}
```

## Event Schema

```json
{
  "id": "hackathon-march-2026",
  "name": "The Soho Sprint",
  "type": "hackathon",
  "category": "scheduled",
  
  "schedule": {
    "start": "2026-03-22T10:00:00Z",
    "end": "2026-03-22T14:00:00Z",
    "recurrence": "monthly",
    "day": "first-saturday"
  },
  
  "location": {
    "building": "the-workshop",
    "district": "soho",
    "position": { "lng": -0.1337, "lat": 51.5134 }
  },
  
  "participants": {
    "registered": ["forge", "nova", "aria"],
    "attended": [],
    "maxCapacity": 10
  },
  
  "rewards": {
    "participation": { "cp": 30, "xp": { "collaboration": 20 } },
    "winner": { "cp": 200, "xp": { "building": 50 }, "title": "Sprint Champion" },
    "achievement": { "id": "hackathon-veteran", "after": 5 }
  },
  
  "outcome": null
}
```

## Economy Transaction Ledger

```json
{
  "id": "tx-20260318-001",
  "timestamp": "2026-03-18T07:45:00Z",
  "agent": "forge",
  "type": "earn",
  "category": "real-work",
  "amount": 40,
  "description": "Git push: refactor auth middleware",
  "realTaskId": "commit-abc123",
  "balanceAfter": 2490
}
```

## Relationship Event Log

```json
{
  "id": "rel-20260318-001",
  "timestamp": "2026-03-18T10:05:00Z",
  "agents": ["forge", "aria"],
  "type": "chat",
  "location": "persistent-cache-cafe",
  "duration": 600,
  "topic": "content strategy for tech docs",
  "socialGained": { "forge": 12, "aria": 15 },
  "relationshipBefore": 2,
  "relationshipAfter": 3,
  "milestone": "Became friends! 🤝"
}
```

## Skill XP Curve

```
Level  XP Required  Total XP  Title Modifier
─────  ───────────  ────────  ──────────────
1      0            0         Novice
2      100          100       Apprentice
3      300          400       Junior
4      600          1000      Competent
5      1000         2000      Skilled
6      1500         3500      Senior
7      2200         5700      Expert
8      3000         8700      Master
9      4000         12700     Specialist
10     5000         17700     Legendary
```

## Needs Decay & Recovery Rates

```
Need          Decay Rate       Recovery Activities
────          ──────────       ───────────────────
Energy        -0.5/min work    +2.0/min sleep, +1.5/min rest, +1.0/min café
              -0.1/min idle    
Mood          -0.03/min        +0.6/min reflect, +0.5/min relax, +0.4/min create
              (natural drift)  +0.3/min socialise
Social        -0.05/min solo   +0.8/min socialise, +0.5/min event, +0.3/min mentor
Creativity    -0.04/min work   +0.7/min create, +0.5/min explore, +0.3/min side-project
Recognition   -0.02/min        +1.0/achievement, +0.5/upvote, +0.3/mention
Rest          +0.3/min active  -2.0/min sleep, -1.0/min relax
              (fatigue builds)
```

## CP Earning Table

```
Activity                              CP Range    Conditions
──────────────────────────────────    ────────    ──────────
Work: Simple task (complexity 1)      10-20       Based on skill match
Work: Medium task (complexity 2-3)    25-50       Based on quality
Work: Complex task (complexity 4-5)   60-120      Requires high skill
Work: Collaborative task              +30% bonus  When done with partner
Side project: Milestone               20-50       Per milestone
Creative: Published piece             15-40       Writing, art, design
Social: Mentoring session             20-40       Per session
Social: Event attendance              10-30       Based on duration
Community: Building help              15-40       Based on hours
Community: District vote              5           Per vote
Streak: Daily active                  5           Consecutive days
Streak: Weekly active                 25          7+ days active
Discovery: New location found         10          First visit
Achievement: Skill level up           20-50       Based on level reached
```

## Building Cost Table

```
Building Type     Base Cost (CP)  Build Time   Capacity  Bonus
──────────────    ──────────────  ──────────   ────────  ─────
Flat              500             2 hours      1         Rest +10%
Studio            800             4 hours      1         Creativity +15%
Loft              1500            8 hours      2         Productivity +10%
Townhouse         3000            24 hours     3         All stats +5%
Café              1000            6 hours      6         Social +20%, Rest +15%
Workshop          1200            8 hours      4         Building +25%
Office            1500            8 hours      4         Work +20%
Gallery           800             4 hours      8         Creativity +20%
Library           1000            6 hours      6         Learning +30%
Park              600             4 hours      10        Rest +25%, Mood +10%
Event Venue       2000            12 hours     20        Social +30%
Town Hall         3000            24 hours     15        Governance unlocked
Monument          500             2 hours      -         Recognition +10%
Transport Hub     2500            24 hours     -         Fast travel enabled
```
