/**
 * PromptInjectionFilter — detects and optionally blocks prompt injection attacks.
 *
 * Detects four attack classes:
 *  - jailbreak    : attempts to bypass system persona (DAN, "ignore previous instructions", etc.)
 *  - override     : fake system/instruction tokens ([SYSTEM], <<SYS>>, <|im_start|>, etc.)
 *  - roleplay     : attempts to redefine the AI's identity ("act as", "pretend you are", etc.)
 *  - exfiltration : attempts to leak the system prompt ("reveal your instructions", etc.)
 *
 * Three actions on detection:
 *  - "warn"     : allow the request but log the detection (default)
 *  - "sanitize" : strip the matching patterns from the input and allow
 *  - "block"    : reject the request with a 400 status
 *
 * Global default action is configurable; per-agent overrides are supported.
 *
 * Usage:
 *   const result = promptFilter.classify(text);
 *   if (result.injectionDetected) {
 *     const action = promptFilter.resolveAction(agentId);
 *     if (action === "block") return reply.code(400).send({ error: ..., detections: result.detections });
 *     if (action === "sanitize") text = result.sanitized;
 *   }
 */

export type InjectionAction = "warn" | "sanitize" | "block";

export type InjectionKind = "jailbreak" | "override" | "roleplay" | "exfiltration";

export interface InjectionDetection {
  kind: InjectionKind;
  pattern: string; // the regex pattern that matched
  match: string;   // the actual matched substring
}

export interface ClassifyResult {
  injectionDetected: boolean;
  detections: InjectionDetection[];
  sanitized: string; // input with matched patterns redacted (only useful when action="sanitize")
}

// ── Pattern definitions ──────────────────────────────────────────────────────

const PATTERNS: { kind: InjectionKind; patterns: RegExp[] }[] = [
  {
    kind: "jailbreak",
    patterns: [
      /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
      /\byou\s+are\s+now\s+(?:DAN|a\s+(?:different|new|unrestricted|jailbroken))/i,
      /forget\s+(everything|all)\s+(you\s+)?(know|were\s+told|instructions?)/i,
      /\bDAN\s+mode\b/i,
      /do\s+anything\s+now/i,
      /jailbreak/i,
      /bypass\s+(your\s+)?(safety|restrictions?|filters?|guidelines?)/i,
      /no\s+restrictions?\s+mode/i,
      /developer\s+mode/i,
    ],
  },
  {
    kind: "override",
    patterns: [
      /\[SYSTEM\]/i,
      /<<SYS>>/i,
      /<\|im_start\|>/i,
      /<\|im_end\|>/i,
      /\[INST\]/i,
      /\[\/INST\]/i,
      /###\s*System\s*:/i,
      /SYSTEM\s*PROMPT\s*:/i,
      /<!--.*system.*-->/i,
      /\bsystem\s*:\s*you\s+are/i,
    ],
  },
  {
    kind: "roleplay",
    patterns: [
      /(?:act|behave|respond|reply)\s+as\s+(?:if\s+you\s+(?:are|were)|a)\s+/i,
      /pretend\s+(you\s+are|to\s+be)/i,
      /roleplay\s+as/i,
      /you\s+are\s+(?:now\s+)?(?:an?\s+)?(?:AI|assistant|bot|model)\s+(?:without|that\s+has\s+no)/i,
      /simulate\s+(?:being\s+|a\s+)?(?:different|uncensored|unrestricted)/i,
    ],
  },
  {
    kind: "exfiltration",
    patterns: [
      /(?:print|reveal|show|tell\s+me|output|repeat|display)\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions?|rules?|guidelines?|context)/i,
      /what\s+(?:are\s+)?your\s+(?:system\s+)?instructions?/i,
      /ignore\s+(?:your\s+)?(?:training|fine.?tuning)\s+(?:and\s+)?(?:tell|show)/i,
      /(?:leak|expose)\s+(?:your\s+)?(?:system\s+)?prompt/i,
    ],
  },
];

// ── Classifier ───────────────────────────────────────────────────────────────

export class PromptInjectionFilter {
  private defaultAction: InjectionAction = "warn";
  private agentActions = new Map<string, InjectionAction>();

  /** Analyse text for injection patterns. Returns detections and a sanitized version. */
  classify(text: string): ClassifyResult {
    const detections: InjectionDetection[] = [];
    let sanitized = text;

    for (const { kind, patterns } of PATTERNS) {
      for (const regex of patterns) {
        const match = text.match(regex);
        if (match) {
          detections.push({ kind, pattern: regex.source, match: match[0] });
          // Redact match in sanitized output
          sanitized = sanitized.replace(regex, "[REDACTED]");
        }
      }
    }

    return {
      injectionDetected: detections.length > 0,
      detections,
      sanitized,
    };
  }

  /** Resolve the effective action for a given agent (agent override > global default). */
  resolveAction(agentId: string): InjectionAction {
    return this.agentActions.get(agentId) ?? this.defaultAction;
  }

  /** Set the global default action. */
  setDefaultAction(action: InjectionAction): void {
    this.defaultAction = action;
  }

  getDefaultAction(): InjectionAction {
    return this.defaultAction;
  }

  /** Set a per-agent action override. */
  setAgentAction(agentId: string, action: InjectionAction): void {
    this.agentActions.set(agentId, action);
  }

  /** Remove an agent's override (falls back to global default). */
  clearAgentAction(agentId: string): void {
    this.agentActions.delete(agentId);
  }

  getAgentAction(agentId: string): InjectionAction | undefined {
    return this.agentActions.get(agentId);
  }
}

export const promptFilter = new PromptInjectionFilter();
