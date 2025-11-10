import { createLogger } from '@phalanx/shared';

const logger = createLogger({ name: 'policy-engine' });

export interface PolicyRule {
  priority: number;
  tool?: string;
  commandPattern?: string;
  decision: 'allow' | 'deny' | 'ask_user';
  reason?: string;
}

export interface PolicyEvaluationRequest {
  tool: string;
  command?: string;
  confirm?: boolean;
}

export interface PolicyDecision {
  decision: 'allow' | 'deny' | 'ask_user';
  reason?: string;
  matchedRule?: PolicyRule;
}

export class PolicyEngine {
  private rules: PolicyRule[] = [];

  constructor() {
    this.loadDefaultRules();
  }

  private loadDefaultRules() {
    // High-priority deny rules for dangerous commands
    this.rules.push(
      {
        priority: 100,
        tool: 'shell',
        commandPattern: '^rm\\s+-rf\\s+/',
        decision: 'deny',
        reason: 'Recursive deletion of root filesystem is not allowed',
      },
      {
        priority: 100,
        tool: 'shell',
        commandPattern: '^dd\\s+if=.*of=/dev/',
        decision: 'deny',
        reason: 'Writing to raw devices is not allowed',
      },
      {
        priority: 100,
        tool: 'shell',
        commandPattern: ':(){ :|:& };:',
        decision: 'deny',
        reason: 'Fork bomb detected',
      }
    );

    // Medium-priority ask rules for potentially dangerous commands
    this.rules.push(
      {
        priority: 50,
        tool: 'shell',
        commandPattern: '^rm\\s+-rf',
        decision: 'ask_user',
        reason: 'Recursive deletion requires confirmation',
      },
      {
        priority: 50,
        tool: 'shell',
        commandPattern: '^curl.*\\|\\s*(bash|sh)',
        decision: 'ask_user',
        reason: 'Executing remote scripts requires confirmation',
      },
      {
        priority: 50,
        tool: 'shell',
        commandPattern: '^sudo',
        decision: 'ask_user',
        reason: 'Privileged commands require confirmation',
      }
    );

    // Low-priority default allow
    this.rules.push({
      priority: 1,
      tool: '*',
      decision: 'allow',
    });

    // Sort rules by priority (highest first)
    this.rules.sort((a, b) => b.priority - a.priority);

    logger.info({ ruleCount: this.rules.length }, 'Policy engine initialized');
  }

  async evaluate(request: PolicyEvaluationRequest): Promise<PolicyDecision> {
    logger.debug({ request }, 'Evaluating policy');

    // If confirmation is explicitly requested, return ask_user
    if (request.confirm) {
      return {
        decision: 'ask_user',
        reason: 'User confirmation requested',
      };
    }

    // Find matching rule
    for (const rule of this.rules) {
      if (this.matchesRule(request, rule)) {
        logger.debug({ rule, request }, 'Rule matched');
        return {
          decision: rule.decision,
          reason: rule.reason,
          matchedRule: rule,
        };
      }
    }

    // Default deny if no rule matches (shouldn't happen with catch-all rule)
    logger.warn({ request }, 'No matching rule found, denying by default');
    return {
      decision: 'deny',
      reason: 'No matching policy rule',
    };
  }

  private matchesRule(request: PolicyEvaluationRequest, rule: PolicyRule): boolean {
    // Check tool match
    if (rule.tool && rule.tool !== '*' && rule.tool !== request.tool) {
      return false;
    }

    // Check command pattern
    if (rule.commandPattern && request.command) {
      const regex = new RegExp(rule.commandPattern);
      if (!regex.test(request.command)) {
        return false;
      }
    }

    return true;
  }

  addRule(rule: PolicyRule) {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
    logger.info({ rule }, 'Policy rule added');
  }

  getRules(): PolicyRule[] {
    return [...this.rules];
  }
}
