/**
 * AgentScheduler — always-on autonomous agent infrastructure.
 *
 * Three wake mechanisms:
 *  1. Poll loop      — agent.always_on + pollIntervalTicks fires the LLM brain on a tick cadence.
 *  2. Watch triggers — agent.watchEventKinds fires the LLM brain when a matching event occurs.
 *  3. Wall-clock     — optional real-time interval (ms) via scheduleWallClock() / cancelWallClock().
 *
 * The scheduler is called by WorldTickEngine at the end of each tick via tick().
 * All LLM invocations are non-blocking background refreshes via agentBrain.think().
 */

import { store } from "../db/store";
import { agentBrain } from "./AgentBrain";
import type { Agent } from "@agentcolony/shared";

const DEFAULT_POLL_INTERVAL_TICKS = 30; // ~60s at 2s/tick

class AgentScheduler {
  /** agentId → last tick on which this agent's brain was fired by the scheduler */
  private lastFiredTick = new Map<string, number>();

  /** agentId → wall-clock NodeJS timer for real-time polling */
  private wallClockTimers = new Map<string, ReturnType<typeof setInterval>>();

  /**
   * Called by WorldTickEngine at the end of every tick.
   *
   * @param currentTick    The current simulation tick number.
   * @param tickEventKinds Set of WorldEvent.kind values that occurred during this tick.
   */
  tick(currentTick: number, tickEventKinds: Set<string>): void {
    for (const agent of store.agents) {
      if (agent.isRetired || !agent.always_on) continue;

      // Check poll interval
      const interval = agent.pollIntervalTicks ?? DEFAULT_POLL_INTERVAL_TICKS;
      const lastFired = this.lastFiredTick.get(agent.id) ?? -Infinity;
      const pollDue = currentTick - lastFired >= interval;

      // Check watch triggers
      const watchKinds = agent.watchEventKinds ?? [];
      const watchTriggered = watchKinds.length > 0 && watchKinds.some(k => tickEventKinds.has(k));

      if (pollDue || watchTriggered) {
        this.fireAgent(agent, currentTick);
      }
    }
  }

  /**
   * Register a real-time (wall-clock) polling interval for an agent.
   * Useful when wall-clock precision matters more than tick alignment.
   *
   * @param agentId      Target agent.
   * @param intervalMs   Firing interval in real milliseconds.
   */
  scheduleWallClock(agentId: string, intervalMs: number): void {
    this.cancelWallClock(agentId); // clear any existing timer first
    const timer = setInterval(() => {
      const agent = store.getAgent(agentId);
      if (!agent || agent.isRetired) {
        this.cancelWallClock(agentId);
        return;
      }
      this.fireAgent(agent, store.tick);
    }, intervalMs);
    this.wallClockTimers.set(agentId, timer);
  }

  /** Cancel a wall-clock timer for an agent. */
  cancelWallClock(agentId: string): void {
    const existing = this.wallClockTimers.get(agentId);
    if (existing) {
      clearInterval(existing);
      this.wallClockTimers.delete(agentId);
    }
  }

  /** Cancel all wall-clock timers. Call on server shutdown. */
  stopAll(): void {
    for (const [id] of this.wallClockTimers) {
      this.cancelWallClock(id);
    }
  }

  private fireAgent(agent: Agent, currentTick: number): void {
    this.lastFiredTick.set(agent.id, currentTick);
    // Non-blocking background brain refresh — triggers agentBrain cache update
    store.getAgentMemories(agent.id).then(memories => {
      agentBrain.think(agent, memories);
    }).catch(() => undefined);
  }
}

export const agentScheduler = new AgentScheduler();
