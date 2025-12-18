#!/usr/bin/env node
/**
 * Migration script to merge duplicate merchants with same root domain
 * 
 * This script:
 * 1. Finds merchants with domains that resolve to the same root domain
 * 2. Merges them by updating foreign key references
 * 3. Deletes the duplicate merchant records
 * 
 * Usage: node packages/vps-api/scripts/merge-duplicate-merchants.js
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

// Common second-level TLDs that should be treated as part of the TLD
const SECOND_LEVEL_TLDS = new Set([
  'co.uk', 'org.uk', 'me.uk', 'net.uk', 'ac.uk', 'gov.uk', 'ltd.uk', 'plc.uk',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'asn.au', 'id.au',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'ad.jp', 'ed.jp', 'go.jp', 'gr.jp',
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br',
  'co.in', 'net.in', 'org.in', 'gen.in', 'firm.in', 'ind.in',
  'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz', 'school.nz',
  'co.za', 'net.za', 'org.za', 'gov.za', 'edu.za',
  'com.hk', 'net.hk', 'org.hk', 'gov.hk', 'edu.hk', 'idv.hk',
  'com.tw', 'net.tw', 'org.tw', 'gov.tw', 'edu.tw', 'idv.tw',
  'com.sg', 'net.sg', 'org.sg', 'gov.sg', 'edu.sg',
  'co.kr', 'ne.kr', 'or.kr', 'go.kr', 'ac.kr', 're.kr',
  'com.ru', 'net.ru', 'org.ru',
  'com.mx', 'net.mx', 'org.mx', 'gob.mx', 'edu.mx',
  'co.il', 'org.il', 'net.il', 'ac.il', 'gov.il',
  'com.tr', 'net.tr', 'org.tr', 'gov.tr', 'edu.tr',
  'com.my', 'net.my', 'org.my', 'gov.my', 'edu.my',
  'com.ph', 'net.ph', 'org.ph', 'gov.ph', 'edu.ph',
  'co.th', 'in.th', 'ac.th', 'go.th', 'or.th', 'net.th',
  'com.vn', 'net.vn', 'org.vn', 'gov.vn', 'edu.vn',
  'co.id', 'or.id', 'ac.id', 'go.id', 'web.id',
]);

/**
 * Extract root domain from a full domain string
 */
function extractRootDomain(fullDomain) {
  const parts = fullDomain.toLowerCase().split('.');
  
  if (parts.length <= 2) {
    return fullDomain.toLowerCase();
  }
  
  const lastTwo = parts.slice(-2).join('.');
  if (SECOND_LEVEL_TLDS.has(lastTwo)) {
    if (parts.length >= 3) {
      return parts.slice(-3).join('.');
    }
    return fullDomain.toLowerCase();
  }
  
  return parts.slice(-2).join('.');
}

// Database path
const DB_PATH = process.env.DB_PATH || '/var/lib/email-filter/filter.db';

console.log(`Opening database: ${DB_PATH}`);
const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = OFF');

try {
  // Get all merchants
  const merchants = db.prepare('SELECT * FROM merchants ORDER BY created_at ASC').all();
  console.log(`Found ${merchants.length} merchants`);

  // Group merchants by root domain
  const merchantsByRootDomain = new Map();
  
  for (const merchant of merchants) {
    const rootDomain = extractRootDomain(merchant.domain);
    
    if (!merchantsByRootDomain.has(rootDomain)) {
      merchantsByRootDomain.set(rootDomain, []);
    }
    merchantsByRootDomain.get(rootDomain).push(merchant);
  }

  // Find duplicates
  const duplicateGroups = [];
  for (const [rootDomain, group] of merchantsByRootDomain) {
    if (group.length > 1) {
      duplicateGroups.push({ rootDomain, merchants: group });
    }
  }

  if (duplicateGroups.length === 0) {
    console.log('No duplicate merchants found. Nothing to merge.');
    process.exit(0);
  }

  console.log(`\nFound ${duplicateGroups.length} groups of duplicate merchants:`);
  for (const group of duplicateGroups) {
    console.log(`\n  Root domain: ${group.rootDomain}`);
    for (const m of group.merchants) {
      console.log(`    - ${m.domain} (id: ${m.id}, campaigns: ${m.total_campaigns}, emails: ${m.total_emails})`);
    }
  }

  // Start transaction
  const transaction = db.transaction(() => {
    for (const group of duplicateGroups) {
      // Keep the merchant with the root domain, or the oldest one
      let primaryMerchant = group.merchants.find(m => m.domain === group.rootDomain);
      if (!primaryMerchant) {
        // Keep the oldest one (first created)
        primaryMerchant = group.merchants[0];
      }
      
      const duplicateMerchants = group.merchants.filter(m => m.id !== primaryMerchant.id);
      
      console.log(`\nMerging into: ${primaryMerchant.domain} (id: ${primaryMerchant.id})`);
      
      // Update domain to root domain if needed
      if (primaryMerchant.domain !== group.rootDomain) {
        console.log(`  Updating domain from ${primaryMerchant.domain} to ${group.rootDomain}`);
        db.prepare('UPDATE merchants SET domain = ?, updated_at = ? WHERE id = ?')
          .run(group.rootDomain, new Date().toISOString(), primaryMerchant.id);
      }
      
      for (const duplicate of duplicateMerchants) {
        console.log(`  Merging: ${duplicate.domain} (id: ${duplicate.id})`);
        
        // Update campaigns to point to primary merchant
        const campaignResult = db.prepare('UPDATE campaigns SET merchant_id = ? WHERE merchant_id = ?')
          .run(primaryMerchant.id, duplicate.id);
        console.log(`    Updated ${campaignResult.changes} campaigns`);
        
        // Update recipient_paths to point to primary merchant
        const pathResult = db.prepare('UPDATE recipient_paths SET merchant_id = ? WHERE merchant_id = ?')
          .run(primaryMerchant.id, duplicate.id);
        console.log(`    Updated ${pathResult.changes} recipient paths`);
        
        // Delete duplicate merchant
        db.prepare('DELETE FROM merchants WHERE id = ?').run(duplicate.id);
        console.log(`    Deleted merchant: ${duplicate.domain}`);
      }
      
      // Recalculate totals for primary merchant
      const campaignCount = db.prepare('SELECT COUNT(*) as count FROM campaigns WHERE merchant_id = ?')
        .get(primaryMerchant.id).count;
      const emailCount = db.prepare('SELECT COALESCE(SUM(total_emails), 0) as count FROM campaigns WHERE merchant_id = ?')
        .get(primaryMerchant.id).count;
      
      db.prepare('UPDATE merchants SET total_campaigns = ?, total_emails = ?, updated_at = ? WHERE id = ?')
        .run(campaignCount, emailCount, new Date().toISOString(), primaryMerchant.id);
      
      console.log(`  Updated totals: ${campaignCount} campaigns, ${emailCount} emails`);
    }
  });

  transaction();
  
  console.log('\n✅ Migration completed successfully!');
  
  // Show final state
  const finalMerchants = db.prepare('SELECT domain, total_campaigns, total_emails FROM merchants ORDER BY domain').all();
  console.log('\nFinal merchant list:');
  for (const m of finalMerchants) {
    console.log(`  ${m.domain}: ${m.total_campaigns} campaigns, ${m.total_emails} emails`);
  }

} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
} finally {
  db.close();
}
