/**
 * Email Processing Service
 * Handles email processing workflow: filtering, logging, and statistics
 * 
 * Requirements: 7.1, 7.2
 * - Records processing logs with recipient, sender, subject, and action
 * - Records matched rule information when email hits a filter rule
 */

import type {
  IncomingEmail,
  ProcessResult,
  ProcessLog,
  FilterRule,
} from '@email-filter/shared';
import { FilterService, FilterResult, toProcessResult } from './filter.service.js';
import { ProcessLogRepository, CreateProcessLogDTO } from '../db/process-log-repository.js';
import { RuleRepository } from '../db/rule-repository.js';
import { ForwardRepository } from '../db/forward-repository.js';

/**
 * Email processing result with log entry
 */
export interface EmailProcessingResult {
  processResult: ProcessResult;
  log: ProcessLog;
}

/**
 * Email Service class for processing emails through the filter engine
 */
export class EmailService {
  private filterService: FilterService;

  constructor(
    private processLogRepository: ProcessLogRepository,
    private ruleRepository: RuleRepository,
    private forwardRepository?: ForwardRepository
  ) {
    this.filterService = new FilterService();
  }

  /**
   * Process an incoming email through the filter engine
   * 
   * This method:
   * 1. Fetches all enabled filter rules
   * 2. Runs the email through the filter engine
   * 3. Records the processing log with all required information
   * 4. Returns the processing result and log entry
   * 
   * @param email - The incoming email to process
   * @returns Processing result with log entry
   */
  async processEmail(email: IncomingEmail): Promise<EmailProcessingResult> {
    let filterResult: FilterResult;
    let rules: FilterRule[];

    try {
      // Fetch all enabled rules
      rules = await this.ruleRepository.findEnabled();
      
      // Process email through filter engine
      filterResult = this.filterService.processEmail(email, rules);
    } catch (error) {
      // Handle errors during filtering - log as error and pass the email
      const errorLog = await this.createErrorLog(email, error);
      return {
        processResult: { action: 'passed' },
        log: errorLog,
      };
    }


    // Create process log entry
    const logDto: CreateProcessLogDTO = {
      recipient: email.recipient,
      sender: email.sender,
      senderEmail: email.senderEmail,
      subject: email.subject,
      action: filterResult.action,
      matchedRuleId: filterResult.matchedRule?.id,
      matchedRuleCategory: filterResult.matchedCategory,
    };

    const log = await this.processLogRepository.create(logDto);

    // Update rule's last hit timestamp if a rule was matched
    if (filterResult.matchedRule) {
      await this.ruleRepository.updateLastHitAt(filterResult.matchedRule.id);
    }

    // Get forwarding address for passed emails
    const processResult = toProcessResult(filterResult);
    if (processResult.action === 'passed' && this.forwardRepository) {
      const forwardTo = await this.forwardRepository.getForwardAddress(email.recipient);
      if (forwardTo) {
        processResult.forwardTo = forwardTo;
      }
    }

    return {
      processResult,
      log,
    };
  }

  /**
   * Process an email with pre-loaded rules (for batch processing or testing)
   * 
   * @param email - The incoming email to process
   * @param rules - Pre-loaded filter rules
   * @returns Processing result with log entry
   */
  async processEmailWithRules(
    email: IncomingEmail,
    rules: FilterRule[]
  ): Promise<EmailProcessingResult> {
    let filterResult: FilterResult;

    try {
      // Process email through filter engine
      filterResult = this.filterService.processEmail(email, rules);
    } catch (error) {
      // Handle errors during filtering
      const errorLog = await this.createErrorLog(email, error);
      return {
        processResult: { action: 'passed' },
        log: errorLog,
      };
    }

    // Create process log entry
    const logDto: CreateProcessLogDTO = {
      recipient: email.recipient,
      sender: email.sender,
      senderEmail: email.senderEmail,
      subject: email.subject,
      action: filterResult.action,
      matchedRuleId: filterResult.matchedRule?.id,
      matchedRuleCategory: filterResult.matchedCategory,
    };

    const log = await this.processLogRepository.create(logDto);

    // Update rule's last hit timestamp if a rule was matched
    if (filterResult.matchedRule) {
      await this.ruleRepository.updateLastHitAt(filterResult.matchedRule.id);
    }

    return {
      processResult: toProcessResult(filterResult),
      log,
    };
  }

  /**
   * Create an error log entry when processing fails
   */
  private async createErrorLog(
    email: IncomingEmail,
    error: unknown
  ): Promise<ProcessLog> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    const logDto: CreateProcessLogDTO = {
      recipient: email.recipient,
      sender: email.sender,
      senderEmail: email.senderEmail,
      subject: email.subject,
      action: 'error',
      errorMessage,
    };

    return this.processLogRepository.create(logDto);
  }
}
